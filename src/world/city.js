import * as THREE from 'three';
import { heightAt } from './heightmap.js';
import { MeshBuilder, FACE } from './geometry.js';
import {
  asphaltTexture, cobbleTexture, sidewalkTexture, officeTextures, houseFacadeTexture,
} from './textures.js';

export const GRID_X = [-460, -390, -320, -250, -180, -100, 0, 100, 200, 300, 400, 500];
export const GRID_Z = [-480, -380, -280, -180, -80, 20, 120, 220];
const BOKAAP_EDGE = -100;
const CBD_ROAD_W = 14;
const BOKAAP_ROAD_W = 10;

const BOKAAP_COLOURS = [
  '#ef7fa0', '#3fc1b8', '#f4d03f', '#8fd14f', '#a875d1', '#f39c4a', '#5aa9e6', '#e8577a', '#7fe0c4', '#f7e27e',
];
const OFFICE_COLOURS = ['#d9cfbf', '#c9c4bb', '#e6e0d4', '#9fb4c8', '#b8a58a', '#f0ece4', '#8fa3b5', '#d4b896'];

let seed = 1337;
function rand() {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
}
const pick = (arr) => arr[Math.floor(rand() * arr.length)];

function roadWidthAtX(x) {
  return x < BOKAAP_EDGE ? BOKAAP_ROAD_W : CBD_ROAD_W;
}

export const ROADS = [];

function addRoad(points, width, surface, lift) {
  ROADS.push({ points, width, surface, lift });
}

for (const x of GRID_X) {
  const bokaap = x < BOKAAP_EDGE;
  const zMin = [0, 200, 400].includes(x) ? -560 : GRID_Z[0];
  addRoad([[x, zMin], [x, GRID_Z[GRID_Z.length - 1]]], roadWidthAtX(x), bokaap ? 'cobble' : 'asphalt', 0.15);
}
for (const z of GRID_Z) {
  addRoad([[GRID_X[0], z], [BOKAAP_EDGE, z]], BOKAAP_ROAD_W, 'cobble', 0.17);
  addRoad([[BOKAAP_EDGE, z], [GRID_X[GRID_X.length - 1], z]], CBD_ROAD_W, 'asphalt', 0.17);
}
addRoad([[-700, -560], [-300, -575], [200, -560], [700, -575], [1250, -560]], 18, 'asphalt', 0.2);
addRoad(
  [[-460, -230], [-620, -150], [-760, -260], [-900, -120], [-1050, -230], [-1150, -150]],
  9, 'asphalt', 0.22
);
addRoad(
  [[-100, 220], [-150, 500], [-350, 800], [-600, 1000], [-300, 1300], [100, 1700], [300, 1950]],
  10, 'asphalt', 0.22
);

const PARK_BLOCKS = new Set(['6,5']);

export function blockRects() {
  const rects = [];
  for (let i = 0; i < GRID_X.length - 1; i++) {
    for (let j = 0; j < GRID_Z.length - 1; j++) {
      const x0 = GRID_X[i] + roadWidthAtX(GRID_X[i]) / 2;
      const x1 = GRID_X[i + 1] - roadWidthAtX(GRID_X[i + 1]) / 2;
      const zw = GRID_X[i] < BOKAAP_EDGE ? BOKAAP_ROAD_W : CBD_ROAD_W;
      const z0 = GRID_Z[j] + zw / 2;
      const z1 = GRID_Z[j + 1] - zw / 2;
      rects.push({ x0, x1, z0, z1, bokaap: GRID_X[i] < BOKAAP_EDGE, park: PARK_BLOCKS.has(`${i},${j}`), i, j });
    }
  }
  return rects;
}

function buildRoads(builder, road) {
  const step = 4;
  const samples = [];
  const pts = road.points;
  for (let s = 0; s < pts.length - 1; s++) {
    const [ax, az] = pts[s], [bx, bz] = pts[s + 1];
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.ceil(len / step));
    for (let k = 0; k < n; k++) samples.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n]);
  }
  samples.push(pts[pts.length - 1]);
  const half = road.width / 2;
  const vScale = road.surface === 'cobble' ? 1 / 3 : 1 / (road.width * 1.6);
  const uMax = road.surface === 'cobble' ? road.width / 3 : 1;
  let dist = 0;
  const white = new THREE.Color(1, 1, 1);
  const edge = (i) => {
    const prev = samples[Math.max(0, i - 1)], next = samples[Math.min(samples.length - 1, i + 1)];
    let dx = next[0] - prev[0], dz = next[1] - prev[1];
    const l = Math.hypot(dx, dz) || 1;
    dx /= l; dz /= l;
    const [x, z] = samples[i];
    const lx = x + dz * half, lz = z - dx * half;
    const rx = x - dz * half, rz = z + dx * half;
    return [[lx, heightAt(lx, lz) + road.lift, lz], [rx, heightAt(rx, rz) + road.lift, rz]];
  };
  let prevEdge = edge(0);
  for (let i = 1; i < samples.length; i++) {
    const cur = edge(i);
    const segLen = Math.hypot(samples[i][0] - samples[i - 1][0], samples[i][1] - samples[i - 1][1]);
    const v0 = dist * vScale, v1 = (dist + segLen) * vScale;
    dist += segLen;
    builder.quad(
      [prevEdge[0], prevEdge[1], cur[1], cur[0]],
      [0, 1, 0],
      [[0, v0], [uMax, v0], [uMax, v1], [0, v1]],
      white
    );
    prevEdge = cur;
  }
}

