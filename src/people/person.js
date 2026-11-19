import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const matCache = new Map();
const mat = (color) => {
  if (!matCache.has(color)) matCache.set(color, new THREE.MeshLambertMaterial({ color }));
  return matCache.get(color);
};

const SKIN = ['#3e2a1e', '#4a2e1e', '#5a3a28', '#6b4430', '#7a5038', '#8f6040', '#a0704c', '#c48f68', '#e0b896'];
const TOPS = ['#c0392b', '#2e86de', '#f1c40f', '#ecf0f1', '#27ae60', '#8e44ad', '#e67e22', '#34495e', '#16a085', '#d35400', '#1b1b1b', '#f4a6b8', '#7d8c3c', '#5b3a6e'];
const BOTTOMS = ['#2c3e50', '#1b1b1b', '#5d6d7e', '#7f6a4f', '#283747', '#b8a88a', '#4a5f8a', '#6b2d2d', '#3d5a80'];
const DRESSES = ['#c0392b', '#f1c40f', '#8e44ad', '#16a085', '#e67e22', '#2e86de', '#f4a6b8', '#ecf0f1'];
const JERSEYS = [['#f2c230', '#1d8f3a'], ['#1b1b1b', '#f2c230'], ['#1d8f3a', '#f2c230'], ['#c0392b', '#ecf0f1'], ['#1f5fbf', '#ecf0f1']];
const OVERALLS = ['#1d3a7a', '#24324f', '#3d6b3a', '#b0412a'];
const HIVIS = ['#c8f03c', '#ff7a1a'];
const SHOES = ['#f4f4f0', '#1b1b1b', '#7a5038', '#c0392b', '#2e86de'];
const HAIR = ['#120c08', '#120c08', '#1f1510', '#3b2414', '#6b4a2a', '#b08850', '#8a8a8a'];
const HATS = ['#c0392b', '#1b1b1b', '#2e86de', '#f1c40f', '#ecf0f1', '#27ae60', '#d9c38a', '#8e44ad', '#e67e22'];
const MALE_HAIR = ['short', 'short', 'short', 'bald', 'cap', 'cap', 'bucket', 'beanie', 'afro'];
const FEMALE_HAIR = ['braids', 'braids', 'doek', 'doek', 'bun', 'afro', 'long', 'ponytail', 'beanie', 'short'];
const MALE_OUTFITS = ['tee', 'tee', 'tee', 'longTee', 'hoodie', 'jacket', 'overalls', 'hivis', 'jersey'];
const FEMALE_OUTFITS = ['tee', 'tee', 'longTee', 'dress', 'dress', 'skirt', 'skirt', 'hoodie', 'jacket', 'jersey'];
const ACCESSORIES = ['none', 'none', 'none', 'none', 'backpack', 'bag', 'shades', 'chain'];
const BUILDS = { slim: 0.88, average: 1, heavy: 1.2 };

const SEG = 9;
const tube = (rTop, rBot, h, depth = 1) => new THREE.CylinderGeometry(rTop, rBot, h, SEG).scale(1, 1, depth);
const ball = (r, sx = 1, sy = 1, sz = 1) => new THREE.IcosahedronGeometry(r, 1).scale(sx, sy, sz);
const cap = (r, sx = 1, sy = 1, sz = 1, cover = 0.55) => new THREE.SphereGeometry(r, 10, 5, 0, Math.PI * 2, 0, Math.PI * cover).scale(sx, sy, sz);
const block = (w, h, d) => new THREE.BoxGeometry(w, h, d);

function add(group, geo, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, mat(color));
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  group.add(m);
  return m;
}

const PERSON_MAT = new THREE.MeshLambertMaterial({ vertexColors: true });

// Collapse a joint's own parts into one vertex-coloured mesh so each body segment is a single draw call.
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

