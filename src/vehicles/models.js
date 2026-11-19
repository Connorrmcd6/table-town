import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

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
  f.position.set(0, y, front + 0.005);
  const b = new THREE.Mesh(geo, m);
  b.position.set(0, y, back - 0.005);
  b.rotation.y = Math.PI;
  group.add(f, b);
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
    box(g, 0.5, 0.12, 0.26, -0.3, 1.94, 0.15, '#1e4bff', '#1030ff');
    box(g, 0.5, 0.12, 0.26, 0.3, 1.94, 0.15, '#ff2020', '#ff0000');
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

const GOLF_COLOURS = ['#c0392b', '#f1c40f', '#2e86de', '#27ae60', '#ecf0f1', '#8e44ad', '#e67e22', '#34495e'];
const BAKKIE_COLOURS = ['#ecf0f1', '#bdc3c7', '#7f8c8d', '#2c3e50', '#a93226'];
const TAXI_LIVERIES = [['#1f5fbf', '#f2c230'], ['#c0392b', '#f2c230'], ['#2e8b57', '#ffffff'], ['#6c3483', '#f39c12']];

export function makeVehicle(type, rnd = Math.random) {
  const p = (a) => a[Math.floor(rnd() * a.length)];
  if (type === 'taxi') return optimize({ type, ...minibus(rnd, p(TAXI_LIVERIES)) });
  if (type === 'golf') return optimize({ type, ...hatch(rnd, p(GOLF_COLOURS)) });
  if (type === 'bakkie') return optimize({ type, ...bakkie(rnd, p(BAKKIE_COLOURS)) });
  if (type === 'police') return optimize({ type, ...bakkie(rnd, '#f4f4f0', true) });
  throw new Error(`unknown vehicle ${type}`);
}

export function playerTaxi() {
  return optimize({ type: 'taxi', ...minibus(Math.random, ['#1f5fbf', '#f2c230']) });
}
