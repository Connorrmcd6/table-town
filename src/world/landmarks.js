import * as THREE from 'three';
import { heightAt, CITY, DISA_PARK, w as toWorld, WORLD_SCALE as S } from './heightmap.js';
import { MeshBuilder } from './geometry.js';
import { ROADS } from './city.js';

let seed = 4242;
function rand() {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
}

function createWater(scene) {
  const geo = new THREE.PlaneGeometry(40000, 40000);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshStandardMaterial({ color: '#1d5f73', roughness: 0.12, metalness: 0.1 });
  const water = new THREE.Mesh(geo, mat);
  water.position.y = 0;
  water.receiveShadow = true;
  scene.add(water);
}

function createPines(scene, colliders, { isSuburb, roads, parks, keepClear }) {
  const spots = [];
  for (let tries = 0; tries < 9000 && spots.length < 1400; tries++) {
    const x = toWorld(-1600 + rand() * 2800);
    const z = toWorld(-500 + rand() * 3100);
    if (x > CITY.minX - 20 && x < CITY.maxX + 20 && z > CITY.minZ - 20 && z < CITY.maxZ + 20) continue;
    if (isSuburb(x, z) || Math.hypot(x - DISA_PARK.x, z - DISA_PARK.z) < 90) continue;
    const h = heightAt(x, z);
    if (h < 20 * S || h > 520 * S) continue;
    const slope = Math.abs(heightAt(x + 4, z) - h) + Math.abs(heightAt(x, z + 4) - h);
    if (slope > 3.2) continue;
    if (roads.clearance(x, z) < 6 || keepClear(x, z)) continue;
    spots.push([x, h, z, 0.7 + rand() * 0.7]);
  }
  for (const p of parks) {
    for (let i = 0; i < 24; i++) {
      const x = p.x0 + 4 + rand() * (p.x1 - p.x0 - 8), z = p.z0 + 4 + rand() * (p.z1 - p.z0 - 8);
      if (roads.clearance(x, z) > 3) spots.push([x, heightAt(x, z), z, 0.7 + rand() * 0.4]);
    }
  }
  const trunkGeo = new THREE.CylinderGeometry(0.35, 0.5, 8, 6);
  trunkGeo.translate(0, 4, 0);
  const canopyGeo = new THREE.SphereGeometry(5, 8, 5);
  canopyGeo.scale(1, 0.45, 1);
  canopyGeo.translate(0, 8.5, 0);
  const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshLambertMaterial({ color: '#5a4030' }), spots.length);
  const canopies = new THREE.InstancedMesh(canopyGeo, new THREE.MeshLambertMaterial({ color: '#3f5a2a' }), spots.length);
  const m = new THREE.Matrix4();
  const c = new THREE.Color();
  spots.forEach(([x, h, z, s], i) => {
    m.makeScale(s, s, s).setPosition(x, h - 0.3, z);
    trunks.setMatrixAt(i, m);
    canopies.setMatrixAt(i, m);
    canopies.setColorAt(i, c.set('#5f7d3c').multiplyScalar(0.85 + rand() * 0.4));
    colliders.push({ minX: x - 0.6, maxX: x + 0.6, minZ: z - 0.6, maxZ: z + 0.6 });
  });
  trunks.castShadow = canopies.castShadow = true;
  scene.add(trunks, canopies);
}