export function randomLook(rnd = Math.random) {
  const p = (a) => a[Math.floor(rnd() * a.length)];
  const female = rnd() < 0.5;
  const outfit = p(female ? FEMALE_OUTFITS : MALE_OUTFITS);
  const look = {
    gender: female ? 'f' : 'm', build: p(['slim', 'average', 'average', 'average', 'heavy']), outfit,
    skin: p(SKIN), top: p(TOPS), accent: p(TOPS), bottom: p(BOTTOMS), shoes: p(SHOES), hair: p(HAIR), hat: p(HATS),
    hairStyle: p(female ? FEMALE_HAIR : MALE_HAIR), shoeStyle: p(['sneaker', 'sneaker', 'sneaker', 'boot', 'sandal']),
    accessory: p(ACCESSORIES), beard: !female && rnd() < 0.3,
    shorts: !['dress', 'skirt', 'overalls'].includes(outfit) && rnd() < 0.22,
    scale: female ? 0.88 + rnd() * 0.12 : 0.93 + rnd() * 0.15,
  };
  if (outfit === 'dress') look.top = p(DRESSES);
  if (outfit === 'skirt') look.bottom = p(DRESSES);
  if (outfit === 'jersey') [look.top, look.accent] = p(JERSEYS);
  if (outfit === 'overalls') look.top = look.bottom = p(OVERALLS);
  if (outfit === 'hivis') look.top = p(HIVIS);
  if (outfit === 'overalls' || outfit === 'hivis') look.shoeStyle = 'boot';
  return look;
}

const SHORT_SLEEVES = new Set(['tee', 'jersey', 'hivis']);

function withDefaults(look) {
  const l = { gender: 'm', build: 'average', outfit: look.longSleeves ? 'longTee' : 'tee', accent: '#ecf0f1', shoeStyle: 'sneaker', accessory: 'none', beard: false, ...look };
  l.w = BUILDS[l.build] ?? 1;
  l.female = l.gender === 'f';
  l.sleeve = l.outfit === 'hivis' ? l.accent : l.top;
  l.bare = l.outfit === 'dress';
  l.short = l.bare || SHORT_SLEEVES.has(l.outfit);
  return l;
}

function shoe(l) {
  const g = new THREE.Group();
  if (l.shoeStyle === 'boot') {
    add(g, block(0.14, 0.15, 0.25), '#4a3322', 0, 0.02, 0.04);
    add(g, block(0.15, 0.035, 0.27), '#1b1b1b', 0, -0.06, 0.045);
  } else if (l.shoeStyle === 'sandal') {
    add(g, block(0.11, 0.06, 0.23), l.skin, 0, -0.01, 0.05);
    add(g, block(0.13, 0.025, 0.26), l.shoes, 0, -0.055, 0.05);
    add(g, block(0.12, 0.02, 0.04), l.shoes, 0, 0.01, 0.1);
  } else {
    add(g, block(0.13, 0.08, 0.26), l.shoes, 0, -0.01, 0.05);
    add(g, block(0.14, 0.03, 0.275), '#f4f4f0', 0, -0.055, 0.05);
  }
  return g;
}

function leg(l, x) {
  const w = l.w * (l.female ? 0.95 : 1);
  const skirted = l.outfit === 'dress' || l.outfit === 'skirt';
  const thigh = skirted ? l.skin : l.bottom, shin = skirted || l.shorts ? l.skin : l.bottom;
  const root = new THREE.Group();
  root.position.set(x, -0.04, 0);
  add(root, tube(0.09 * w, 0.066 * w, 0.48), thigh, 0, -0.22, 0);
  if (l.shorts) add(root, tube(0.08 * w, 0.078 * w, 0.06), l.bottom, 0, -0.4, 0);
  const joint = new THREE.Group();
  joint.position.y = -0.46;
  add(joint, ball(0.066 * w), shin);
  add(joint, tube(0.064 * w, 0.048 * w, 0.42), shin, 0, -0.21, 0);
  if (l.outfit === 'overalls') add(joint, tube(0.068 * w, 0.06 * w, 0.035), '#d8d8d8', 0, -0.12, 0);
  const foot = shoe(l);
  foot.position.y = -0.44;
  joint.add(foot);
  root.add(joint);
  return { root, joint };
}

