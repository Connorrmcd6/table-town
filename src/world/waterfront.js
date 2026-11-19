import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { heightAt, WATERFRONT, w as toWorld } from './heightmap.js';

let seed = 1652;
function rand() {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
}
const pick = (a) => a[Math.floor(rand() * a.length)];
const QUAY = 2.5 * 0.65;

// A box (or other geometry) baked to world space with a flat vertex colour, ready to merge.
function part(geo, color, x, y, z, ry = 0) {
  const g = geo.clone().rotateY(ry).translate(x, y, z);
  const flat = g.index ? g.toNonIndexed() : g;
  const n = flat.getAttribute('position').count, c = new Float32Array(n * 3), col = new THREE.Color(color);
  for (let i = 0; i < n; i++) col.toArray(c, i * 3);
  flat.setAttribute('color', new THREE.BufferAttribute(c, 3));
  if (flat.getAttribute('uv')) flat.deleteAttribute('uv');
  return flat;
}
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0);

// The Clock Tower: red brick with white bands, a clock face on each side and a slate spire.
function clockTower(parts, colliders, x, z) {
  const brick = '#b23a2e', white = '#f2ece0';
  parts.push(part(box(5.6, 4, 5.6), brick, x, QUAY, z));
  parts.push(part(box(6, 0.5, 6), white, x, QUAY + 4, z));
  parts.push(part(box(4.4, 9, 4.4), brick, x, QUAY + 4.5, z));
  parts.push(part(box(4.9, 0.5, 4.9), white, x, QUAY + 13.5, z));
  parts.push(part(box(4.6, 3.4, 4.6), brick, x, QUAY + 14, z));
  parts.push(part(box(5, 0.4, 5), white, x, QUAY + 17.4, z));
  parts.push(part(new THREE.ConeGeometry(3.3, 5.5, 8).translate(0, 2.75, 0), '#3d4a52', x, QUAY + 17.8, z, Math.PI / 8));
  parts.push(part(box(0.25, 1.6, 0.25), '#d4a72c', x, QUAY + 23.3, z));
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    const face = new THREE.CircleGeometry(1.35, 20).translate(0, 0, 2.31);
    parts.push(part(face, '#fbf6e8', x, QUAY + 15.7, z, a));
    parts.push(part(new THREE.BoxGeometry(0.12, 0.95, 0.06).translate(0, 0.4, 2.36), '#151515', x, QUAY + 15.7, z, a));
    parts.push(part(new THREE.BoxGeometry(0.7, 0.12, 0.06).translate(0.3, 0, 2.36), '#151515', x, QUAY + 15.7, z, a));
    parts.push(part(new THREE.BoxGeometry(1.4, 2.4, 0.1).translate(0, 0, 2.86), '#3a2620', x, QUAY + 1.2, z, a));
  }
  colliders.push({ minX: x - 2.8, maxX: x + 2.8, minZ: z - 2.8, maxZ: z + 2.8, top: QUAY + 23 });
}

// A long low shopping centre along the basin, glass on the water side and a red roof line.
function wharf(parts, colliders) {
  const x0 = toWorld(-110), x1 = toWorld(225), z0 = toWorld(-645), z1 = toWorld(-602);
  const w = x1 - x0, d = z1 - z0, x = (x0 + x1) / 2, z = (z0 + z1) / 2;
  parts.push(part(box(w, 9, d), '#e9dcc3', x, QUAY - 0.5, z));
  parts.push(part(box(w + 0.6, 0.8, d + 0.6), '#a5402d', x, QUAY + 8.5, z));
  parts.push(part(box(w - 4, 3, 0.2), '#2b3a45', x, QUAY + 0.6, z0 - 0.05));
  parts.push(part(box(w - 4, 2, 0.2), '#2b3a45', x, QUAY + 4.6, z0 - 0.05));
  for (let i = 0; i < 6; i++) parts.push(part(box(4, 0.3, 3), pick(['#2e86de', '#c0392b', '#16a085', '#f1c40f']), x0 + 10 + i * (w - 20) / 5, QUAY + 3.6, z0 - 1.5));
  colliders.push({ minX: x0, maxX: x1, minZ: z0, maxZ: z1, top: QUAY + 9.3 });
}