function createPalms(scene, colliders, roads) {
  const spots = [];
  const blvd = ROADS.find((r) => r.name === 'Helen Suzman Blvd');
  const skip = new Set([blvd]);
  for (let i = 0; i < blvd.points.length - 1; i++) {
    const [ax, az] = blvd.points[i], [bx, bz] = blvd.points[i + 1];
    const len = Math.hypot(bx - ax, bz - az), dx = (bx - ax) / len, dz = (bz - az) / len;
    for (let d = 14; d < len; d += 22) {
      for (const side of [-1, 1]) {
        const off = blvd.width / 2 + 3;
        const x = ax + dx * d + dz * off * side, z = az + dz * d - dx * off * side;
        if (roads.clearance(x, z, skip) < 3 || heightAt(x, z) < 0.5) continue;
        spots.push([x, heightAt(x, z), z]);
      }
    }
  }
  const trunkGeo = new THREE.CylinderGeometry(0.25, 0.4, 11, 5);
  trunkGeo.translate(0, 5.5, 0);
  const frondGeo = new THREE.ConeGeometry(4, 2.2, 7);
  frondGeo.translate(0, 11, 0);
  const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshLambertMaterial({ color: '#7a6248' }), spots.length);
  const fronds = new THREE.InstancedMesh(frondGeo, new THREE.MeshLambertMaterial({ color: '#4f7a2e' }), spots.length);
  const m = new THREE.Matrix4();
  spots.forEach(([x, h, z], i) => {
    m.makeTranslation(x, h, z);
    trunks.setMatrixAt(i, m);
    fronds.setMatrixAt(i, m);
    colliders.push({ minX: x - 0.5, maxX: x + 0.5, minZ: z - 0.5, maxZ: z + 0.5 });
  });
  trunks.castShadow = fronds.castShadow = true;
  scene.add(trunks, fronds);
}

function createHarbour(scene) {
  const b = new MeshBuilder();
  const steel = new THREE.Color('#3a3f45');
  const red = new THREE.Color('#b8452f');
  for (let i = 0; i < 6; i++) {
    const x = toWorld(520 + i * 110), z = toWorld(-850);
    const y = heightAt(x, z);
    const col = i % 2 ? steel : red;
    for (const dx of [-8, 8]) for (const dz of [-6, 6]) b.box(x + dx, y, z + dz, 1.4, 38, 1.4, col);
    b.box(x, y + 36, z, 18, 3, 14, col);
    b.box(x, y + 39, z - 30, 3, 2.5, 80, col);
    b.box(x, y + 41.5, z + 4, 6, 4, 6, steel);
  }
  for (let i = 0; i < 40; i++) {
    const x = toWorld(850) + (i % 10) * 14, z = toWorld(-700) - Math.floor(i / 10) * 4;
    const colors = ['#2e5f8a', '#a83232', '#c7a23a', '#3d7a4a', '#d9d9d9'];
    b.box(x, heightAt(x, z), z, 12, 2.6, 2.4, new THREE.Color(colors[i % colors.length]));
  }
  const mesh = new THREE.Mesh(b.build(), new THREE.MeshLambertMaterial({ vertexColors: true }));
  mesh.castShadow = mesh.receiveShadow = true;
  scene.add(mesh);
}

function createMinaret(scene, colliders) {
  const x = toWorld(-140), z = toWorld(-30), h = heightAt(x, z);
  const g = new THREE.Group();
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 2.2, 22, 10), new THREE.MeshLambertMaterial({ color: '#f4f1ea' }));
  tower.position.y = 11;
  const balcony = new THREE.Mesh(new THREE.CylinderGeometry(2.8, 2.8, 0.6, 10), new THREE.MeshLambertMaterial({ color: '#f4f1ea' }));
  balcony.position.y = 17;
  const dome = new THREE.Mesh(new THREE.SphereGeometry(2, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#2f8f5b' }));
  dome.position.y = 22;
  g.add(tower, balcony, dome);
  g.position.set(x, h - 0.5, z);
  g.traverse((o) => { o.castShadow = true; });
  scene.add(g);
  colliders.push({ minX: x - 2.2, maxX: x + 2.2, minZ: z - 2.2, maxZ: z + 2.2 });
}

function createNoonGun(scene, colliders) {
  const x = toWorld(-1205), z = toWorld(-110), h = heightAt(x, z);
  const g = new THREE.Group();
  const hut = new THREE.Mesh(new THREE.BoxGeometry(8, 4, 6), new THREE.MeshLambertMaterial({ color: '#e9e2d0' }));
  hut.position.set(0, 2, -10);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 4, 8), new THREE.MeshLambertMaterial({ color: '#222' }));
  barrel.rotation.z = Math.PI / 2.4;
  barrel.position.set(4, 1.4, 0);
  g.add(hut, barrel);
  g.position.set(x, h, z);
  scene.add(g);
  colliders.push({ minX: x - 4, maxX: x + 4, minZ: z - 13, maxZ: z - 7, top: h + 4 });
}