function arm(l, side) {
  const w = l.w * (l.female ? 0.88 : 1);
  const root = new THREE.Group();
  root.position.set(side * (l.female ? 0.25 : 0.285) * Math.sqrt(l.w), 0.54, 0);
  const upper = l.bare ? l.skin : l.sleeve;
  add(root, ball(0.07 * w), upper, 0, -0.03, 0);
  if (l.short && !l.bare) {
    add(root, tube(0.078 * w, 0.074 * w, 0.15), l.sleeve, 0, -0.07, 0);
    add(root, tube(0.06 * w, 0.054 * w, 0.18), l.skin, 0, -0.2, 0);
  } else add(root, tube(0.068 * w, 0.056 * w, 0.3), upper, 0, -0.15, 0);
  const fore = l.short ? l.skin : l.sleeve;
  const joint = new THREE.Group();
  joint.position.y = -0.3;
  add(joint, ball(0.056 * w), fore);
  add(joint, tube(0.054 * w, 0.044 * w, 0.26), fore, 0, -0.13, 0);
  if (!l.short) add(joint, tube(0.05 * w, 0.05 * w, 0.03), l.outfit === 'overalls' ? '#d8d8d8' : l.sleeve, 0, -0.245, 0);
  add(joint, ball(0.05, 0.8, 1.15, 0.95), l.skin, 0, -0.31, 0.005);
  root.add(joint);
  return { root, joint };
}

function pelvis(l, hips) {
  const w = l.w, hip = l.female ? 1.1 : 1;
  add(hips, tube(0.165 * w * hip, 0.17 * w * hip, 0.2, 0.66), l.bottom, 0, -0.01, 0);
  if (l.outfit === 'dress') add(hips, tube(0.18 * w * hip, 0.29 * w, 0.52, 0.8), l.top, 0, -0.16, 0);
  else if (l.outfit === 'skirt') add(hips, tube(0.18 * w * hip, 0.27 * w, 0.42, 0.8), l.bottom, 0, -0.11, 0);
  else if (l.outfit !== 'overalls') add(hips, tube(0.168 * w * hip, 0.168 * w * hip, 0.035, 0.67), '#2a1d14', 0, 0.075, 0);
  if (l.outfit === 'uniform') add(hips, tube(0.172 * w, 0.172 * w, 0.05, 0.68), '#111111', 0, 0.075, 0);
}