// Brick harbour sheds with red corrugated roofs on the quay past the channel.
function sheds(parts, colliders) {
  for (const [rx0, rx1] of [[228, 295], [305, 372]]) {
    const x0 = toWorld(rx0), x1 = toWorld(rx1), z0 = toWorld(-832), z1 = toWorld(-792);
    const x = (x0 + x1) / 2, z = (z0 + z1) / 2, w = x1 - x0, d = z1 - z0;
    parts.push(part(box(w, 7, d), '#9a5b3c', x, QUAY - 0.5, z));
    const roof = new THREE.BoxGeometry(w + 0.8, 0.3, d / 2 + 1.2);
    parts.push(part(roof.clone().rotateX(0.32).translate(0, 7.8, d / 4), '#b8452f', x, QUAY - 0.5, z));
    parts.push(part(roof.clone().rotateX(-0.32).translate(0, 7.8, -d / 4), '#b8452f', x, QUAY - 0.5, z));
    for (let i = 0; i < 3; i++) parts.push(part(box(3.4, 4, 0.2), '#3a2a20', x0 + w * (i + 0.5) / 3, QUAY - 0.2, z1 + 0.05));
    colliders.push({ minX: x0, maxX: x1, minZ: z0, maxZ: z1, top: QUAY + 9 });
  }
}

// Café tables under umbrellas along the basin edge.
function cafes(parts) {
  for (let rx = -100; rx < 120; rx += 16) {
    const x = toWorld(rx + rand() * 6), z = toWorld(-787);
    parts.push(part(new THREE.CylinderGeometry(0.5, 0.5, 0.75, 8).translate(0, 0.375, 0), '#e8e2d6', x, QUAY, z));
    parts.push(part(new THREE.CylinderGeometry(0.05, 0.05, 2.4, 5).translate(0, 1.2, 0), '#444', x, QUAY, z));
    parts.push(part(new THREE.ConeGeometry(1.6, 0.6, 8).translate(0, 2.5, 0), pick(['#f4f1ea', '#c0392b', '#2e86de', '#1b1b1b']), x, QUAY, z));
  }
}

// The big wheel beside the basin, turning slowly with its gondolas kept level.
function createWheel(scene, colliders) {
  const x = toWorld(-215), z = toWorld(-660), base = QUAY, R = 17, hub = base + R + 3;
  const frame = new THREE.MeshLambertMaterial({ color: '#e8e8e8' });
  const legs = new THREE.Group();
  // Two A-frames, one each side of the wheel, leaning in to the hub.
  const spread = 7, len = Math.hypot(spread, hub - base);
  for (const sz of [-1, 1]) {
    for (const sx of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.45, len, 6), frame);
      leg.position.set(sx * 1.6, (hub - base) / 2, (sz * spread) / 2);
      leg.rotation.x = Math.atan2(-sz * spread, hub - base);
      leg.castShadow = true;
      legs.add(leg);
    }
  }
  legs.position.set(x, base, z);
  scene.add(legs);
  const wheel = new THREE.Group();
  const rim = new THREE.Mesh(new THREE.TorusGeometry(R, 0.3, 6, 48), frame);
  const rim2 = rim.clone();
  rim.position.x = 0.9;
  rim2.position.x = -0.9;
  rim.rotation.y = rim2.rotation.y = Math.PI / 2;
  wheel.add(rim, rim2);
  const spokes = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.15, R * 2, 0.15), frame);
    spoke.rotation.x = a;
    spokes.push(spoke);
  }
  wheel.add(...spokes.slice(0, 8));
  wheel.position.set(x, hub, z);
  scene.add(wheel);
  const colours = ['#e74c3c', '#f1c40f', '#3498db', '#2ecc71', '#9b59b6', '#e67e22'];
  const gondolas = Array.from({ length: 16 }, (_, i) => {
    const g = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.8, 1.6), new THREE.MeshLambertMaterial({ color: colours[i % colours.length] }));
    g.castShadow = true;
    scene.add(g);
    return g;
  });
  colliders.push({ minX: x - 2.5, maxX: x + 2.5, minZ: z - 8, maxZ: z + 8, top: base + 1 });
  let angle = 0;
  return (dt) => {
    angle += dt * 0.06;
    wheel.rotation.x = angle;
    gondolas.forEach((g, i) => {
      const a = angle + (i / gondolas.length) * Math.PI * 2;
      g.position.set(x, hub + Math.cos(a) * R - 1.2, z + Math.sin(a) * R);
    });
  };
}

