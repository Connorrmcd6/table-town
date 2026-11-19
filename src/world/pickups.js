import * as THREE from 'three';
import { heightAt } from './heightmap.js';

const COUNT = 70, HEAL = 25, RESPAWN = 120, REACH = 1.4, CAR_REACH = 2.6;

// Spinning vetkoek on the pavements: walk or drive through one for +25 health; it comes back a couple of minutes later.
export function createPickups(scene, walkRects, rand = Math.random) {
  const spots = [];
  for (let i = 0; i < COUNT; i++) {
    const r = walkRects[Math.floor(rand() * walkRects.length)];
    const side = Math.floor(rand() * 4), t = rand();
    const x = side < 2 ? r.x0 + (r.x1 - r.x0) * t : side === 2 ? r.x0 : r.x1;
    const z = side >= 2 ? r.z0 + (r.z1 - r.z0) * t : side === 0 ? r.z0 : r.z1;
    spots.push({ x, z, y: heightAt(x, z) + (r.sidewalk ? 0.3 : 0) + 0.85, gone: 0, phase: rand() * 6 });
  }

  const bun = new THREE.SphereGeometry(0.32, 12, 8).scale(1, 0.62, 1);
  const filling = new THREE.CylinderGeometry(0.2, 0.2, 0.08, 10);
  const buns = new THREE.InstancedMesh(bun, new THREE.MeshLambertMaterial({ color: '#c8862e', emissive: '#4a2a08' }), COUNT);
  const tops = new THREE.InstancedMesh(filling, new THREE.MeshBasicMaterial({ color: '#7a3b1c' }), COUNT);
  const halo = new THREE.InstancedMesh(new THREE.RingGeometry(0.45, 0.62, 20).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: '#ffd36b', transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }), COUNT);
  for (const m of [buns, tops, halo]) {
    m.frustumCulled = false;
    scene.add(m);
  }
  const mat = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), zero = new THREE.Vector3();
  const yAxis = new THREE.Vector3(0, 1, 0);
  let time = 0;

  // Returns how much health was picked up this frame.
  function update(dt, who, inVehicle, health) {
    time += dt;
    let healed = 0;
    spots.forEach((s, i) => {
      if (s.gone > 0) s.gone -= dt;
      const live = s.gone <= 0;
      if (live && health + healed < 100 && Math.hypot(who.x - s.x, who.z - s.z) < (inVehicle ? CAR_REACH : REACH) && Math.abs(who.y + 1 - s.y) < 2.5) {
        healed += HEAL;
        s.gone = RESPAWN;
      }
      const bob = Math.sin(time * 2 + s.phase) * 0.12;
      q.setFromAxisAngle(yAxis, time * 1.6 + s.phase);
      const scale = s.gone > 0 ? zero : one;
      buns.setMatrixAt(i, mat.compose(pos.set(s.x, s.y + bob, s.z), q, scale));
      tops.setMatrixAt(i, mat.compose(pos.set(s.x, s.y + bob + 0.2, s.z), q, scale));
      halo.setMatrixAt(i, mat.compose(pos.set(s.x, s.y - 0.82, s.z), q, scale));
    });
    buns.instanceMatrix.needsUpdate = tops.instanceMatrix.needsUpdate = halo.instanceMatrix.needsUpdate = true;
    return healed;
  }

  return { spots, update };
}

// A glowing red-cross marker outside the hospital: stand in it for full health, for a fee.
export function createHospitalMarker(scene, x, z) {
  const y = heightAt(x, z);
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 0.9, 24, 1, true),
    new THREE.MeshBasicMaterial({ color: '#ff4b4b', transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide }));
  ring.position.y = 0.45;
  const sign = new THREE.Group();
  const white = new THREE.MeshBasicMaterial({ color: '#ffffff' }), red = new THREE.MeshBasicMaterial({ color: '#d42a2a' });
  sign.add(new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 0.12), white));
  sign.add(new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.24, 0.16), red));
  sign.add(new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.8, 0.16), red));
  sign.position.y = 2.6;
  g.add(ring, sign);
  g.position.set(x, y, z);
  scene.add(g);
  let t = 0;
  return {
    x, z,
    update(dt) {
      t += dt;
      sign.rotation.y = t * 1.2;
      sign.position.y = 2.6 + Math.sin(t * 2) * 0.12;
    },
    contains: (px, pz) => Math.hypot(px - x, pz - z) < 1.8,
  };
}