function chest(l, torso) {
  const w = l.w, sh = l.female ? 0.86 : 1, hip = l.female ? 1.05 : 1;
  const dz = 0.62 * (l.build === 'heavy' ? 1.12 : 1);
  add(torso, tube(0.17 * w * (l.female ? 0.88 : 1), 0.165 * w * hip, 0.26, dz), l.top, 0, 0.17, 0);
  add(torso, tube(0.215 * w * sh, 0.17 * w * (l.female ? 0.88 : 1), 0.3, dz), l.top, 0, 0.43, 0);
  add(torso, cap(0.215 * w * sh, 1, 0.38, dz, 0.5), l.top, 0, 0.575, 0);
  if (l.build === 'heavy') add(torso, ball(0.16 * w, 1, 0.85, 0.8), l.top, 0, 0.2, 0.05);
  if (l.female) add(torso, ball(0.085, 1.5, 0.6, 0.55), l.top, 0, 0.45, 0.085 * w * dz);
  const front = 0.13 * w * dz + 0.008;
  switch (l.outfit) {
    case 'dress':
      add(torso, tube(0.07, 0.07, 0.02, 0.5), l.skin, 0, 0.585, 0.06);
      break;
    case 'hoodie':
      add(torso, ball(0.15 * w, 1.15, 0.45, 0.7), l.top, 0, 0.6, -0.09);
      add(torso, block(0.2 * w, 0.1, 0.03), l.top, 0, 0.16, front + 0.01);
      add(torso, block(0.01, 0.12, 0.01), l.accent, 0.035, 0.5, front + 0.02);
      add(torso, block(0.01, 0.12, 0.01), l.accent, -0.035, 0.5, front + 0.02);
      break;
    case 'jacket':
      add(torso, block(0.1, 0.5, 0.03), l.accent, 0, 0.32, front);
      add(torso, block(0.012, 0.46, 0.012), '#9a9a9a', 0.055, 0.32, front + 0.015);
      break;
    case 'hivis':
    case 'overalls':
      for (const y of [0.24, 0.42]) add(torso, tube(0.2 * w * sh, 0.2 * w * sh, 0.035, dz + 0.02), '#d8d8d8', 0, y, 0);
      break;
    case 'jersey':
      add(torso, tube(0.207 * w * sh, 0.19 * w, 0.07, dz + 0.02), l.accent, 0, 0.47, 0);
      add(torso, block(0.1, 0.12, 0.02), l.accent, 0, 0.36, -(front + 0.005));
      break;
    case 'uniform':
      add(torso, block(0.05, 0.05, 0.015), '#d4a72c', 0.09, 0.47, front + 0.005);
      add(torso, block(0.07, 0.02, 0.12), '#d4a72c', 0.17 * w, 0.585, 0);
      add(torso, block(0.07, 0.02, 0.12), '#d4a72c', -0.17 * w, 0.585, 0);
      break;
    case 'tee':
    case 'longTee':
      add(torso, tube(0.07, 0.075, 0.025, 0.6), l.skin, 0, 0.59, 0.02);
      break;
  }
  if (l.accessory === 'backpack') {
    add(torso, block(0.26 * w, 0.32, 0.12), l.accent, 0, 0.38, -(0.13 * w * dz + 0.06));
    add(torso, block(0.03, 0.36, 0.02), '#222', 0.09, 0.4, front);
    add(torso, block(0.03, 0.36, 0.02), '#222', -0.09, 0.4, front);
  } else if (l.accessory === 'bag') {
    add(torso, block(0.025, 0.55, 0.012), '#3a2a1e', 0, 0.36, front + 0.004, 0, 0, 0.62);
    add(torso, block(0.07, 0.16, 0.2), l.accent, -0.2 * w, 0.08, 0.02);
  } else if (l.accessory === 'chain') {
    add(torso, new THREE.TorusGeometry(0.075, 0.009, 4, 12), '#e0b23c', 0, 0.53, 0.07, -1.15);
  }
}

function hair(g, l) {
  const h = l.hair, hat = l.hat;
  const crown = () => add(g, cap(0.132, 0.98, 1.02, 1.05), h, 0, 0.205, -0.005, -0.45);
  switch (l.hairStyle) {
    case 'short':
      crown();
      break;
    case 'long':
      crown();
      add(g, tube(0.12, 0.135, 0.3, 0.5), h, 0, 0.12, -0.075);
      break;
    case 'braids':
      crown();
      for (let i = 0; i < 9; i++) {
        const a = Math.PI * (0.62 + (i / 8) * 0.76);
        add(g, tube(0.016, 0.012, 0.32, 1), h, Math.cos(a) * 0.11, 0.08, Math.sin(a) * 0.1 - 0.02, 0.12 * Math.sin(a), 0, -0.12 * Math.cos(a));
      }
      break;
    case 'ponytail':
      crown();
      add(g, tube(0.035, 0.018, 0.24), h, 0, 0.17, -0.18, -0.5);
      add(g, tube(0.03, 0.03, 0.025), l.accent, 0, 0.27, -0.14, -0.5);
      break;
    case 'bun':
      crown();
      add(g, ball(0.065), h, 0, 0.34, -0.07);
      break;
    case 'afro':
      add(g, ball(0.18, 1, 0.82, 1), h, 0, 0.3, -0.055);
      break;
    case 'cap':
      add(g, cap(0.138, 1, 0.82, 1.03), hat, 0, 0.26, 0, -0.1);
      add(g, block(0.2, 0.02, 0.13), hat, 0, 0.275, 0.16, 0.12);
      add(g, ball(0.012), hat, 0, 0.375, 0);
      break;
    case 'bucket':
      add(g, tube(0.13, 0.145, 0.11), hat, 0, 0.34, -0.005);
      add(g, tube(0.15, 0.225, 0.035), hat, 0, 0.29, -0.005);
      break;
    case 'doek':
      add(g, ball(0.155, 1, 0.75, 1.05), hat, 0, 0.3, -0.04, -0.3);
      add(g, ball(0.085, 1.3, 0.8, 1), hat, 0, 0.43, -0.03, -0.2);
      add(g, tube(0.136, 0.136, 0.035, 1.05), l.accent, 0, 0.27, -0.015, -0.3);
      break;
    case 'beanie':
      add(g, cap(0.14, 1, 1.05, 1.04, 0.5), hat, 0, 0.23, -0.005, -0.25);
      add(g, tube(0.142, 0.142, 0.05, 1.04), hat, 0, 0.245, -0.008, -0.25);
      break;
  }
}

