import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { heightAt, atlanticLine, atlanticShore, w as toWorld } from './heightmap.js';
import { MeshBuilder, FACE } from './geometry.js';
import { footprintHeights } from './houses.js';
import { officeTextures } from './textures.js';

let seed = 2718;
function rand() {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
}
const pick = (a) => a[Math.floor(rand() * a.length)];

// A point `off` raw metres inland from the smoothed Atlantic shoreline at raw z, with the shoreline's local direction.
function along(rawZ, off) {
  const z = toWorld(rawZ), x = atlanticLine(z) + toWorld(off);
  const ahead = atlanticLine(z + 1) - atlanticLine(z - 1);
  const len = Math.hypot(ahead, 2);
  return { x, z, dx: ahead / len, dz: 2 / len };
}

const overlaps = (colliders, x0, x1, z0, z1) => colliders.some((c) => c.maxX > x0 && c.minX < x1 && c.maxZ > z0 && c.minZ < z1);

// A paved strip draped on the terrain, following the shoreline between two raw z values.
function promenade(builder, z0, z1, off, width, color) {
  const c = new THREE.Color(color);
  let prev = null;
  for (let rz = z0; rz <= z1; rz += 6) {
    const p = along(rz, off);
    const nx = p.dz, nz = -p.dx;
    const l = [p.x - nx * width / 2, p.z - nz * width / 2], r = [p.x + nx * width / 2, p.z + nz * width / 2];
    const cur = [[l[0], heightAt(l[0], l[1]) + 0.12, l[1]], [r[0], heightAt(r[0], r[1]) + 0.12, r[1]]];
    if (prev) builder.quad([prev[0], prev[1], cur[1], cur[0]], [0, 1, 0], [[0.02, 0.5], [0.02, 0.5], [0.02, 0.5], [0.02, 0.5]], c);
    prev = cur;
  }
}

// Short walkable rects strung along a shore-following line, so pedestrians stroll the promenade or the sand.
function strollRects(z0, z1, off, width, out) {
  for (let rz = z0; rz < z1; rz += 30) {
    const a = along(rz, off), b = along(rz + 30, off);
    const pad = width / 2;
    out.push({ x0: Math.min(a.x, b.x) - pad, x1: Math.max(a.x, b.x) + pad, z0: a.z, z1: b.z });
  }
}

function boxGeo(w, h, d, color, x, y, z, rotY) {
  const g = new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0).rotateY(rotY).translate(x, y, z).toNonIndexed();
  const n = g.getAttribute('position').count, col = new Float32Array(n * 3);
  const c = new THREE.Color(color);
  for (let i = 0; i < n; i++) c.toArray(col, i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.deleteAttribute('uv');
  return g;
}

// Sea Point: a wall of apartment blocks behind Beach Road, facing the sea.
function seaPointFlats(flats, colliders) {
  const tones = ['#f4f1ea', '#ece4d4', '#e2ddd2', '#d6dde2', '#f1e6cf'];
  for (let rz = -230; rz < 860; rz += 46 + rand() * 20) {
    const p = along(rz, 95 + 7.7 + 28);
    const w = 16 + rand() * 10, d = 20 + rand() * 14;
    const x0 = p.x - 4, x1 = p.x - 4 + w, z0 = p.z - d / 2, z1 = p.z + d / 2;
    if (overlaps(colliders, x0, x1, z0, z1)) continue;
    const { min, max } = footprintHeights(x0, x1, z0, z1);
    const base = min - 1, top = max + 18 + rand() * 30;
    const bay = 14, ground = (max - base) / bay;
    flats.box((x0 + x1) / 2, base, (z0 + z1) / 2, w, top - base, d, new THREE.Color(pick(tones)),
      (fi, fw, fh) => (fi === FACE.TOP || fi === FACE.BOTTOM ? null : [0, -ground, fw / bay, fh / bay - ground]), [0.01, 0.99]);
    colliders.push({ minX: x0, maxX: x1, minZ: z0, maxZ: z1, top });
  }
}

