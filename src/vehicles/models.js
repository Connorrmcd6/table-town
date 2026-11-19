import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makePerson, randomLook, poseRider } from '../people/person.js';
import { gltfReady, gltfBody } from './gltfVehicles.js';

const matCache = new Map();
function mat(kind, color, emissive) {
  const key = `${kind}|${color}|${emissive || ''}`;
  if (matCache.has(key)) return matCache.get(key);
  let m;
  if (kind === 'paint') m = new THREE.MeshPhongMaterial({ color, shininess: 70, specular: 0x555555 });
  else if (kind === 'glass') m = new THREE.MeshPhongMaterial({ color, shininess: 110, specular: 0x9aa4b0 });
  else m = new THREE.MeshLambertMaterial({ color, emissive: emissive || 0x000000 });
  matCache.set(key, m);
  return m;
}

function addMesh(group, geo, material) {
  const m = new THREE.Mesh(geo, material);
  m.castShadow = true;
  group.add(m);
  return m;
}

function box(group, w, h, l, x, y, z, color, emissive) {
  const m = addMesh(group, new THREE.BoxGeometry(w, h, l), mat('flat', color, emissive));
  m.position.set(x, y, z);
  return m;
}

// Side profile in (z, y) with wheel arches cut into the sill, extruded across the width.
function bodyShape({ rearZ, frontZ, sill, arches, upper }) {
  const s = new THREE.Shape();
  s.moveTo(rearZ, sill);
  for (const { z, r } of [...arches].sort((a, b) => a.z - b.z)) {
    s.lineTo(z - r, sill);
    for (let k = 1; k < 10; k++) {
      const a = Math.PI - (k / 10) * Math.PI;
      s.lineTo(z + r * Math.cos(a), sill + r * Math.sin(a));
    }
    s.lineTo(z + r, sill);
  }
  s.lineTo(frontZ, sill);
  for (const [z, y] of upper) s.lineTo(z, y);
  s.closePath();
  return s;
}

function extrudeAcross(shape, width, bevel) {
  const t = bevel ? 0.05 : 0;
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: width - 2 * t,
    bevelEnabled: bevel,
    bevelThickness: t,
    bevelSize: bevel ? 0.04 : 0,
    bevelSegments: 2,
    curveSegments: 4,
  });
  geo.rotateY(-Math.PI / 2);
  geo.translate((width - 2 * t) / 2, 0, 0);
  geo.computeVertexNormals();
  return geo;
}

function polygon(points) {
  const s = new THREE.Shape();
  points.forEach(([z, y], i) => (i ? s.lineTo(z, y) : s.moveTo(z, y)));
  s.closePath();
  return s;
}

const FLAT = new THREE.MeshLambertMaterial({ vertexColors: true });
const LAMP = new THREE.MeshBasicMaterial({ vertexColors: true });

// Bakes a mesh's transform (and optional flat colour) into a non-indexed geometry with only the given attributes.
function strip(src, matrix, attrs, color) {
  const g = (src.index ? src.toNonIndexed() : src.clone()).applyMatrix4(matrix);
  const out = new THREE.BufferGeometry();
  for (const a of attrs) out.setAttribute(a, g.getAttribute(a));
  if (color) {
    const n = g.getAttribute('position').count;
    const c = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) color.toArray(c, i * 3);
    out.setAttribute('color', new THREE.BufferAttribute(c, 3));
  }
  return out;
}

const wheelCache = new Map();
function wheelGeometry(radius, tyreW, rim) {
  const key = `${radius}|${tyreW}|${rim}`;
  if (wheelCache.has(key)) return wheelCache.get(key);
  const cyl = new THREE.CylinderGeometry(1, 1, 1, 14).rotateZ(Math.PI / 2);
  const part = (sx, sr, color) => strip(cyl, new THREE.Matrix4().makeScale(sx, sr, sr), ['position', 'normal'], new THREE.Color(color));
  const geo = mergeGeometries([
    part(tyreW, radius, '#1b1b1b'),
    part(tyreW * 1.06, radius * 0.62, rim),
    part(tyreW * 1.12, radius * 0.18, '#5a5a5a'),
  ]);
  wheelCache.set(key, geo);
  return geo;
}