function head(l) {
  const g = new THREE.Group();
  const skin = l.skin;
  add(g, tube(0.052, 0.06, 0.12), skin, 0, 0.04, 0);
  add(g, ball(0.125, 0.92, 1.1, 1), skin, 0, 0.205, 0);
  if (!l.female) add(g, block(0.16, 0.08, 0.15), skin, 0, 0.12, 0.02);
  add(g, ball(0.028, 0.6, 1, 0.9), skin, 0.112, 0.2, -0.01);
  add(g, ball(0.028, 0.6, 1, 0.9), skin, -0.112, 0.2, -0.01);
  for (const s of [1, -1]) {
    add(g, block(0.04, 0.028, 0.015), '#f2efe6', s * 0.045, 0.225, 0.116);
    add(g, block(0.02, 0.026, 0.012), '#141414', s * 0.045, 0.225, 0.122);
    add(g, block(0.05, 0.014, 0.02), l.hair, s * 0.047, 0.258, 0.11, 0, 0, s * -0.12);
  }
  add(g, tube(0.012, 0.026, 0.06), skin, 0, 0.19, 0.128, 0.35);
  add(g, block(0.06, 0.016, 0.015), l.female ? '#7a2e2e' : '#4a2420', 0, 0.135, 0.115);
  if (l.beard) add(g, ball(0.115, 0.95, 0.55, 0.95), l.hair, 0, 0.135, 0.022);
  if (l.accessory === 'shades') add(g, block(0.15, 0.035, 0.02), '#0d0d0d', 0, 0.227, 0.126);
  hair(g, l);
  return g;
}

// A jointed low-poly person facing +z, feet at y = 0.
export function makePerson(look, { shadow = false } = {}) {
  const l = withDefaults(look);
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);

  const hips = new THREE.Group();
  hips.position.y = 0.94;
  body.add(hips);
  pelvis(l, hips);
  const legs = [leg(l, 0.1 * l.w), leg(l, -0.1 * l.w)];
  for (const lg of legs) hips.add(lg.root);

  const torso = new THREE.Group();
  hips.add(torso);
  chest(l, torso);
  const neckHead = head(l);
  neckHead.position.y = 0.58;
  torso.add(neckHead);

  const arms = [arm(l, 1), arm(l, -1)];
  for (const a of arms) torso.add(a.root);

  g.scale.setScalar(l.scale);
  const segments = [hips, torso, neckHead, ...legs.flatMap((lg) => [lg.root, lg.joint]), ...arms.flatMap((a) => [a.root, a.joint])];
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
  for (const o of [p.armL, p.armR, p.legL, p.legR]) set(o, 'y', 0);
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

export const STRIKES = ['jab', 'cross', 'hook', 'uppercut', 'kick'];

function guard(p, side) {
  const arm = side < 0 ? p.armL : p.armR, elbow = side < 0 ? p.elbowL : p.elbowR;
  arm.rotation.set(-1.15, 0, side * -0.2);
  elbow.rotation.x = -1.95;
}

