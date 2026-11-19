import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const matCache = new Map();
const mat = (color) => {
  if (!matCache.has(color)) matCache.set(color, new THREE.MeshLambertMaterial({ color }));
  return matCache.get(color);
};

const SKIN = ['#4a2e1e', '#5a3a28', '#7a5038', '#8f6040', '#a0704c', '#c48f68', '#e0b896', '#3e2a1e'];
const TOPS = ['#c0392b', '#2e86de', '#f1c40f', '#ecf0f1', '#27ae60', '#8e44ad', '#e67e22', '#34495e', '#16a085', '#d35400', '#1b1b1b', '#f4a6b8'];
const BOTTOMS = ['#2c3e50', '#1b1b1b', '#5d6d7e', '#7f6a4f', '#283747', '#b8a88a', '#4a5f8a', '#6b2d2d'];
const SHOES = ['#f4f4f0', '#1b1b1b', '#7a5038', '#c0392b'];
const HAIR = ['#120c08', '#1f1510', '#3b2414', '#6b4a2a', '#b08850', '#8a8a8a'];
const HATS = ['#c0392b', '#1b1b1b', '#2e86de', '#f1c40f', '#ecf0f1', '#27ae60', '#d9c38a'];
const HAIRSTYLES = ['short', 'short', 'bald', 'cap', 'bucket', 'doek', 'long', 'beanie'];

function box(w, h, d, color, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

const PERSON_MAT = new THREE.MeshLambertMaterial({ vertexColors: true });

// Collapse a joint's own boxes into one vertex-coloured mesh so each body segment is a single draw call.
function bake(group, shadow) {
  const parts = group.children.filter((c) => c.isMesh);
  if (!parts.length) return;
  const geos = parts.map((m) => {
    m.updateMatrix();
    const g = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()).applyMatrix4(m.matrix);
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', g.getAttribute('position'));
    out.setAttribute('normal', g.getAttribute('normal'));
    const n = g.getAttribute('position').count, c = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) m.material.color.toArray(c, i * 3);
    out.setAttribute('color', new THREE.BufferAttribute(c, 3));
    group.remove(m);
    return out;
  });
  const merged = new THREE.Mesh(mergeGeometries(geos), PERSON_MAT);
  merged.castShadow = shadow;
  group.add(merged);
}

// Two-segment limb: returns { root, joint } where root swings at the hip/shoulder and joint is the knee/elbow.
function limb(upperLen, lowerLen, upperW, lowerW, upperColor, lowerColor, end) {
  const root = new THREE.Group();
  root.add(box(upperW, upperLen, upperW, upperColor, 0, -upperLen / 2, 0));
  const joint = new THREE.Group();
  joint.position.y = -upperLen;
  joint.add(box(lowerW, lowerLen, lowerW, lowerColor, 0, -lowerLen / 2, 0));
  if (end) {
    end.position.y -= lowerLen;
    joint.add(end);
  }
  root.add(joint);
  return { root, joint };
}

export function randomLook(rnd = Math.random) {
  const p = (a) => a[Math.floor(rnd() * a.length)];
  return {
    skin: p(SKIN), top: p(TOPS), bottom: p(BOTTOMS), shoes: p(SHOES), hair: p(HAIR), hat: p(HATS),
    hairStyle: p(HAIRSTYLES), longSleeves: rnd() < 0.35, shorts: rnd() < 0.25, scale: 0.9 + rnd() * 0.18,
  };
}