function wheels(group, width, radius, axles, tyreW = 0.26, rim = '#b9b9b9') {
  const out = { front: [], all: [] };
  const geo = wheelGeometry(radius, tyreW, rim);
  axles.forEach((z, i) => {
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(side * (width / 2 - tyreW / 2 - 0.02), radius, z);
      const tyre = new THREE.Mesh(geo, FLAT);
      tyre.castShadow = true;
      pivot.add(tyre);
      group.add(pivot);
      out.all.push(tyre);
      if (i === 0) out.front.push(pivot);
    }
  });
  return out;
}

function addSiren(model) {
  const geo = new THREE.BoxGeometry(0.5, 0.12, 0.26);
  model.siren = [[-0.3, '#3a0505'], [0.3, '#0a0f3a']].map(([x, color]) => {
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color }));
    m.position.set(x, 1.94, 0.15);
    model.group.add(m);
    return m;
  });
  return model;
}

// Merge every body part sharing a material so each car is a handful of draw calls.
function optimize(model) {
  const g = model.group;
  const buckets = new Map();
  for (const child of [...g.children]) {
    if (!child.isMesh) continue;
    let material = child.material, color = null;
    let attrs = material.map ? ['position', 'normal', 'uv'] : ['position', 'normal'];
    if (material !== model.brake && material.isMeshLambertMaterial && !material.map) {
      color = material.color;
      material = material.emissive.getHex() ? LAMP : FLAT;
    }
    child.updateMatrix();
    if (!buckets.has(material)) buckets.set(material, []);
    buckets.get(material).push(strip(child.geometry, child.matrix, attrs, color));
    g.remove(child);
  }
  for (const [material, geos] of buckets) {
    const m = new THREE.Mesh(mergeGeometries(geos), material);
    m.castShadow = material !== LAMP;
    g.add(m);
  }
  return model;
}

function plateTexture(text) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 32;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#f4f4f0';
  ctx.fillRect(0, 0, 128, 32);
  ctx.strokeStyle = '#222';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, 126, 30);
  ctx.fillStyle = '#111';
  ctx.font = 'bold 21px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 64, 17);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function plates(group, rnd, y, front, back) {
  const n = () => String(Math.floor(rnd() * 900) + 100);
  const tex = plateTexture(`CA ${n()}-${n()}`);
  const m = new THREE.MeshLambertMaterial({ map: tex });
  const geo = new THREE.PlaneGeometry(0.52, 0.13);
  const f = new THREE.Mesh(geo, m);
  f.position.set(0, y, (front ?? 0) + 0.005);
  const b = new THREE.Mesh(geo, m);
  b.position.set(0, y, back - 0.005);
  b.rotation.y = Math.PI;
  group.add(b);
  if (front !== null) group.add(f);
}

const BRAKE_OFF = { color: new THREE.Color('#8a1414'), emissive: new THREE.Color('#2a0000') };
const BRAKE_ON = { color: new THREE.Color('#ff4a3a'), emissive: new THREE.Color('#ff1a0a') };

function brakeMaterial() {
  return new THREE.MeshLambertMaterial({ color: BRAKE_OFF.color, emissive: BRAKE_OFF.emissive });
}

function tail(group, brake, w, h, x, y, z) {
  const m = addMesh(group, new THREE.BoxGeometry(w, h, 0.05), brake);
  m.position.set(x, y, z);
}

export function setBrakeLights(model, on) {
  if (model.braking === on) return;
  model.braking = on;
  const s = on ? BRAKE_ON : BRAKE_OFF;
  model.brake.color.copy(s.color);
  model.brake.emissive.copy(s.emissive);
}

function lamps(group, brake, width, y, front, back, size = [0.3, 0.16]) {
  for (const side of [-1, 1]) {
    box(group, size[0], size[1], 0.05, side * (width / 2 - size[0] / 2 - 0.08), y, front, '#fff3cf', '#fff1c0');
    tail(group, brake, size[0] * 0.8, size[1], side * (width / 2 - size[0] * 0.4 - 0.06), y, back);
  }
}