// Camps Bay's Strip: low restaurants and shops facing the beach across Victoria Road, under striped awnings.
function campsBayStrip(parts, colliders) {
  const walls = ['#f4f1ea', '#efe6d2', '#e9eef0', '#f6efe0'];
  const awnings = ['#2e86de', '#c0392b', '#16a085', '#f1c40f', '#e67e22', '#1b1b1b'];
  for (let rz = 1720; rz < 2010; rz += 22 + rand() * 6) {
    const p = along(rz, 190);
    const nx = p.dz, nz = -p.dx;
    const setback = 7.5 + 3 + 6;
    const x = p.x + nx * setback, z = p.z + nz * setback;
    const w = 13 + rand() * 4, d = 12, h = 6.5 + rand() * 4;
    const rot = Math.atan2(-nx, -nz);
    const r = Math.max(w, d) * 0.36;
    if (overlaps(colliders, x - r, x + r, z - r, z + r)) continue;
    const y = Math.min(heightAt(x, z), heightAt(x - nx * 6, z - nz * 6)) - 0.5;
    parts.push(boxGeo(w, h + 0.5, d, pick(walls), x, y, z, rot));
    parts.push(boxGeo(w + 0.4, 0.5, d + 0.4, '#d9d2c4', x, y + h + 0.5, z, rot));
    const fx = x - nx * (d / 2 + 1.2), fz = z - nz * (d / 2 + 1.2);
    parts.push(boxGeo(w - 1, 0.25, 2.6, pick(awnings), fx, y + 3.2, fz, rot));
    parts.push(boxGeo(w - 2, 1.6, 0.2, '#22303a', x - nx * (d / 2 + 0.05), y + 1.1, z - nz * (d / 2 + 0.05), rot));
    colliders.push({ minX: x - r, maxX: x + r, minZ: z - r, maxZ: z + r, top: y + h + 1 });
  }
}

// White cube villas with pools stepping up the slope behind Camps Bay.
function campsBayVillas(parts, colliders, roads) {
  let placed = 0;
  for (let tries = 0; tries < 3000 && placed < 160; tries++) {
    const rz = 1620 + rand() * 560, off = 215 + rand() * 560;
    const p = along(rz, off);
    const w = 11 + rand() * 6, d = 9 + rand() * 5;
    const x0 = p.x - w / 2, x1 = p.x + w / 2, z0 = p.z - d / 2, z1 = p.z + d / 2;
    const { min, max } = footprintHeights(x0 - 4, x1, z0, z1);
    if (max - min > 14 || roads.clearance(p.x, p.z) < Math.max(w, d) / 2 + 3) continue;
    if (overlaps(colliders, x0 - 5, x1 + 1, z0 - 1, z1 + 1)) continue;
    const storeys = 1 + Math.floor(rand() * 2);
    const top = max + 3.4 * storeys;
    parts.push(boxGeo(w, top - min + 1, d, rand() < 0.8 ? '#f6f4ef' : '#e8e1d3', p.x, min - 1, p.z, 0));
    parts.push(boxGeo(w + 0.6, 0.35, d + 0.6, '#5d6166', p.x, top, p.z, 0));
    parts.push(boxGeo(0.12, 1.8 * storeys, d - 2, '#22303a', x0 - 0.04, max + 0.6, p.z, 0));
    parts.push(boxGeo(3.4, 0.25, d - 2, '#3fb6d8', x0 - 2.4, heightAt(x0 - 2.4, p.z) + 0.05, p.z, 0));
    colliders.push({ minX: x0, maxX: x1, minZ: z0, maxZ: z1, top: top + 0.35 });
    placed++;
  }
}

function palmSpots(z0, z1, off, step, out, roads) {
  for (let rz = z0; rz <= z1; rz += step) {
    const p = along(rz, off);
    if (roads.clearance(p.x, p.z) > 1.5) out.push([p.x, heightAt(p.x, p.z), p.z]);
  }
}

// Granite boulders: piled between Clifton's coves and strewn along the rocky Sea Point shore.
function boulderSpots() {
  const out = [];
  for (const [rz, n] of [[1375, 9], [1484, 9], [1592, 11], [1268, 6], [2040, 8]]) {
    const z = toWorld(rz), x = atlanticShore(z);
    for (let i = 0; i < n; i++) {
      const bx = x + (rand() - 0.6) * 18, bz = z + (rand() - 0.5) * 14;
      out.push([bx, heightAt(bx, bz), bz, 1.6 + rand() * 3.4]);
    }
  }
  for (let rz = -250; rz < 1200; rz += 18) {
    const z = toWorld(rz + rand() * 10), x = atlanticShore(z) + (rand() - 0.3) * 6;
    out.push([x, heightAt(x, z), z, 0.8 + rand() * 1.8]);
  }
  return out;
}

