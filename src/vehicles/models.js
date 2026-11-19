import * as THREE from 'three';

const matCache = new Map();
function mat(color, emissive) {
  const key = `${color}|${emissive || ''}`;
  if (!matCache.has(key)) {
    matCache.set(key, new THREE.MeshLambertMaterial({ color, emissive: emissive || 0x000000 }));
  }
  return matCache.get(key);
}

function box(group, w, h, l, x, y, z, color, emissive) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, l), mat(color, emissive));
  m.position.set(x, y, z);
  m.castShadow = true;
  group.add(m);
  return m;
}

const wheelGeo = new THREE.CylinderGeometry(1, 1, 1, 10);
wheelGeo.rotateZ(Math.PI / 2);

function wheels(group, width, radius, axleFront, axleBack, tyreW = 0.28) {
  const out = { front: [], all: [] };
  for (const [z, front] of [[axleFront, true], [axleBack, false]]) {
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(side * (width / 2 - tyreW / 2 + 0.02), radius, z);
      const tyre = new THREE.Mesh(wheelGeo, mat('#1b1b1b'));
      tyre.scale.set(tyreW, radius, radius);
      const hub = new THREE.Mesh(wheelGeo, mat('#b9b9b9'));
      tyre.add(hub);
      hub.scale.set(1.08, 0.5, 0.5);
      pivot.add(tyre);
      group.add(pivot);
      out.all.push(tyre);
      if (front) out.front.push(pivot);
    }
  }
  return out;
}

function lights(group, width, y, front, back) {
  for (const side of [-1, 1]) {
    box(group, 0.32, 0.18, 0.06, side * (width / 2 - 0.25), y, front, '#fff6d8', '#fff1c0');
    box(group, 0.28, 0.18, 0.06, side * (width / 2 - 0.22), y, back, '#a01818', '#600000');
  }
}

function minibus(livery = ['#1f5fbf', '#f2c230']) {
  const g = new THREE.Group();
  const W = 1.9, L = 5.3;
  box(g, W, 1.55, L, 0, 1.25, 0, '#f4f4f0');
  box(g, W - 0.04, 0.22, L - 0.6, 0, 2.13, -0.25, '#ecece6');
  box(g, W + 0.02, 0.55, L - 1.2, 0, 1.72, -0.35, '#1d2630');
  box(g, W - 0.3, 0.6, 0.04, 0, 1.68, -L / 2 - 0.01, '#1d2630');
  box(g, 0.5, 0.12, 0.04, 0, 1.2, -L / 2 - 0.02, '#c9c9c9');
  const ws = box(g, W - 0.12, 0.75, 0.08, 0, 1.68, L / 2 - 0.32, '#22303c');
  ws.rotation.x = -0.35;
  box(g, W + 0.03, 0.12, L - 0.4, 0, 1.12, 0, livery[0]);
  box(g, W + 0.03, 0.08, L - 0.4, 0, 0.98, 0, livery[1]);
  box(g, W, 0.22, 0.2, 0, 0.62, L / 2, '#333');
  box(g, W, 0.22, 0.2, 0, 0.62, -L / 2, '#333');
  box(g, 0.9, 0.25, 0.04, 0, 1.0, L / 2 + 0.01, '#2a2a2a');
  lights(g, W, 0.92, L / 2 + 0.02, -L / 2 - 0.02);
  box(g, 0.05, 1.1, 0.9, -W / 2 - 0.01, 1.3, 0.3, '#d8d8d2');
  const w = wheels(g, W, 0.36, 1.55, -1.55);
  return { group: g, wheels: w, spec: { length: L, width: W, wheelbase: 3.1, maxSpeed: 36, accel: 7.5, radius: 0.36, mass: 1.6 } };
}

function hatch(color) {
  const g = new THREE.Group();
  const W = 1.62, L = 3.8;
  box(g, W, 0.6, L, 0, 0.62, 0, color);
  box(g, W - 0.08, 0.5, 2.0, 0, 1.17, -0.35, color);
  box(g, W - 0.04, 0.36, 1.9, 0, 1.15, -0.35, '#1d2630');
  box(g, W, 0.16, 0.12, 0, 0.42, L / 2, '#2a2a2a');
  box(g, W, 0.16, 0.12, 0, 0.42, -L / 2, '#2a2a2a');
  lights(g, W, 0.72, L / 2 + 0.01, -L / 2 - 0.01);
  const w = wheels(g, W, 0.3, 1.2, -1.2, 0.22);
  return { group: g, wheels: w, spec: { length: L, width: W, wheelbase: 2.4, maxSpeed: 40, accel: 8.5, radius: 0.3, mass: 1 } };
}

function bakkie(color, police = false) {
  const g = new THREE.Group();
  const W = 1.8, L = 5.0;
  box(g, W, 0.7, L, 0, 0.8, 0, color);
  box(g, W - 0.06, 0.65, 1.7, 0, 1.47, 0.75, color);
  box(g, W - 0.02, 0.4, 1.5, 0, 1.47, 0.75, '#1d2630');
  if (police) {
    box(g, W - 0.06, 0.85, 2.3, 0, 1.57, -1.25, '#f4f4f0');
    box(g, W + 0.03, 0.14, L - 0.3, 0, 0.95, 0, '#1d3f9a');
    box(g, W + 0.03, 0.08, L - 0.3, 0, 0.8, 0, '#f2c230');
    box(g, 0.5, 0.14, 0.3, -0.27, 1.88, 0.75, '#1e4bff', '#1030ff');
    box(g, 0.5, 0.14, 0.3, 0.27, 1.88, 0.75, '#ff2020', '#ff0000');
  } else {
    for (const side of [-1, 1]) box(g, 0.08, 0.35, 2.4, side * (W / 2 - 0.04), 1.32, -1.25, color);
    box(g, W, 0.35, 0.08, 0, 1.32, -L / 2 + 0.04, color);
  }
  box(g, W, 0.18, 0.14, 0, 0.5, L / 2, '#2a2a2a');
  lights(g, W, 0.95, L / 2 + 0.01, -L / 2 - 0.01);
  const w = wheels(g, W, 0.36, 1.6, -1.5);
  return { group: g, wheels: w, spec: { length: L, width: W, wheelbase: 3.1, maxSpeed: 38, accel: 8, radius: 0.36, mass: 1.4 } };
}

const GOLF_COLOURS = ['#c0392b', '#f1c40f', '#2e86de', '#27ae60', '#ecf0f1', '#8e44ad', '#e67e22', '#34495e'];
const BAKKIE_COLOURS = ['#ecf0f1', '#bdc3c7', '#7f8c8d', '#2c3e50', '#a93226'];
const TAXI_LIVERIES = [['#1f5fbf', '#f2c230'], ['#c0392b', '#f2c230'], ['#2e8b57', '#ffffff'], ['#6c3483', '#f39c12']];

export function makeVehicle(type, rnd = Math.random) {
  const p = (a) => a[Math.floor(rnd() * a.length)];
  if (type === 'taxi') return { type, ...minibus(p(TAXI_LIVERIES)) };
  if (type === 'golf') return { type, ...hatch(p(GOLF_COLOURS)) };
  if (type === 'bakkie') return { type, ...bakkie(p(BAKKIE_COLOURS)) };
  if (type === 'police') return { type, ...bakkie('#f4f4f0', true) };
  throw new Error(`unknown vehicle ${type}`);
}

export function playerTaxi() {
  return { type: 'taxi', ...minibus(['#1f5fbf', '#f2c230']) };
}