function mirrors(group, width, y, z, color) {
  for (const side of [-1, 1]) box(group, 0.14, 0.12, 0.08, side * (width / 2 + 0.08), y, z, color);
}

function pillars(group, width, zs, y0, y1, color) {
  for (const z of zs) {
    const p = addMesh(group, new THREE.BoxGeometry(width + 0.05, y1 - y0, 0.11), mat('paint', color));
    p.position.set(0, (y0 + y1) / 2, z);
  }
}

function minibus(rnd, livery) {
  const g = new THREE.Group();
  const brake = brakeMaterial();
  const W = 1.9, L = 5.3, r = 0.36;
  const paint = '#f2f2ee';
  const shape = bodyShape({
    rearZ: -2.62, frontZ: 2.6, sill: 0.42,
    arches: [{ z: 1.55, r: 0.4 }, { z: -1.55, r: 0.4 }],
    upper: [[2.66, 0.78], [2.63, 1.12], [2.35, 1.35], [1.85, 2.16], [1.62, 2.28], [-2.5, 2.28], [-2.62, 2.15]],
  });
  addMesh(g, extrudeAcross(shape, W, true), mat('paint', paint));
  const glass = polygon([[2.36, 1.47], [1.95, 2.13], [-2.7, 2.13], [-2.7, 1.47]]);
  addMesh(g, extrudeAcross(glass, W + 0.02, false), mat('glass', '#18222c'));
  pillars(g, W, [1.2, 0.2, -0.85, -1.95], 1.45, 2.15, paint);
  box(g, W + 0.03, 0.11, 4.6, 0, 1.18, -0.2, livery[0]);
  box(g, W + 0.03, 0.06, 4.6, 0, 1.06, -0.2, livery[1]);
  box(g, 0.02, 0.95, 0.03, W / 2 + 0.03, 0.95, 0.85, '#7a7a76');
  box(g, 0.02, 0.95, 0.03, W / 2 + 0.03, 0.95, -0.55, '#7a7a76');
  box(g, 0.04, 0.03, 0.9, W / 2 + 0.03, 1.5, 0.15, '#3a3a3a');
  box(g, W + 0.04, 0.26, 0.16, 0, 0.62, 2.68, '#3a3d40');
  box(g, W + 0.04, 0.26, 0.16, 0, 0.62, -2.66, '#3a3d40');
  box(g, 0.95, 0.22, 0.04, 0, 1.02, 2.66, '#222');
  lamps(g, brake, W, 1.0, 2.66, -2.66, [0.32, 0.2]);
  tail(g, brake, 0.4, 0.06, 0, 2.2, -2.66);
  mirrors(g, W, 1.75, 1.95, '#2a2a2a');
  plates(g, rnd, 0.62, 2.77, -2.75);
  const w = wheels(g, W, r, [1.55, -1.55]);
  return { group: g, wheels: w, brake, spec: { length: L, width: W, wheelbase: 3.1, maxSpeed: 44, accel: 9, radius: r, mass: 1.6 } };
}

const SA_FLAG = ['#007a4d', '#ffb612', '#000000', '#ffffff', '#de3831', '#002395'];
let flagDecal = null;

// Gold belt pinstripe plus SA flag ribbons sweeping forward to a point behind the front wheel; u=0 is the nose.
function flagDecalMaterial() {
  if (flagDecal) return flagDecal;
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 160;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#f2b01e';
  ctx.fillRect(0, 14, 1024, 8);
  ctx.fillStyle = '#e07b1a';
  ctx.fillRect(0, 22, 1024, 3);
  ctx.lineCap = 'round';
  const tip = { x: 170, y: 104 };
  SA_FLAG.forEach((colour, i) => {
    const rear = { x: 660 - i * 24, y: 58 + i * 13 };
    ctx.strokeStyle = colour;
    let prev = null;
    for (let k = 0; k <= 60; k++) {
      const t = k / 60;
      const squeeze = t < 0.85 ? 1 : (1 - t) / 0.15;
      const x = rear.x + (tip.x - rear.x) * t;
      const y = rear.y + (tip.y + (i - 2.5) * 9.5 * squeeze - rear.y) * t + Math.sin(t * Math.PI * 2 + i * 0.7) * 9 * (1 - t);
      if (prev) {
        ctx.lineWidth = (t < 0.85 ? 3 + 8 * t : 9.8 * squeeze + 0.5) + (colour === '#000000' ? 0.5 : 0);
        ctx.beginPath();
        ctx.moveTo(prev.x, prev.y);
        ctx.lineTo(x, y);
        ctx.stroke();
      }
      prev = { x, y };
    }
  });
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  flagDecal = new THREE.MeshLambertMaterial({ map, alphaTest: 0.5 });
  return flagDecal;
}