function head(look) {
  const g = new THREE.Group();
  g.add(box(0.1, 0.1, 0.1, look.skin, 0, 0.04, 0));
  g.add(box(0.23, 0.27, 0.24, look.skin, 0, 0.2, 0));
  g.add(box(0.045, 0.03, 0.02, '#141414', 0.055, 0.23, 0.12));
  g.add(box(0.045, 0.03, 0.02, '#141414', -0.055, 0.23, 0.12));
  g.add(box(0.04, 0.06, 0.04, look.skin, 0, 0.18, 0.13));
  g.add(box(0.08, 0.02, 0.02, '#5a2a22', 0, 0.12, 0.12));
  const hair = look.hair, hat = look.hat;
  switch (look.hairStyle) {
    case 'short':
      g.add(box(0.25, 0.07, 0.26, hair, 0, 0.35, -0.005));
      g.add(box(0.25, 0.12, 0.05, hair, 0, 0.28, -0.11));
      break;
    case 'long':
      g.add(box(0.26, 0.08, 0.27, hair, 0, 0.35, 0));
      g.add(box(0.27, 0.34, 0.07, hair, 0, 0.2, -0.12));
      break;
    case 'cap':
      g.add(box(0.26, 0.09, 0.26, hat, 0, 0.37, 0));
      g.add(box(0.22, 0.02, 0.14, hat, 0, 0.33, 0.18));
      break;
    case 'bucket': {
      const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.12, 10), mat(hat));
      crown.position.y = 0.38;
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.25, 0.03, 12), mat(hat));
      brim.position.y = 0.32;
      g.add(crown, brim);
      break;
    }
    case 'doek':
      g.add(box(0.28, 0.16, 0.28, hat, 0, 0.39, -0.01));
      g.add(box(0.14, 0.09, 0.12, hat, 0, 0.49, -0.04));
      break;
    case 'beanie':
      g.add(box(0.26, 0.13, 0.26, hat, 0, 0.37, 0));
      break;
    default:
      break;
  }
  return g;
}

// A jointed low-poly person facing +z, feet at y = 0.
export function makePerson(look, { shadow = false } = {}) {
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);

  const hips = new THREE.Group();
  hips.position.y = 0.94;
  body.add(hips);
  hips.add(box(0.36, 0.16, 0.22, look.bottom, 0, 0, 0));

  const shin = look.shorts ? look.skin : look.bottom;
  const legs = [0.1, -0.1].map((x) => {
    const shoe = box(0.16, 0.09, 0.28, look.shoes, 0, -0.02, 0.05);
    const l = limb(0.46, 0.44, 0.16, 0.13, look.bottom, shin, shoe);
    l.root.position.set(x, -0.04, 0);
    hips.add(l.root);
    return l;
  });

  const torso = new THREE.Group();
  hips.add(torso);
  torso.add(box(0.38, 0.22, 0.22, look.top, 0, 0.17, 0));
  torso.add(box(0.46, 0.32, 0.25, look.top, 0, 0.42, 0));
  const neckHead = head(look);
  neckHead.position.y = 0.58;
  torso.add(neckHead);

  const fore = look.longSleeves ? look.top : look.skin;
  const arms = [0.29, -0.29].map((x) => {
    const hand = box(0.09, 0.11, 0.11, look.skin, 0, -0.03, 0);
    const a = limb(0.3, 0.27, 0.12, 0.1, look.top, fore, hand);
    a.root.position.set(x, 0.54, 0);
    torso.add(a.root);
    return a;
  });

  g.scale.setScalar(look.scale);
  const segments = [hips, torso, neckHead, ...legs.flatMap((l) => [l.root, l.joint]), ...arms.flatMap((a) => [a.root, a.joint])];
  for (const seg of segments) bake(seg, shadow);
  return {
    group: g, body, hips, torso, head: neckHead,
    legL: legs[0].root, kneeL: legs[0].joint, legR: legs[1].root, kneeR: legs[1].joint,
    armL: arms[0].root, elbowL: arms[0].joint, armR: arms[1].root, elbowR: arms[1].joint,
    phase: Math.random() * 6,
  };
}

const lerp = (a, b, k) => a + (b - a) * k;