const CABLE_DWELL = 12, CABLE_TRAVEL = 40, CABLE_LIFT = 6.8, BOARD_RANGE = 7;

// A station block sitting on the slope, set into the ground at its lowest corner.
function station(scene, colliders, x, z, w, h, d, mat) {
  let min = Infinity;
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 0]]) min = Math.min(min, heightAt(x + (dx * w) / 2, z + (dz * d) / 2));
  const base = min - 1;
  const top = Math.max(base + h, heightAt(x, z) + 4);
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, top - base, d), mat);
  m.position.set(x, (base + top) / 2, z);
  m.castShadow = m.receiveShadow = true;
  scene.add(m);
  colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, top });
}

function cabinMesh() {
  const red = new THREE.MeshLambertMaterial({ color: '#c0392b' });
  const grey = new THREE.MeshLambertMaterial({ color: '#3a3d42' });
  const glass = new THREE.MeshLambertMaterial({ color: '#9fc7dd', transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide });
  const cabin = new THREE.Group();
  const part = (geo, mat, y) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.y = y;
    m.castShadow = mat !== glass;
    cabin.add(m);
  };
  part(new THREE.CylinderGeometry(3.2, 3.0, 0.4, 16), red, -6.6);
  part(new THREE.CylinderGeometry(3.2, 3.2, 1.0, 16, 1, true), red, -5.9);
  part(new THREE.CylinderGeometry(3.2, 3.2, 1.6, 16, 1, true), glass, -4.6);
  part(new THREE.CylinderGeometry(3.3, 3.2, 0.6, 16), red, -3.5);
  part(new THREE.CylinderGeometry(1.2, 2.2, 0.6, 12), grey, -2.9);
  part(new THREE.BoxGeometry(0.35, 2.6, 0.35), grey, -1.4);
  part(new THREE.BoxGeometry(1.6, 0.5, 0.6), grey, 0);
  for (let i = 0; i < 6; i++) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.6, 0.18), red);
    post.position.set(Math.cos((i / 6) * Math.PI * 2) * 3.15, -4.6, Math.sin((i / 6) * Math.PI * 2) * 3.15);
    cabin.add(post);
  }
  return cabin;
}