// Yachts, a ferry and a tug moored in the basin, bobbing on the swell.
function createBoats(scene) {
  const { basin, channel } = WATERFRONT;
  const spots = [];
  for (let i = 0; i < 9; i++) spots.push([toWorld(basin.x0 + 30 + i * 32), toWorld(basin.z1 - 18), Math.PI / 2, i % 3 ? 'yacht' : 'launch']);
  for (let i = 0; i < 5; i++) spots.push([toWorld(basin.x0 + 50 + i * 55), toWorld(basin.z0 + 20), -Math.PI / 2, 'yacht']);
  spots.push([toWorld((channel.x0 + channel.x1) / 2), toWorld(-800), 0, 'tug']);
  const boats = spots.map(([x, z, ry, kind]) => {
    const g = new THREE.Group();
    const len = kind === 'tug' ? 9 : kind === 'launch' ? 7 : 6 + rand() * 4;
    const hull = new THREE.Mesh(new THREE.BoxGeometry(len * 0.32, 1.1, len), new THREE.MeshLambertMaterial({ color: kind === 'tug' ? '#b8332b' : pick(['#f4f4f0', '#ffffff', '#1d3a7a', '#e8e1d3']) }));
    hull.position.y = 0.3;
    const bow = new THREE.Mesh(new THREE.ConeGeometry(len * 0.16, len * 0.3, 4).rotateX(Math.PI / 2).rotateZ(Math.PI / 4), hull.material);
    bow.scale.set(1, 0.7, 1);
    bow.position.set(0, 0.3, len / 2 + len * 0.14);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(len * 0.24, kind === 'yacht' ? 0.8 : 1.6, len * 0.35), new THREE.MeshLambertMaterial({ color: kind === 'tug' ? '#f2ece0' : '#dcdcdc' }));
    cabin.position.set(0, 1.1, -len * 0.05);
    g.add(hull, bow, cabin);
    if (kind === 'yacht') {
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, len * 1.3, 5), new THREE.MeshLambertMaterial({ color: '#cfcfcf' }));
      mast.position.y = len * 0.65 + 0.8;
      g.add(mast);
    }
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    g.traverse((o) => { o.castShadow = true; });
    scene.add(g);
    return { g, phase: rand() * 6 };
  });
  let t = 0;
  return (dt) => {
    t += dt;
    for (const b of boats) {
      b.g.position.y = Math.sin(t * 1.1 + b.phase) * 0.12;
      b.g.rotation.z = Math.sin(t * 0.8 + b.phase) * 0.04;
    }
  };
}

export function createWaterfront(scene, colliders) {
  const parts = [];
  const tower = { x: toWorld(118), z: toWorld(-800) };
  clockTower(parts, colliders, tower.x, tower.z);
  wharf(parts, colliders);
  sheds(parts, colliders);
  cafes(parts);
  const mesh = new THREE.Mesh(mergeGeometries(parts), new THREE.MeshLambertMaterial({ vertexColors: true }));
  mesh.castShadow = mesh.receiveShadow = true;
  scene.add(mesh);

  const updates = [createWheel(scene, colliders), createBoats(scene)];
  const { basin } = WATERFRONT;
  const walkRects = [
    { x0: toWorld(basin.x0), x1: toWorld(basin.x1 - 10), z0: toWorld(-656), z1: toWorld(-648) },
    { x0: toWorld(-180), x1: toWorld(110), z0: toWorld(-792), z1: toWorld(-783) },
    { x0: toWorld(-180), x1: toWorld(-128), z0: toWorld(-760), z1: toWorld(-670) },
  ];
  return {
    tower,
    walkRects,
    update(dt) {
      for (const u of updates) u(dt);
    },
  };
}