// Vaulting a wall: one hand planted, legs tucked and swung through, then reaching down for the ground.
export function poseVault(p, k) {
  const tuck = Math.sin(Math.min(1, k) * Math.PI);
  p.body.rotation.x = 0;
  p.body.position.set(0, 0, 0);
  p.armL.rotation.set(-0.9 + tuck * 0.6, 0, 0.3);
  p.elbowL.rotation.x = -0.2;
  p.armR.rotation.set(-1.6 - tuck * 0.5, 0, -0.5);
  p.elbowR.rotation.x = -0.6;
  p.legL.rotation.set(-1.4 * tuck, 0, 0.35 * tuck);
  p.legR.rotation.set(-1.2 * tuck, 0, 0.45 * tuck);
  p.kneeL.rotation.x = 1.7 * tuck;
  p.kneeR.rotation.x = 1.5 * tuck;
  p.torso.rotation.set(0.35 * tuck, 0, -0.25 * tuck);
}

// Bat keyframes: a = right arm sweep across the body (negative is the right side), yaw/lift = where the bat points
// around the body (0 is straight ahead, positive to the left) and how far it tilts up.
const BAT_READY = { a: -0.55, pitch: 0.95, elbow: -1.35, yaw: -2.3, lift: 1.15, tx: 0.08, ty: -0.3, hy: 0 };
const BAT_KEYS = {
  batFore: [
    { a: -1.45, pitch: 0.5, elbow: -1.4, yaw: -2.7, lift: 0.55, tx: 0.02, ty: -0.85, hy: -0.3 },
    { a: 0.05, pitch: 0.35, elbow: -0.15, yaw: 0.25, lift: 0.05, tx: 0.18, ty: 0.35, hy: 0.25 },
    { a: 1.3, pitch: -0.25, elbow: -1.15, yaw: 2.4, lift: 0.6, tx: 0.1, ty: 0.85, hy: 0.4 },
  ],
  batBack: [
    { a: 1.35, pitch: -0.05, elbow: -1.3, yaw: 2.6, lift: 0.6, tx: 0.04, ty: 0.85, hy: 0.35 },
    { a: -0.35, pitch: 0.35, elbow: -0.2, yaw: -0.3, lift: 0.05, tx: 0.18, ty: -0.35, hy: -0.25 },
    { a: -1.4, pitch: -0.15, elbow: -1.05, yaw: -2.4, lift: 0.55, tx: 0.1, ty: -0.85, hy: -0.4 },
  ],
};
const easeIn = (x) => x * x * x, easeOut = (x) => 1 - (1 - x) ** 2;
const wrapAngle = (x) => Math.atan2(Math.sin(x), Math.cos(x));

// Quick wind-up, a whip through contact (when the hit lands), a wrapping follow-through, then back to ready.
function batSwing(mode, k) {
  const [wind, contact, follow] = BAT_KEYS[mode];
  const [from, to, t] = k < 0.14 ? [BAT_READY, wind, smooth(k / 0.14)]
    : k < 0.3 ? [wind, contact, easeIn((k - 0.14) / 0.16)]
      : k < 0.5 ? [contact, follow, easeOut((k - 0.3) / 0.2)]
        : [follow, BAT_READY, smooth((k - 0.5) / 0.5)];
  const out = {};
  for (const key in from) out[key] = from[key] + (key === 'yaw' ? wrapAngle(to.yaw - from.yaw) : to[key] - from[key]) * t;
  return out;
}

const DOWN = new THREE.Vector3(0, -1, 0);
const _v = new THREE.Vector3(), _u = new THREE.Vector3(), _w = new THREE.Vector3(), _z = new THREE.Vector3(), _x = new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m = new THREE.Matrix4();
const LEFT_POLE = new THREE.Vector3(1, -1, -0.6).normalize();

// Two-bone reach for the left arm so the off hand grips the bat handle just below the right hand.
function reachLeft(p, target) {
  const upper = 0.3, lower = 0.31;
  _u.copy(target).sub(p.armL.position);
  const d = Math.min(upper + lower - 1e-3, Math.max(0.12, _u.length()));
  _u.normalize();
  const alpha = Math.acos((upper * upper + d * d - lower * lower) / (2 * upper * d));
  const gamma = Math.acos((upper * upper + lower * lower - d * d) / (2 * upper * lower));
  _z.copy(LEFT_POLE).addScaledVector(_u, -LEFT_POLE.dot(_u)).normalize();
  _w.copy(_u).multiplyScalar(Math.cos(alpha)).addScaledVector(_z, Math.sin(alpha));
  _z.copy(_u).addScaledVector(_w, -_u.dot(_w)).normalize();
  _v.copy(_w).negate();
  _x.crossVectors(_v, _z);
  p.armL.quaternion.setFromRotationMatrix(_m.makeBasis(_x, _v, _z));
  p.elbowL.rotation.set(-(Math.PI - gamma), 0, 0);
}

