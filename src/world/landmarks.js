import * as THREE from 'three';
import { heightAt, CITY, DISA_PARK } from './heightmap.js';
import { MeshBuilder } from './geometry.js';
import { ROADS } from './city.js';

let seed = 4242;
function rand() {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
}

function distToRoads(x, z) {
  let best = Infinity;
  for (const r of ROADS) {
    for (let i = 0; i < r.points.length - 1; i++) {
      const [ax, az] = r.points[i], [bx, bz] = r.points[i + 1];
      const dx = bx - ax, dz = bz - az;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
      best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t) - r.width / 2);
    }
  }
  return best;
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

function createPines(scene, colliders, isSuburb) {
  const spots = [];
  for (let tries = 0; tries < 9000 && spots.length < 1400; tries++) {
    const x = -1600 + rand() * 2800;
    const z = -500 + rand() * 3100;
    if (x > CITY.minX - 20 && x < CITY.maxX + 20 && z > CITY.minZ - 20 && z < CITY.maxZ + 20) continue;
    if (isSuburb(x, z) || Math.hypot(x - DISA_PARK.x, z - DISA_PARK.z) < 90) continue;
    const h = heightAt(x, z);
    if (h < 20 || h > 520) continue;
    const slope = Math.abs(heightAt(x + 4, z) - h) + Math.abs(heightAt(x, z + 4) - h);
    if (slope > 3.2) continue;
    if (distToRoads(x, z) < 6) continue;
    spots.push([x, h, z, 0.7 + rand() * 0.7]);
  }
  for (let i = 0; i < 40; i++) {
    const x = 6 + rand() * 88, z = 30 + rand() * 80;
    spots.push([x, heightAt(x, z), z, 0.9 + rand() * 0.5]);
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

function createPalms(scene, colliders) {
  const spots = [];
  for (let x = -650; x < 1200; x += 28) {
    for (const side of [-12, 12]) {
      const z = -567 + side;
      if (Math.abs(x) % 200 < 20) continue;
      spots.push([x, heightAt(x, z), z]);
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
    const x = 520 + i * 110, z = -850;
    const y = heightAt(x, z);
    const col = i % 2 ? steel : red;
    for (const dx of [-8, 8]) for (const dz of [-6, 6]) b.box(x + dx, y, z + dz, 1.4, 38, 1.4, col);
    b.box(x, y + 36, z, 18, 3, 14, col);
    b.box(x, y + 39, z - 30, 3, 2.5, 80, col);
    b.box(x, y + 41.5, z + 4, 6, 4, 6, steel);
  }
  for (let i = 0; i < 40; i++) {
    const x = 450 + (i % 10) * 14 + 400, z = -700 - Math.floor(i / 10) * 4;
    const colors = ['#2e5f8a', '#a83232', '#c7a23a', '#3d7a4a', '#d9d9d9'];
    b.box(x, heightAt(x, z), z, 12, 2.6, 2.4, new THREE.Color(colors[i % colors.length]));
  }
  const mesh = new THREE.Mesh(b.build(), new THREE.MeshLambertMaterial({ vertexColors: true }));
  mesh.castShadow = mesh.receiveShadow = true;
  scene.add(mesh);
}

function createMinaret(scene, colliders) {
  const x = -140, z = -30, h = heightAt(x, z);
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
  const x = -1150, z = -150, h = heightAt(x, z);
  const g = new THREE.Group();
  const hut = new THREE.Mesh(new THREE.BoxGeometry(8, 4, 6), new THREE.MeshLambertMaterial({ color: '#e9e2d0' }));
  hut.position.set(0, 2, -10);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 4, 8), new THREE.MeshLambertMaterial({ color: '#222' }));
  barrel.rotation.z = Math.PI / 2.4;
  barrel.position.set(4, 1.4, 0);
  g.add(hut, barrel);
  g.position.set(x, h, z);
  scene.add(g);
  colliders.push({ minX: x - 4, maxX: x + 4, minZ: z - 13, maxZ: z - 7 });
}

function createCableCar(scene) {
  const lower = new THREE.Vector3(300, 0, 1955);
  lower.y = heightAt(lower.x, lower.z);
  const upper = new THREE.Vector3(450, 0, 2515);
  upper.y = heightAt(upper.x, upper.z);
  const stationMat = new THREE.MeshLambertMaterial({ color: '#d8d4cc' });
  for (const p of [lower, upper]) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(18, 10, 14), stationMat);
    s.position.copy(p).add(new THREE.Vector3(0, 4, 0));
    s.castShadow = true;
    scene.add(s);
  }
  const a = lower.clone().add(new THREE.Vector3(0, 9, 0));
  const b = upper.clone().add(new THREE.Vector3(0, 9, 0));
  const cable = new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), new THREE.LineBasicMaterial({ color: '#222' }));
  scene.add(cable);
  const cabin = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 3, 12), new THREE.MeshLambertMaterial({ color: '#c0392b' }));
  body.position.y = -4;
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(2.65, 2.65, 1.2, 12), new THREE.MeshLambertMaterial({ color: '#2a3a48' }));
  glass.position.y = -3.6;
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.3, 4, 0.3), new THREE.MeshLambertMaterial({ color: '#333' }));
  arm.position.y = -1.5;
  cabin.add(body, glass, arm);
  scene.add(cabin);
  let t = 0;
  return (dt) => {
    t += dt / 70;
    const k = 0.5 - 0.5 * Math.cos(t * Math.PI * 2);
    cabin.position.lerpVectors(a, b, k);
    cabin.rotation.y += dt * 0.15;
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
    const x = -800 + rand() * 2800;
    const z = drape ? 2440 + rand() * 70 : 2520 + rand() * 900;
    const y = drape ? 960 + rand() * 110 : 1075 + rand() * 40;
    puffs.push({ x, y, z, sx: 90 + rand() * 120, sy: drape ? 50 + rand() * 50 : 25 + rand() * 25, sz: 70 + rand() * 80 });
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

export function createLandmarks(scene, colliders, isSuburb = () => false) {
  createWater(scene);
  createPines(scene, colliders, isSuburb);
  createDisaPark(scene, colliders);
  createPalms(scene, colliders);
  createHarbour(scene);
  createMinaret(scene, colliders);
  createNoonGun(scene, colliders);
  const updateCable = createCableCar(scene);
  const tablecloth = createTablecloth(scene);
  return {
    tablecloth,
    update(dt) {
      updateCable(dt);
      tablecloth.update(dt);
    },
  };
}
