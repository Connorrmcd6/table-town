import * as THREE from 'three';

const matCache = new Map();
const mat = (color) => {
  if (!matCache.has(color)) matCache.set(color, new THREE.MeshLambertMaterial({ color }));
  return matCache.get(color);
};

const SKIN = ['#5a3a28', '#7a5038', '#a0704c', '#c48f68', '#e0b896', '#3e2a1e'];
const TOPS = ['#c0392b', '#2e86de', '#f1c40f', '#ecf0f1', '#27ae60', '#8e44ad', '#e67e22', '#34495e', '#16a085', '#d35400'];
const BOTTOMS = ['#2c3e50', '#1b1b1b', '#5d6d7e', '#7f6a4f', '#283747', '#b8a88a'];
const SHOES = ['#f4f4f0', '#1b1b1b', '#7a5038'];

function limb(w, h, d, color, pivotY) {
  const pivot = new THREE.Group();
  pivot.position.y = pivotY;
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d).translate(0, -h / 2, 0), mat(color));
  m.castShadow = true;
  pivot.add(m);
  return pivot;
}

export function randomLook(rnd = Math.random) {
  const p = (a) => a[Math.floor(rnd() * a.length)];
  return { skin: p(SKIN), top: p(TOPS), bottom: p(BOTTOMS), shoes: p(SHOES), hat: rnd() < 0.3 ? p(TOPS) : null, scale: 0.92 + rnd() * 0.16 };
}

// A jointed low-poly person facing +z, feet at y = 0.
export function makePerson(look) {
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  const legL = limb(0.17, 0.86, 0.2, look.bottom, 0.9);
  const legR = limb(0.17, 0.86, 0.2, look.bottom, 0.9);
  legL.position.x = 0.11;
  legR.position.x = -0.11;
  for (const leg of [legL, legR]) {
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.1, 0.3), mat(look.shoes));
    shoe.position.set(0, -0.85, 0.05);
    leg.add(shoe);
  }
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.6, 0.24), mat(look.top));
  torso.position.y = 1.2;
  torso.castShadow = true;
  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.12), mat(look.skin));
  neck.position.y = 1.53;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.27, 0.25), mat(look.skin));
  head.position.y = 1.7;
  head.castShadow = true;
  body.add(torso, neck, head);
  if (look.hat) {
    const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.2, 0.12, 8), mat(look.hat));
    hat.position.y = 1.86;
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.02, 8), mat(look.hat));
    brim.position.y = 1.81;
    body.add(hat, brim);
  }
  const armL = limb(0.12, 0.62, 0.14, look.top, 1.47);
  const armR = limb(0.12, 0.62, 0.14, look.top, 1.47);
  armL.position.x = 0.29;
  armR.position.x = -0.29;
  for (const arm of [armL, armR]) {
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.12), mat(look.skin));
    hand.position.y = -0.66;
    arm.add(hand);
  }
  body.add(legL, legR, armL, armR);
  g.scale.setScalar(look.scale);
  return { group: g, body, legL, legR, armL, armR, phase: Math.random() * 6 };
}

// Swing limbs for a walk/run cycle; speed in m/s.
export function animatePerson(p, dt, speed) {
  const stride = Math.min(1, speed / 1.4);
  p.phase += dt * (3 + speed * 2.2);
  const swing = Math.sin(p.phase) * 0.6 * stride;
  p.legL.rotation.x = swing;
  p.legR.rotation.x = -swing;
  p.armL.rotation.x = -swing * 0.9;
  p.armR.rotation.x = swing * 0.9;
  p.body.position.y = Math.abs(Math.cos(p.phase)) * 0.05 * stride;
}

export function knockDown(p, amount) {
  p.body.rotation.x = -Math.PI / 2 * amount;
  p.body.position.y = 0.15 * amount;
}