function lifeguardTower(parts, colliders) {
  const p = along(1840, 95);
  const y = heightAt(p.x, p.z);
  for (const [ox, oz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) parts.push(boxGeo(0.18, 3, 0.18, '#f4f1ea', p.x + ox * 1.1, y, p.z + oz * 1.1, 0));
  parts.push(boxGeo(2.8, 1.6, 2.8, '#c0392b', p.x, y + 3, p.z, 0));
  parts.push(boxGeo(3.2, 0.2, 3.2, '#f4f1ea', p.x, y + 4.6, p.z, 0));
  colliders.push({ minX: p.x - 1.4, maxX: p.x + 1.4, minZ: p.z - 1.4, maxZ: p.z + 1.4, top: y + 4.8 });
}

export function createSeaboard(scene, colliders, roads) {
  const paving = new MeshBuilder();
  promenade(paving, -250, 880, 52, 6, '#cfc8b8');
  promenade(paving, 1690, 2040, 176, 5, '#d8cfbd');

  const office = officeTextures();
  const flatsMat = new THREE.MeshLambertMaterial({ map: office.map, vertexColors: true, emissiveMap: office.emissive, emissive: 0xffffff, emissiveIntensity: 0 });
  const flats = new MeshBuilder();
  seaPointFlats(flats, colliders);

  const parts = [];
  campsBayStrip(parts, colliders);
  campsBayVillas(parts, colliders, roads);
  lifeguardTower(parts, colliders);

  const solid = new THREE.MeshLambertMaterial({ vertexColors: true });
  for (const [geo, mat, shadow] of [[paving.build(), solid, false], [flats.build(), flatsMat, true], [mergeGeometries(parts), solid, true]]) {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.castShadow = shadow;
    scene.add(mesh);
  }

  const palms = [];
  palmSpots(1700, 2030, 171, 14, palms, roads);
  palmSpots(-200, 860, 40, 26, palms, roads);
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.36, 10, 5).translate(0, 5, 0);
  const frondGeo = new THREE.ConeGeometry(3.6, 2, 7).translate(0, 10, 0);
  const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshLambertMaterial({ color: '#7a6248' }), palms.length);
  const fronds = new THREE.InstancedMesh(frondGeo, new THREE.MeshLambertMaterial({ color: '#4f7a2e' }), palms.length);
  const m = new THREE.Matrix4();
  palms.forEach(([x, y, z], i) => {
    m.makeScale(1, 0.85 + rand() * 0.3, 1).setPosition(x, y, z);
    trunks.setMatrixAt(i, m);
    fronds.setMatrixAt(i, m);
    colliders.push({ minX: x - 0.4, maxX: x + 0.4, minZ: z - 0.4, maxZ: z + 0.4 });
  });
  trunks.castShadow = fronds.castShadow = true;
  scene.add(trunks, fronds);

  const rocks = boulderSpots();
  const rockMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ color: '#8f8a82', flatShading: true }), rocks.length);
  rocks.forEach(([x, y, z, s], i) => {
    m.makeRotationY(rand() * 6).scale(new THREE.Vector3(s, s * (0.6 + rand() * 0.3), s * (0.8 + rand() * 0.4))).setPosition(x, y - s * 0.25, z);
    rockMesh.setMatrixAt(i, m);
    if (s > 2.2) colliders.push({ minX: x - s * 0.7, maxX: x + s * 0.7, minZ: z - s * 0.7, maxZ: z + s * 0.7, top: y + s * 0.4 });
  });
  rockMesh.castShadow = rockMesh.receiveShadow = true;
  scene.add(rockMesh);

  const walkRects = [];
  strollRects(-250, 880, 52, 5, walkRects);
  strollRects(1690, 2040, 176, 4, walkRects);
  strollRects(1700, 2010, 110, 30, walkRects);

  return {
    walkRects,
    setWindowGlow(v) {
      flatsMat.emissiveIntensity = v;
    },
  };
}