// Timetabled cableway: the cabin waits at a station, then crosses (turning slowly, like the real Rotair).
function createCableCar(scene, colliders) {
  const dock = (rx, rz) => {
    const v = new THREE.Vector3(toWorld(rx), 0, toWorld(rz));
    v.y = heightAt(v.x, v.z);
    return v;
  };
  const lower = dock(300, 1955), upper = dock(450, 2503);
  const dir = new THREE.Vector3(upper.x - lower.x, 0, upper.z - lower.z).normalize();
  const side = new THREE.Vector3(dir.z, 0, -dir.x);
  const stone = new THREE.MeshLambertMaterial({ color: '#d8d4cc' });
  station(scene, colliders, lower.x + side.x * 13, lower.z + side.z * 13, 14, 9, 16, stone);
  station(scene, colliders, upper.x + dir.x * 14, upper.z + dir.z * 14, 18, 8, 12, stone);

  // A railing along the summit cliff edge, with a gap where the cabin docks.
  const rail = new THREE.MeshLambertMaterial({ color: '#5b5f63' });
  const edgeZ = toWorld(2501);
  for (let rx = 330; rx < 560; rx += 10) {
    const x = toWorld(rx);
    if (Math.abs(x - upper.x) < 5) continue;
    const y = heightAt(x, edgeZ + 1);
    const seg = new THREE.Mesh(new THREE.BoxGeometry(toWorld(10), 0.12, 0.12), rail);
    seg.position.set(x, y + 1.05, edgeZ);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.1, 0.12), rail);
    post.position.set(x - toWorld(5), y + 0.5, edgeZ);
    scene.add(seg, post);
    colliders.push({ minX: x - toWorld(5), maxX: x + toWorld(5), minZ: edgeZ - 0.3, maxZ: edgeZ + 0.3, top: y + 1.1 });
  }

  const a = lower.clone().setY(lower.y + CABLE_LIFT);
  const b = upper.clone().setY(upper.y + CABLE_LIFT);
  for (const off of [-0.8, 0.8]) {
    const o = side.clone().multiplyScalar(off);
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([a.clone().add(o), b.clone().add(o)]), new THREE.LineBasicMaterial({ color: '#222' })));
  }
  const cabin = cabinMesh();
  scene.add(cabin);

  const stations = {
    lower: { name: 'Lower Cable Station', dock: lower, exit: lower.clone().addScaledVector(dir, -5), heading: Math.atan2(-dir.x, -dir.z) },
    upper: { name: 'Table Mountain', dock: upper, exit: upper.clone().addScaledVector(dir, 5), heading: Math.atan2(-dir.x, -dir.z) },
  };
  for (const s of Object.values(stations)) s.exit.y = heightAt(s.exit.x, s.exit.z);
  const st = { at: 'lower', timer: CABLE_DWELL, from: null, to: null, t: 0 };
  const other = (k) => (k === 'lower' ? 'upper' : 'lower');
  const place = () => {
    if (st.at) cabin.position.copy(st.at === 'lower' ? a : b);
    else {
      const k = 0.5 - 0.5 * Math.cos(st.t * Math.PI);
      const [p, q] = st.from === 'lower' ? [a, b] : [b, a];
      cabin.position.lerpVectors(p, q, k);
    }
  };
  place();
  const spot = new THREE.Vector3();

  return {
    stations,
    get docked() { return st.at; },
    // Station whose boarding spot `pos` is standing at, if any.
    near(pos) {
      for (const [key, s] of Object.entries(stations)) {
        if (Math.hypot(pos.x - s.dock.x, pos.z - s.dock.z) < BOARD_RANGE && Math.abs(pos.y - s.dock.y) < 4) return key;
      }
      return null;
    },
    // Seconds until the cabin is next waiting at station `key`.
    wait(key) {
      if (st.at === key) return 0;
      if (st.at) return st.timer + CABLE_TRAVEL;
      return (1 - st.t) * CABLE_TRAVEL + (st.to === key ? 0 : CABLE_DWELL + CABLE_TRAVEL);
    },
    // Where a rider stands on the cabin floor, and which way they face.
    rider(out = spot) {
      cabin.updateMatrixWorld();
      out.set(1.1, -6.4, 0.6);
      cabin.localToWorld(out);
      return { pos: out, heading: cabin.rotation.y + Math.PI / 2 };
    },
    update(dt) {
      if (st.at) {
        st.timer -= dt;
        if (st.timer <= 0) Object.assign(st, { from: st.at, to: other(st.at), at: null, t: 0 });
      } else {
        st.t += dt / CABLE_TRAVEL;
        cabin.rotation.y += dt * 0.16;
        if (st.t >= 1) Object.assign(st, { at: st.to, timer: CABLE_DWELL, from: null, to: null });
      }
      place();
    },
  };
}