// Walk blends into a sprint: forward lean, high knees, bent pumping arms.
export function animatePerson(p, dt, speed) {
  const moving = Math.min(1, speed / 0.6);
  const sprint = Math.max(0, Math.min(1, (speed - 2.6) / 4));
  p.phase += dt * (2.2 + speed * (1.7 - sprint * 0.55)) * (moving > 0.05 ? 1 : 0);
  const s = Math.sin(p.phase), c = Math.cos(p.phase);
  const amp = lerp(0.45, 1.0, sprint) * moving;
  const k = Math.min(1, dt * 14);
  const set = (o, axis, v) => { o.rotation[axis] = lerp(o.rotation[axis], v, k); };

  set(p.legL, 'x', -s * amp);
  set(p.legR, 'x', s * amp);
  const kneeBend = lerp(0.35, 1.5, sprint) * moving;
  set(p.kneeL, 'x', 0.08 + Math.max(0, c) * kneeBend);
  set(p.kneeR, 'x', 0.08 + Math.max(0, -c) * kneeBend);
  const armAmp = lerp(0.4, 1.1, sprint) * moving;
  set(p.armL, 'x', s * armAmp);
  set(p.armR, 'x', -s * armAmp);
  set(p.elbowL, 'x', -lerp(0.15, 1.45, sprint) - Math.max(0, -s) * 0.3 * sprint);
  set(p.elbowR, 'x', -lerp(0.15, 1.45, sprint) - Math.max(0, s) * 0.3 * sprint);
  set(p.armL, 'z', 0.06);
  set(p.armR, 'z', -0.06);
  set(p.torso, 'x', lerp(0.03, 0.35, sprint) * moving);
  set(p.torso, 'y', -s * lerp(0.08, 0.18, sprint) * moving);
  set(p.hips, 'y', s * 0.08 * moving);
  p.body.position.y = Math.abs(c) * lerp(0.025, 0.09, sprint) * moving;
}

// Mid-jump: knees tucked on the way up, legs reaching for the ground on the way down, arms thrown up.
export function poseAirborne(p, dt, vy) {
  const k = Math.min(1, dt * 16);
  const rising = vy > 0 ? 1 : 0.4;
  const set = (o, axis, v) => { o.rotation[axis] += (v - o.rotation[axis]) * k; };
  set(p.legL, 'x', -0.9 * rising);
  set(p.legR, 'x', -0.3 * rising);
  set(p.kneeL, 'x', 1.4 * rising);
  set(p.kneeR, 'x', 0.9 * rising);
  set(p.armL, 'x', -2.4);
  set(p.armR, 'x', -2.1);
  set(p.armL, 'z', 0.35);
  set(p.armR, 'z', -0.35);
  set(p.elbowL, 'x', -0.4);
  set(p.elbowR, 'x', -0.4);
  set(p.torso, 'x', 0.15);
  p.body.position.y = 0;
}

export function knockDown(p, amount) {
  p.body.rotation.x = -Math.PI / 2 * amount;
  p.body.position.set(0, 0.15 * amount, 0);
}

const smooth = (x) => x * x * (3 - 2 * x);

// Bail-out roll: tucked somersault about the hips, then a squat that rises to standing.
export function poseRoll(p, t, dur, spins, recover) {
  const b = p.body;
  if (t < dur) {
    const k = t / dur;
    const tuck = Math.min(1, k * 6, (1 - k) * 4 + 0.35);
    const angle = Math.PI * 2 * spins * smooth(k);
    const pivot = 0.94;
    const hop = 0.3 * Math.max(0, Math.sin(Math.PI * Math.min(1, k * spins * 1.6)));
    b.rotation.x = angle;
    b.position.y = pivot - pivot * Math.cos(angle) - 0.44 * tuck + hop;
    b.position.z = -pivot * Math.sin(angle);
    crouch(p, tuck, 1);
  } else {
    const q = 1 - smooth(Math.min(1, (t - dur) / recover));
    b.rotation.x = 0;
    b.position.set(0, -0.48 * q, 0);
    crouch(p, q, 0);
  }
}

function crouch(p, amount, tuck) {
  const thigh = -(1.4 + 0.5 * tuck) * amount;
  p.legL.rotation.set(thigh, 0, 0.08 * amount);
  p.legR.rotation.set(thigh, 0, -0.08 * amount);
  p.kneeL.rotation.x = (2.2 + 0.1 * tuck) * amount;
  p.kneeR.rotation.x = (2.2 + 0.1 * tuck) * amount;
  p.torso.rotation.set(0.55 * amount, 0, 0);
  p.armL.rotation.set(-(0.9 + 0.8 * tuck) * amount, 0, 0.2 * amount);
  p.armR.rotation.set(-(0.9 + 0.8 * tuck) * amount, 0, -0.2 * amount);
  p.elbowL.rotation.x = -(0.3 + 1.3 * tuck) * amount;
  p.elbowR.rotation.x = -(0.3 + 1.3 * tuck) * amount;
  p.hips.rotation.y = 0;
}