function buildSidewalk(builder, r) {
  const lift = 0.3;
  const white = new THREE.Color(1, 1, 1);
  const nx = Math.max(1, Math.ceil((r.x1 - r.x0) / 6));
  const nz = Math.max(1, Math.ceil((r.z1 - r.z0) / 6));
  const P = (x, z) => [x, heightAt(x, z) + lift, z];
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      const xa = r.x0 + ((r.x1 - r.x0) * i) / nx, xb = r.x0 + ((r.x1 - r.x0) * (i + 1)) / nx;
      const za = r.z0 + ((r.z1 - r.z0) * j) / nz, zb = r.z0 + ((r.z1 - r.z0) * (j + 1)) / nz;
      builder.quad(
        [P(xa, zb), P(xb, zb), P(xb, za), P(xa, za)],
        [0, 1, 0],
        [[xa / 3, zb / 3], [xb / 3, zb / 3], [xb / 3, za / 3], [xa / 3, za / 3]],
        white
      );
    }
  }
  const curb = (ax, az, bx, bz, nxv, nzv) => {
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 6));
    for (let k = 0; k < n; k++) {
      const x0 = ax + ((bx - ax) * k) / n, z0 = az + ((bz - az) * k) / n;
      const x1 = ax + ((bx - ax) * (k + 1)) / n, z1 = az + ((bz - az) * (k + 1)) / n;
      const h0 = heightAt(x0, z0), h1 = heightAt(x1, z1);
      builder.quad(
        [[x0, h0, z0], [x1, h1, z1], [x1, h1 + lift, z1], [x0, h0 + lift, z0]],
        [nxv, 0, nzv],
        [[0, 0], [1, 0], [1, 0.1], [0, 0.1]],
        white
      );
    }
  };
  curb(r.x1, r.z0, r.x0, r.z0, 0, -1);
  curb(r.x0, r.z1, r.x1, r.z1, 0, 1);
  curb(r.x0, r.z0, r.x0, r.z1, -1, 0);
  curb(r.x1, r.z1, r.x1, r.z0, 1, 0);
}

function footprintHeights(x0, x1, z0, z1) {
  const hs = [heightAt(x0, z0), heightAt(x1, z0), heightAt(x0, z1), heightAt(x1, z1), heightAt((x0 + x1) / 2, (z0 + z1) / 2)];
  return { min: Math.min(...hs), max: Math.max(...hs) };
}

const FRONT_FACE = { '+x': FACE.PX, '-x': FACE.NX, '+z': FACE.PZ, '-z': FACE.NZ };

function addHouse(builder, colliders, cx, cz, w, d, facing) {
  const alongX = facing === '+z' || facing === '-z';
  const sx = alongX ? w : d, sz = alongX ? d : w;
  const x0 = cx - sx / 2, x1 = cx + sx / 2, z0 = cz - sz / 2, z1 = cz + sz / 2;
  const { min, max } = footprintHeights(x0, x1, z0, z1);
  const height = 5 + rand() * 2;
  const top = max + height;
  const base = min - 1;
  const color = new THREE.Color(pick(BOKAAP_COLOURS));
  const front = FRONT_FACE[facing];
  builder.box(cx, base, cz, sx, top - base, sz, color, (fi) => (fi === front ? [0, (base - max) / height, 1, 1] : null));
  const trim = color.clone().lerp(new THREE.Color('#ffffff'), 0.35);
  const sign = facing[0] === '+' ? 1 : -1;
  const px = alongX ? cx : cx + sign * (sx / 2 - 0.25);
  const pz = alongX ? cz + sign * (sz / 2 - 0.25) : cz;
  builder.box(px, top, pz, alongX ? w : 0.5, 0.9, alongX ? 0.5 : w, trim, null);
  if (rand() < 0.7) builder.box(px, top + 0.9, pz, alongX ? w * 0.4 : 0.5, 0.9, alongX ? 0.5 : w * 0.4, trim, null);
  colliders.push({ minX: x0, maxX: x1, minZ: z0, maxZ: z1 });
}