function flagDecals(group) {
  const material = flagDecalMaterial();
  const length = 4.0, height = 0.62;
  for (const side of [-1, 1]) {
    const geo = new THREE.PlaneGeometry(length, height);
    if (side < 0) {
      const uv = geo.getAttribute('uv');
      for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i));
    }
    const m = addMesh(group, geo, material);
    m.castShadow = false;
    m.position.set(side * 0.982, 0.9, -0.35);
    m.rotation.y = side * Math.PI / 2;
  }
}

function hiace(rnd) {
  const g = new THREE.Group();
  const brake = brakeMaterial();
  const W = 1.94, L = 5.3;
  flagDecals(g);
  for (const side of [-1, 1]) tail(g, brake, 0.13, 0.5, side * 0.885, 1.05, -2.6);
  plates(g, rnd, 0.62, 2.72, -2.72);
  const model = optimize({ group: g, brake });
  const { wheels: w, radius, wheelbase } = gltfBody('hiace', g);
  return { ...model, wheels: w, spec: { length: L, width: W, wheelbase, maxSpeed: 44, accel: 9, radius, mass: 1.6 } };
}

function golfGti(rnd, color) {
  const g = new THREE.Group();
  const brake = brakeMaterial();
  plates(g, rnd, 0.66, null, -1.83);
  const model = optimize({ group: g, brake });
  const { wheels: w, radius, wheelbase } = gltfBody('golf', g, { paint: mat('paint', color), brake });
  return { ...model, wheels: w, spec: { length: 3.82, width: 1.62, wheelbase, maxSpeed: 46, accel: 10, radius, mass: 1 } };
}

function ranger(rnd) {
  const g = new THREE.Group();
  const brake = brakeMaterial();
  for (const side of [-1, 1]) tail(g, brake, 0.11, 0.32, side * 0.8, 1.15, -2.665);
  plates(g, rnd, 0.68, null, -2.7);
  const model = optimize({ group: g, brake });
  const { wheels: w, radius, wheelbase } = gltfBody('ranger', g);
  return { ...model, wheels: w, spec: { length: 5.38, width: 2.03, wheelbase, maxSpeed: 100, accel: 15, drag: 0.0004, radius, mass: 1.6, steerScale: 0.9 } };
}

function sixty60(rnd) {
  const g = new THREE.Group();
  const brake = brakeMaterial();
  const { wheels: w, radius, wheelbase, seat } = gltfBody('sixty60', g, { brake });
  return {
    group: g, wheels: w, brake,
    spec: { length: 1.95, width: 0.8, wheelbase, maxSpeed: 24, accel: 6.5, radius, mass: 0.35, bike: true, steerScale: 0.6, seat: { y: seat.y, z: seat.z, lean: 0.05 } },
  };
}

const taxiBody = (rnd, livery) => (gltfReady('hiace') ? hiace(rnd) : optimize(minibus(rnd, livery)));