// Hauling up a wall: arms overhead pulling, legs scrambling, then a knee onto the ledge.
export function poseClimb(p, k) {
  const pull = Math.min(1, k / 0.7), over = Math.max(0, (k - 0.7) / 0.3);
  const scramble = Math.sin(k * 22) * 0.5 * (1 - over);
  p.body.rotation.x = 0;
  p.body.position.set(0, 0, 0);
  p.armL.rotation.set(-2.9 + pull * 1.2 + over * 1.4, 0, 0.15);
  p.armR.rotation.set(-2.9 + pull * 1.2 + over * 1.4, 0, -0.15);
  p.elbowL.rotation.x = -0.4 - pull * 0.8;
  p.elbowR.rotation.x = -0.4 - pull * 0.8;
  p.legL.rotation.set(-0.5 - scramble - over * 1.2, 0, 0);
  p.legR.rotation.set(-0.5 + scramble, 0, 0);
  p.kneeL.rotation.x = 0.9 + over * 1.0;
  p.kneeR.rotation.x = 0.9;
  p.torso.rotation.set(0.25 + over * 0.3, 0, 0);
}

// Upper-body overlays on top of the walk cycle: pistol aim (pitch down is positive) or a right jab.
export function poseArms(p, arms) {
  if (arms.mode === 'aim') {
    p.armR.rotation.set(-Math.PI / 2 + arms.pitch, 0, 0.05);
    p.elbowR.rotation.x = 0;
    p.armL.rotation.set(-Math.PI / 2 + arms.pitch + 0.1, 0, -0.45);
    p.elbowL.rotation.x = -0.3;
    p.torso.rotation.set(0, 0, 0);
  } else if (arms.mode === 'punch') {
    const jab = Math.sin(Math.min(1, arms.k) * Math.PI);
    p.armR.rotation.set(-0.6 - jab * 1.0, 0, -0.1);
    p.elbowR.rotation.x = -1.6 + jab * 1.5;
    p.armL.rotation.set(-1.2, 0, 0.2);
    p.elbowL.rotation.x = -1.9;
    p.torso.rotation.set(0.1, -0.35 + jab * 0.6, 0);
  }
}

// A pistol held in the right hand, pointing down the forearm; returns the muzzle marker.
export function addPistol(p) {
  const gun = new THREE.Group();
  const metal = new THREE.MeshLambertMaterial({ color: '#1c1c1e' });
  const slide = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.22, 0.07), metal);
  slide.position.set(0, -0.06, 0.03);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.06, 0.12), metal);
  grip.position.set(0, 0.02, -0.03);
  gun.add(slide, grip);
  gun.position.set(0, -0.3, 0.02);
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, -0.18, 0.03);
  gun.add(muzzle);
  p.elbowR.add(gun);
  gun.visible = false;
  p.gun = gun;
  p.muzzle = muzzle;
  return muzzle;
}

// Seated on a bike: thighs forward, knees bent, hands on the bars.
export function poseRider(p, lean = 0.1) {
  p.legL.rotation.set(-1.45, 0, 0.12);
  p.legR.rotation.set(-1.45, 0, -0.12);
  p.kneeL.rotation.x = 1.55;
  p.kneeR.rotation.x = 1.55;
  p.torso.rotation.set(lean, 0, 0);
  p.armL.rotation.set(-1.1 - lean, 0, 0.15);
  p.armR.rotation.set(-1.1 - lean, 0, -0.15);
  p.elbowL.rotation.x = -0.35;
  p.elbowR.rotation.x = -0.35;
  p.hips.rotation.y = 0;
  p.body.position.y = 0;
  p.body.rotation.x = 0;
}

export function clearPose(p) {
  for (const o of [p.legL, p.legR, p.kneeL, p.kneeR, p.torso, p.armL, p.armR, p.elbowL, p.elbowR, p.hips]) o.rotation.set(0, 0, 0);
}