function createTablecloth(scene) {
  const geo = new THREE.SphereGeometry(1, 10, 6);
  const mat = new THREE.MeshLambertMaterial({ color: '#ffffff', transparent: true, opacity: 0.88, emissive: '#c8c8c8' });
  const count = 140;
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  const puffs = [];
  for (let i = 0; i < count; i++) {
    const drape = rand() < 0.45;
    const x = toWorld(-800 + rand() * 2800);
    const z = toWorld(drape ? 2440 + rand() * 70 : 2520 + rand() * 900);
    const y = toWorld(drape ? 960 + rand() * 110 : 1075 + rand() * 40);
    puffs.push({ x, y, z, sx: toWorld(90 + rand() * 120), sy: toWorld(drape ? 50 + rand() * 50 : 25 + rand() * 25), sz: toWorld(70 + rand() * 80) });
  }
  mesh.visible = false;
  scene.add(mesh);
  const m = new THREE.Matrix4();
  let t = 0;
  return {
    set(on) { mesh.visible = on; },
    update(dt) {
      if (!mesh.visible) return;
      t += dt;
      puffs.forEach((p, i) => {
        const wob = Math.sin(t * 0.2 + i) * 6;
        m.makeScale(p.sx, p.sy, p.sz).setPosition(p.x + wob, p.y, p.z);
        mesh.setMatrixAt(i, m);
      });
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}

function disaTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#f3f1ec';
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = '#4a5560';
  ctx.fillRect(0, 22, 64, 26);
  ctx.fillStyle = '#e6e3dc';
  ctx.fillRect(0, 44, 64, 6);
  ctx.fillStyle = '#d9d6cf';
  for (let x = 0; x < 64; x += 16) ctx.fillRect(x, 22, 2, 22);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createDisaPark(scene, colliders) {
  const floors = 18, floorH = 3.1, radius = 13;
  const tex = disaTexture();
  tex.repeat.set(Math.round((Math.PI * 2 * radius) / 4), floors);
  const wall = new THREE.MeshLambertMaterial({ map: tex });
  const roof = new THREE.MeshLambertMaterial({ color: '#8d9399' });
  const plinth = new THREE.MeshLambertMaterial({ color: '#cfc9bd' });
  const spots = [[-50, 12], [0, -6], [50, 14]];
  for (const [ox, oz] of spots) {
    const x = DISA_PARK.x + ox, z = DISA_PARK.z + oz;
    let min = Infinity;
    for (let a = 0; a < 8; a++) min = Math.min(min, heightAt(x + Math.cos(a) * radius, z + Math.sin(a) * radius));
    const g = new THREE.Group();
    const h = floors * floorH;
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, h, 28, 1, true), wall);
    tower.position.y = h / 2 + 3;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(radius - 1.5, radius - 1.5, 6, 20), plinth);
    base.position.y = 1;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(radius + 0.6, radius + 0.6, 1.2, 28), roof);
    cap.position.y = h + 3.6;
    const plant = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 3.5, 3, 12), roof);
    plant.position.y = h + 5.5;
    g.add(tower, base, cap, plant);
    g.position.set(x, min - 1, z);
    g.traverse((o) => { o.castShadow = true; o.receiveShadow = true; });
    scene.add(g);
    colliders.push({ minX: x - radius * 0.8, maxX: x + radius * 0.8, minZ: z - radius * 0.8, maxZ: z + radius * 0.8 });
  }
}

export function createLandmarks(scene, colliders, { isSuburb, roads, parks, keepClear = () => false }) {
  createWater(scene);
  createPines(scene, colliders, { isSuburb, roads, parks, keepClear });
  createDisaPark(scene, colliders);
  createPalms(scene, colliders, roads);
  createHarbour(scene);
  createMinaret(scene, colliders);
  createNoonGun(scene, colliders);
  const cableCar = createCableCar(scene, colliders);
  const tablecloth = createTablecloth(scene);
  return {
    tablecloth,
    cableCar,
    update(dt) {
      cableCar.update(dt);
      tablecloth.update(dt);
    },
  };
}