function hatch(rnd, color) {
  const g = new THREE.Group();
  const brake = brakeMaterial();
  const W = 1.62, L = 3.82, r = 0.29;
  const shape = bodyShape({
    rearZ: -1.9, frontZ: 1.9, sill: 0.3,
    arches: [{ z: 1.2, r: 0.34 }, { z: -1.2, r: 0.34 }],
    upper: [[1.94, 0.6], [1.9, 0.8], [0.8, 0.9], [0.15, 1.4], [-1.35, 1.42], [-1.82, 0.98], [-1.92, 0.85]],
  });
  addMesh(g, extrudeAcross(shape, W, true), mat('paint', color));
  const glass = polygon([[0.77, 1.0], [0.3, 1.37], [-1.4, 1.37], [-1.88, 0.98]]);
  addMesh(g, extrudeAcross(glass, W + 0.02, false), mat('glass', '#18222c'));
  pillars(g, W, [-0.3], 0.98, 1.37, color);
  const c = addMesh(g, new THREE.BoxGeometry(W + 0.05, 0.36, 0.34), mat('paint', color));
  c.position.set(0, 1.18, -1.15);
  box(g, W + 0.02, 0.15, 0.14, 0, 0.42, 1.95, '#2b2b2b');
  box(g, W + 0.02, 0.15, 0.14, 0, 0.42, -1.95, '#2b2b2b');
  box(g, 0.9, 0.16, 0.04, 0, 0.72, 1.93, '#1e1e1e');
  for (const side of [-1, 1]) {
    const hl = addMesh(g, new THREE.CylinderGeometry(0.1, 0.1, 0.05, 10), mat('flat', '#fff3cf', '#fff1c0'));
    hl.rotation.x = Math.PI / 2;
    hl.position.set(side * 0.58, 0.72, 1.94);
  }
  tail(g, brake, 0.24, 0.14, -0.6, 0.72, -1.94);
  tail(g, brake, 0.24, 0.14, 0.6, 0.72, -1.94);
  mirrors(g, W, 1.02, 0.65, '#222');
  plates(g, rnd, 0.42, 2.03, -2.03);
  const w = wheels(g, W, r, [1.2, -1.2], 0.2);
  return { group: g, wheels: w, brake, spec: { length: L, width: W, wheelbase: 2.4, maxSpeed: 46, accel: 10, radius: r, mass: 1 } };
}

function bakkie(rnd, color, police = false) {
  const g = new THREE.Group();
  const brake = brakeMaterial();
  const W = 1.8, L = 5.0, r = 0.37;
  const shape = bodyShape({
    rearZ: -2.5, frontZ: 2.48, sill: 0.42,
    arches: [{ z: 1.55, r: 0.41 }, { z: -1.5, r: 0.41 }],
    upper: [[2.53, 0.8], [2.45, 1.05], [1.2, 1.15], [0.55, 1.78], [-0.3, 1.8], [-0.38, 1.15], [-0.38, 0.85], [-2.5, 0.85]],
  });
  addMesh(g, extrudeAcross(shape, W, true), mat('paint', color));
  const glass = polygon([[1.18, 1.22], [0.69, 1.73], [-0.37, 1.73], [-0.45, 1.2]]);
  addMesh(g, extrudeAcross(glass, W + 0.02, false), mat('glass', '#18222c'));
  pillars(g, W, [-0.12], 1.2, 1.73, color);
  if (police) {
    const canopy = addMesh(g, new THREE.BoxGeometry(W - 0.04, 0.9, 2.1), mat('paint', '#f4f4f0'));
    canopy.position.set(0, 1.3, -1.45);
    box(g, W - 0.02, 0.32, 1.7, 0, 1.45, -1.4, '#18222c');
    box(g, W + 0.03, 0.12, 4.6, 0, 0.98, 0, '#1d3f9a');
    box(g, W + 0.03, 0.06, 4.6, 0, 0.88, 0, '#f2c230');
    box(g, 1.2, 0.12, 0.28, 0, 1.86, 0.15, '#222');
  } else {
    for (const side of [-1, 1]) {
      const wall = addMesh(g, new THREE.BoxGeometry(0.07, 0.34, 2.12), mat('paint', color));
      wall.position.set(side * (W / 2 - 0.04), 1.02, -1.44);
    }
    const tail = addMesh(g, new THREE.BoxGeometry(W - 0.02, 0.34, 0.07), mat('paint', color));
    tail.position.set(0, 1.02, -2.47);
    box(g, W - 0.16, 0.02, 2.0, 0, 0.86, -1.44, '#2e2e2e');
  }
  box(g, W + 0.04, 0.2, 0.16, 0, 0.58, 2.55, '#9a9a9a');
  box(g, W + 0.04, 0.2, 0.16, 0, 0.58, -2.55, '#3a3a3a');
  box(g, 1.0, 0.24, 0.04, 0, 0.9, 2.5, '#1e1e1e');
  lamps(g, brake, W, 0.9, 2.5, -2.53, [0.3, 0.18]);
  mirrors(g, W, 1.32, 1.05, '#222');
  plates(g, rnd, 0.58, 2.64, -2.64);
  const w = wheels(g, W, r, [1.55, -1.5], 0.28, police ? '#d0d0d0' : '#8f8f8f');
  return { group: g, wheels: w, brake, spec: { length: L, width: W, wheelbase: 3.1, maxSpeed: 45, accel: 9.5, radius: r, mass: 1.4 } };
}