function batPose(p, b) {
  p.armR.rotation.set(-Math.PI / 2 + b.pitch, 0, b.a);
  p.elbowR.rotation.x = b.elbow;
  p.torso.rotation.set(b.tx, b.ty, 0);
  p.hips.rotation.y = b.hy;
  p.legL.rotation.y = p.legR.rotation.y = -b.hy;
  if (!p.held) {
    p.armL.rotation.set(-Math.PI / 2 + b.pitch + 0.15, 0, b.a - 0.35);
    p.elbowL.rotation.x = b.elbow - 0.45;
    return;
  }
  const bat = aimBat(p, b.yaw, b.lift);
  reachLeft(p, p.torso.worldToLocal(bat.localToWorld(_v.set(0, 0.075, 0))));
}

// Point the bat in body space (yaw 0 straight ahead, lift up from level), expressed in the forearm's frame.
function aimBat(p, yaw, lift) {
  const bat = p.held.bat;
  p.group.updateMatrixWorld(true);
  _v.set(Math.sin(yaw) * Math.cos(lift), Math.sin(lift), Math.cos(yaw) * Math.cos(lift));
  _q.setFromUnitVectors(DOWN, _v).premultiply(p.group.getWorldQuaternion(_q2));
  bat.quaternion.copy(p.elbowR.getWorldQuaternion(_q2).invert().multiply(_q));
  bat.updateMatrixWorld(true);
  return bat;
}