function addBoKaapBlock(builder, colliders, r) {
  const inset = 1.5, depth = 11;
  const xa = r.x0 + inset, xb = r.x1 - inset, za = r.z0 + inset, zb = r.z1 - inset;
  const row = (start, end, place) => {
    let p = start;
    while (end - p > 4) {
      const w = Math.min(end - p, 6 + rand() * 2.5);
      place(p + w / 2, w);
      p += w;
    }
  };
  row(za, zb, (c, w) => addHouse(builder, colliders, xa + depth / 2, c, w, depth, '-x'));
  row(za, zb, (c, w) => addHouse(builder, colliders, xb - depth / 2, c, w, depth, '+x'));
  row(xa + depth, xb - depth, (c, w) => addHouse(builder, colliders, c, za + depth / 2, w, depth, '-z'));
  row(xa + depth, xb - depth, (c, w) => addHouse(builder, colliders, c, zb - depth / 2, w, depth, '+z'));
}

function addOffice(builder, colliders, x0, x1, z0, z1, height) {
  const { min, max } = footprintHeights(x0, x1, z0, z1);
  const base = min - 1;
  const top = max + height;
  const color = new THREE.Color(pick(OFFICE_COLOURS));
  const bay = 14;
  const groundOffset = (max - base) / bay;
  builder.box((x0 + x1) / 2, base, (z0 + z1) / 2, x1 - x0, top - base, z1 - z0, color,
    (fi, fw, fh) => (fi === FACE.TOP || fi === FACE.BOTTOM ? null : [0, -groundOffset, fw / bay, fh / bay - groundOffset]),
    [0.01, 0.99]);
  if (height > 25) {
    const w = (x1 - x0) * 0.4, d = (z1 - z0) * 0.4;
    builder.box((x0 + x1) / 2, top, (z0 + z1) / 2, w, 3 + rand() * 4, d, color.clone().multiplyScalar(0.8), null, [0.01, 0.99]);
  }
  colliders.push({ minX: x0, maxX: x1, minZ: z0, maxZ: z1 });
}

function addCbdBlock(builder, colliders, r) {
  const inset = 3;
  const xa = r.x0 + inset, xb = r.x1 - inset, za = r.z0 + inset, zb = r.z1 - inset;
  const towerZone = r.x0 > 0 && r.z1 < -200;
  const tall = () => (towerZone ? 35 + rand() * 95 : 10 + rand() * 30);
  if (towerZone && rand() < 0.35) {
    addOffice(builder, colliders, xa + 6, xb - 6, za + 6, zb - 6, 80 + rand() * 60);
    return;
  }
  const mx = (xa + xb) / 2 + (rand() - 0.5) * 16;
  const mz = (za + zb) / 2 + (rand() - 0.5) * 16;
  const gap = 1;
  addOffice(builder, colliders, xa, mx - gap, za, mz - gap, tall());
  addOffice(builder, colliders, mx + gap, xb, za, mz - gap, tall());
  addOffice(builder, colliders, xa, mx - gap, mz + gap, zb, tall());
  addOffice(builder, colliders, mx + gap, xb, mz + gap, zb, tall());
}

export function createCity(scene) {
  const asphalt = new MeshBuilder();
  const cobble = new MeshBuilder();
  const sidewalk = new MeshBuilder();
  const park = new MeshBuilder();
  const houses = new MeshBuilder();
  const offices = new MeshBuilder();
  const colliders = [];

  for (const road of ROADS) buildRoads(road.surface === 'cobble' ? cobble : asphalt, road);
  const blocks = blockRects();
  for (const r of blocks) {
    buildSidewalk(r.park ? park : sidewalk, r);
    if (r.park) continue;
    if (r.bokaap) addBoKaapBlock(houses, colliders, r);
    else addCbdBlock(offices, colliders, r);
  }

  const office = officeTextures();
  const mats = {
    asphalt: new THREE.MeshLambertMaterial({ map: asphaltTexture() }),
    cobble: new THREE.MeshLambertMaterial({ map: cobbleTexture() }),
    sidewalk: new THREE.MeshLambertMaterial({ map: sidewalkTexture() }),
    park: new THREE.MeshLambertMaterial({ color: '#6f8f3a' }),
    houses: new THREE.MeshLambertMaterial({ map: houseFacadeTexture(), vertexColors: true }),
    offices: new THREE.MeshLambertMaterial({
      map: office.map, vertexColors: true, emissiveMap: office.emissive, emissive: 0xffffff, emissiveIntensity: 0,
    }),
  };
  const add = (builder, mat, shadow) => {
    const mesh = new THREE.Mesh(builder.build(), mat);
    mesh.receiveShadow = true;
    mesh.castShadow = shadow;
    scene.add(mesh);
    return mesh;
  };
  add(asphalt, mats.asphalt, false);
  add(cobble, mats.cobble, false);
  add(sidewalk, mats.sidewalk, false);
  add(park, mats.park, false);
  add(houses, mats.houses, true);
  add(offices, mats.offices, true);

  return {
    colliders,
    blocks,
    setWindowGlow(v) {
      mats.offices.emissiveIntensity = v;
    },
  };
}