function bikeWheels(group, radius, frontZ, rearZ, tyreW, rim) {
  const geo = wheelGeometry(radius, tyreW, rim);
  const pivot = new THREE.Group();
  pivot.position.set(0, 0, frontZ);
  const front = new THREE.Mesh(geo, FLAT);
  front.position.y = radius;
  front.castShadow = true;
  pivot.add(front);
  const rear = new THREE.Mesh(geo, FLAT);
  rear.position.set(0, radius, rearZ);
  rear.castShadow = true;
  group.add(pivot, rear);
  return { pivot, wheels: { front: [pivot], all: [front, rear] } };
}

function deliveryTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 96;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#1f8a3a';
  ctx.fillRect(0, 0, 128, 96);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 26px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('SIXTY', 64, 40);
  ctx.font = 'bold 22px Arial, sans-serif';
  ctx.fillText('-ish', 64, 64);
  ctx.font = '11px Arial, sans-serif';
  ctx.fillText('delivered eventually', 64, 84);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
let deliveryMat = null;

function scooter(rnd) {
  const g = new THREE.Group();
  const brake = brakeMaterial();
  const green = '#1f8a3a';
  const r = 0.24;
  addMesh(g, extrudeAcross(polygon([[-0.75, 0.32], [0.05, 0.32], [0.12, 0.52], [-0.1, 0.62], [-0.62, 0.66], [-0.8, 0.5]]), 0.42, true), mat('paint', green));
  addMesh(g, extrudeAcross(polygon([[0.2, 0.32], [0.45, 0.32], [0.6, 0.9], [0.5, 1.0], [0.38, 0.95], [0.28, 0.5]]), 0.44, true), mat('paint', green));
  box(g, 0.36, 0.08, 0.6, 0, 0.3, 0.0, '#2a2a2a');
  box(g, 0.3, 0.08, 0.55, 0, 0.7, -0.32, '#1b1b1b');
  box(g, 0.4, 0.04, 0.4, 0, 0.74, -0.62, '#3a3a3a');
  deliveryMat = deliveryMat || new THREE.MeshLambertMaterial({ map: deliveryTexture() });
  const crate = addMesh(g, new THREE.BoxGeometry(0.48, 0.42, 0.45), deliveryMat);
  crate.position.set(0, 0.98, -0.62);
  tail(g, brake, 0.12, 0.06, 0, 0.62, -0.82);
  const { pivot, wheels: w } = bikeWheels(g, r, 0.62, -0.6, 0.12, '#bdbdbd');
  const fork = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.75, 0.05), mat('flat', '#3a3a3a'));
  fork.position.set(0, 0.62, -0.08);
  fork.rotation.x = -0.3;
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.05, 0.05), mat('flat', '#222'));
  bar.position.set(0, 1.05, -0.18);
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.09, 0.04), LAMP_MAT);
  lamp.position.set(0, 0.98, -0.02);
  pivot.add(fork, bar, lamp);
  plates(g, rnd, 0.55, null, -0.84);
  return {
    group: g, wheels: w, brake,
    spec: { length: 1.95, width: 0.8, wheelbase: 1.22, maxSpeed: 24, accel: 6.5, radius: r, mass: 0.35, bike: true, steerScale: 0.6, seat: { y: 0.74, z: -0.3, lean: 0.05 } },
  };
}