// Upper-body overlays on top of the walk cycle: pistol aim (pitch down is positive), fists-up guard,
// a flinch from being hit, or one of the STRIKES (k runs 0..1 through the move).
export function poseArms(p, arms) {
  const hit = Math.sin(Math.min(1, arms.k ?? 0) * Math.PI);
  switch (arms.mode) {
    case 'aim':
      p.armR.rotation.set(-Math.PI / 2 + arms.pitch, 0, 0.05);
      p.elbowR.rotation.x = 0;
      p.armL.rotation.set(-Math.PI / 2 + arms.pitch + 0.1, 0, -0.45);
      p.elbowL.rotation.x = -0.3;
      p.torso.rotation.set(0, 0, 0);
      break;
    case 'guard':
      guard(p, 1);
      guard(p, -1);
      p.torso.rotation.set(0.12, 0, 0);
      break;
    case 'flinch':
      guard(p, 1);
      guard(p, -1);
      p.torso.rotation.set(-0.45 * hit, (arms.side || 1) * 0.3 * hit, 0);
      break;
    case 'jab':
      guard(p, 1);
      p.armL.rotation.set(-0.6 - hit * 1.0, 0, 0.1);
      p.elbowL.rotation.x = -1.6 + hit * 1.5;
      p.torso.rotation.set(0.1, 0.25 - hit * 0.45, 0);
      break;
    case 'cross':
      guard(p, -1);
      p.armR.rotation.set(-0.6 - hit * 1.0, 0, -0.1);
      p.elbowR.rotation.x = -1.6 + hit * 1.5;
      p.torso.rotation.set(0.1, -0.35 + hit * 0.7, 0);
      break;
    case 'hook':
      guard(p, 1);
      p.armL.rotation.set(-1.5, 0, 0.95 - hit * 1.2);
      p.elbowL.rotation.x = -1.4;
      p.torso.rotation.set(0.1, -0.5 + hit * 1.0, 0);
      break;
    case 'uppercut':
      guard(p, -1);
      p.armR.rotation.set(-0.2 - hit * 2.3, 0, -0.1);
      p.elbowR.rotation.x = -2.0 + hit * 0.9;
      p.torso.rotation.set(0.3 - hit * 0.45, 0.3 * hit, 0);
      p.kneeL.rotation.x = 0.5 * (1 - hit);
      p.kneeR.rotation.x = 0.5 * (1 - hit);
      break;
    case 'batFore':
    case 'batBack':
      batPose(p, batSwing(arms.mode, Math.min(1, arms.k ?? 0)));
      break;
    case 'batReady':
      p.armR.rotation.set(-0.45, 0, -0.15);
      p.elbowR.rotation.x = -2.1;
      if (p.held) aimBat(p, -2.8, 0.75);
      p.legL.rotation.y = p.legR.rotation.y = 0;
      break;
    case 'kick':
      guard(p, 1);
      guard(p, -1);
      p.legR.rotation.set(-1.7 * hit, 0, 0);
      p.kneeR.rotation.x = 1.3 * (1 - hit) + 0.1;
      p.legL.rotation.set(0.15 * hit, 0, 0);
      p.kneeL.rotation.x = 0.2;
      p.torso.rotation.set(-0.3 * hit, 0, 0);
      break;
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

// Dying: knees buckle, then a slumped fall onto the back with arms flung out; t is seconds since death.
export function poseDead(p, t, side = 1) {
  const buckle = Math.min(1, t / 0.35), fall = Math.min(1, Math.max(0, (t - 0.25) / 0.45));
  const ease = fall * fall * (3 - 2 * fall);
  p.kneeL.rotation.x = 1.2 * buckle * (1 - ease) + 0.3 * ease;
  p.kneeR.rotation.x = 1.0 * buckle * (1 - ease) + 0.5 * ease;
  p.legL.rotation.set(-0.6 * buckle * (1 - ease) - 0.2 * ease, 0, 0.15 * ease);
  p.legR.rotation.set(-0.4 * buckle * (1 - ease) + 0.1 * ease, 0, -0.2 * ease);
  p.torso.rotation.set(0.4 * buckle * (1 - ease), 0, side * 0.25 * ease);
  p.armL.rotation.set(-0.3 * (1 - ease) - 0.4 * ease, 0, 1.2 * ease);
  p.armR.rotation.set(-0.3 * (1 - ease) - 0.6 * ease, 0, -1.0 * ease);
  p.elbowL.rotation.x = -0.4;
  p.elbowR.rotation.x = -0.2;
  p.body.rotation.set(-Math.PI / 2 * ease, 0, side * 0.2 * ease);
  p.body.position.set(0, 0.15 * ease - 0.35 * buckle * (1 - ease), 0);
}

// The player's other weapons in the right hand: machine gun, bat and a C4 brick (the pistol comes from addPistol).
export function addArsenal(p) {
  const dark = new THREE.MeshLambertMaterial({ color: '#202124' });
  const smg = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.36, 0.1), dark);
  body.position.set(0, -0.12, 0.04);
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.16), dark);
  mag.position.set(0, -0.08, -0.08);
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.05), dark);
  stock.position.set(0, 0.12, 0.05);
  const smgMuzzle = new THREE.Object3D();
  smgMuzzle.position.set(0, -0.32, 0.04);
  smg.add(body, mag, stock, smgMuzzle);
  smg.position.set(0, -0.3, 0.02);
  const batGeo = mergeGeometries([
    new THREE.CylinderGeometry(0.022, 0.058, 0.82, 10).translate(0, -0.33, 0),
    new THREE.SphereGeometry(0.058, 10, 5, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2).translate(0, -0.74, 0),
    new THREE.CylinderGeometry(0.036, 0.03, 0.03, 10).translate(0, 0.09, 0),
  ]);
  const bat = new THREE.Group();
  bat.add(new THREE.Mesh(batGeo, new THREE.MeshLambertMaterial({ color: '#b8854a' })));
  bat.position.set(0, -0.3, 0.01);
  const c4 = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, 0.12), new THREE.MeshLambertMaterial({ color: '#3d4a2a' }));
  c4.position.set(0, -0.33, 0.04);
  for (const m of [smg, bat, c4]) {
    m.visible = false;
    p.elbowR.add(m);
  }
  p.held = { pistol: p.gun, smg, bat, c4 };
  p.smgMuzzle = smgMuzzle;
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