function superbike(rnd, [paint, trim]) {
  const g = new THREE.Group();
  const brake = brakeMaterial();
  const r = 0.31;
  addMesh(g, extrudeAcross(polygon([[-0.1, 0.46], [0.38, 0.42], [0.58, 0.62], [0.95, 0.8], [0.92, 0.94], [0.7, 1.06], [0.48, 1.02]]), 0.42, true), mat('paint', paint));
  addMesh(g, extrudeAcross(polygon([[0.5, 0.98], [0.2, 1.1], [-0.28, 1.02], [-0.32, 0.82], [0.0, 0.8], [0.45, 0.86]]), 0.36, true), mat('paint', paint));
  addMesh(g, extrudeAcross(polygon([[-0.3, 0.8], [-0.25, 0.94], [-1.0, 1.1], [-1.1, 1.03], [-0.85, 0.86]]), 0.28, true), mat('paint', trim));
  box(g, 0.44, 0.04, 0.5, 0, 0.72, 0.62, trim);
  box(g, 0.28, 0.06, 0.42, 0, 0.97, -0.42, '#1b1b1b');
  const screen = addMesh(g, new THREE.BoxGeometry(0.3, 0.22, 0.03), mat('glass', '#2a3644'));
  screen.position.set(0, 1.12, 0.62);
  screen.rotation.x = -0.65;
  box(g, 0.34, 0.32, 0.45, 0, 0.5, 0.02, '#2a2a2a');
  box(g, 0.12, 0.12, 0.55, 0.19, 0.55, -0.62, '#c8c8c8');
  for (const x of [-0.13, 0.13]) box(g, 0.06, 0.08, 0.6, x, 0.36, -0.42, '#2a2a2a');
  box(g, 0.22, 0.08, 0.05, 0, 0.86, 0.95, '#fff3cf', '#fff1c0');
  tail(g, brake, 0.18, 0.05, 0, 1.02, -1.12);
  const { pivot, wheels: w } = bikeWheels(g, r, 0.8, -0.66, 0.2, '#5c5c5c');
  for (const x of [-0.1, 0.1]) {
    const tube = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.8, 0.05), mat('flat', '#c8a84a'));
    tube.position.set(x, 0.68, -0.14);
    tube.rotation.x = -0.42;
    pivot.add(tube);
  }
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.04, 0.04), mat('flat', '#222'));
  bar.position.set(0, 1.02, -0.3);
  pivot.add(bar);
  plates(g, rnd, 0.82, null, -1.14);
  return {
    group: g, wheels: w, brake,
    spec: { length: 2.1, width: 0.8, wheelbase: 1.42, maxSpeed: 100, accel: 15, drag: 0.00042, radius: r, mass: 0.45, bike: true, steerScale: 0.5, seat: { y: 0.97, z: -0.42, lean: 0.55 } },
  };
}

function sportsCar(rnd, color) {
  const g = new THREE.Group();
  const brake = brakeMaterial();
  const W = 1.88, L = 4.45, r = 0.33;
  const shape = bodyShape({
    rearZ: -2.2, frontZ: 2.2, sill: 0.28,
    arches: [{ z: 1.38, r: 0.38 }, { z: -1.32, r: 0.38 }],
    upper: [[2.27, 0.44], [2.28, 0.62], [2.1, 0.72], [0.9, 0.92], [0.15, 1.2], [-0.55, 1.22], [-1.6, 1.0], [-2.2, 0.94], [-2.25, 0.6]],
  });
  addMesh(g, extrudeAcross(shape, W, true), mat('paint', color));
  const glass = polygon([[0.85, 1.0], [0.28, 1.18], [-0.6, 1.18], [-1.55, 1.04], [-1.5, 0.98]]);
  addMesh(g, extrudeAcross(glass, W - 0.14, false), mat('glass', '#141c24'));
  pillars(g, W - 0.12, [-0.15], 0.98, 1.18, color);
  box(g, W - 0.1, 0.05, 0.32, 0, 1.08, -2.08, '#1b1b1b');
  for (const x of [-0.7, 0.7]) box(g, 0.06, 0.12, 0.06, x, 1.0, -2.08, '#1b1b1b');
  for (const side of [-1, 1]) box(g, 0.04, 0.16, 0.5, side * (W / 2 + 0.01), 0.55, -0.4, '#1b1b1b');
  box(g, W + 0.02, 0.12, 0.12, 0, 0.32, 2.24, '#1b1b1b');
  box(g, 0.9, 0.1, 0.04, 0, 0.45, 2.27, '#141414');
  for (const side of [-1, 1]) {
    box(g, 0.42, 0.07, 0.05, side * 0.62, 0.66, 2.2, '#fff3cf', '#fff1c0');
    tail(g, brake, 0.5, 0.07, side * 0.55, 0.8, -2.24);
  }
  mirrors(g, W, 0.98, 0.65, color);
  plates(g, rnd, 0.5, 2.28, -2.27);
  const w = wheels(g, W, r, [1.38, -1.32], 0.3, '#c8c8c8');
  return { group: g, wheels: w, brake, spec: { length: L, width: W, wheelbase: 2.7, maxSpeed: 100, accel: 15, drag: 0.0004, radius: r, mass: 1.1, steerScale: 0.9 } };
}

const LAMP_MAT = new THREE.MeshBasicMaterial({ color: '#fff3cf' });

function addRider(model, rnd) {
  const person = makePerson(randomLook(rnd));
  seatRider(model, person);
  model.rider = person;
  return model;
}

// Sit a person on a bike's saddle in a riding crouch.
export function seatRider(model, person) {
  const seat = model.spec.seat;
  poseRider(person, seat.lean);
  const s = person.group.scale.x;
  person.group.position.set(0, seat.y - 0.94 * s + 0.04, seat.z);
  person.group.rotation.set(0, 0, 0);
  model.group.add(person.group);
}

const SPORTS_COLOURS = ['#c0392b', '#f1c40f', '#1b1b1b', '#ecf0f1', '#2e86de', '#e67e22', '#16a085'];
const BIKE_LIVERIES = [['#c0392b', '#1b1b1b'], ['#1d4fa8', '#ecf0f1'], ['#f1c40f', '#1b1b1b'], ['#2e9e3a', '#1b1b1b'], ['#1b1b1b', '#c0392b']];

const GOLF_COLOURS = ['#c0392b', '#f1c40f', '#2e86de', '#27ae60', '#ecf0f1', '#8e44ad', '#e67e22', '#34495e'];
const BAKKIE_COLOURS = ['#ecf0f1', '#bdc3c7', '#7f8c8d', '#2c3e50', '#a93226'];
const TAXI_LIVERIES = [['#1f5fbf', '#f2c230'], ['#c0392b', '#f2c230'], ['#2e8b57', '#ffffff'], ['#6c3483', '#f39c12']];

const maybeRider = (model, rnd, opts) => (opts.rider ? addRider(model, rnd) : model);

export function makeVehicle(type, rnd = Math.random, opts = { rider: true }) {
  const p = (a) => a[Math.floor(rnd() * a.length)];
  if (type === 'taxi') return { type, ...taxiBody(rnd, p(TAXI_LIVERIES)) };
  if (type === 'golf') return gltfReady('golf') ? { type, ...golfGti(rnd, p(GOLF_COLOURS)) } : optimize({ type, ...hatch(rnd, p(GOLF_COLOURS)) });
  if (type === 'bakkie') return optimize({ type, ...bakkie(rnd, p(BAKKIE_COLOURS)) });
  if (type === 'police') return addSiren(optimize({ type, ...bakkie(rnd, '#f4f4f0', true) }));
  if (type === 'scooter') return maybeRider(gltfReady('sixty60') ? { type, ...sixty60(rnd) } : optimize({ type, ...scooter(rnd) }), rnd, opts);
  if (type === 'superbike') return maybeRider(optimize({ type, ...superbike(rnd, p(BIKE_LIVERIES)) }), rnd, opts);
  if (type === 'sports') return gltfReady('ranger') ? { type, ...ranger(rnd) } : optimize({ type, ...sportsCar(rnd, p(SPORTS_COLOURS)) });
  throw new Error(`unknown vehicle ${type}`);
}

export function playerTaxi() {
  return { type: 'taxi', ...taxiBody(Math.random, ['#1f5fbf', '#f2c230']) };
}
