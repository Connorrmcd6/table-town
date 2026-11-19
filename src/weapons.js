import * as THREE from 'three';
import { STRIKES } from './people/person.js';
import { heightAt } from './world/heightmap.js';

export const WEAPON_ORDER = ['fists', 'bat', 'pistol', 'smg', 'c4'];
export const WEAPONS = {
  fists: { label: 'FISTS', type: 'melee' },
  bat: { label: 'BAT', type: 'melee' },
  pistol: { label: 'PISTOL', type: 'gun', cooldown: 0.22, damage: 1, spread: 0, start: 68 },
  smg: { label: 'MACHINE GUN', type: 'gun', cooldown: 0.085, damage: 0.55, spread: 0.022, start: 150 },
  c4: { label: 'C4', type: 'throw', start: 5 },
};
const RANGE = 80;
// Head, torso, legs at full pistol damage: nobody drops to fewer than three shots, whatever the gun.
const ZONES = [{ name: 'head', above: 1.5, damage: 34 }, { name: 'torso', above: 0.8, damage: 26 }, { name: 'legs', above: -1, damage: 17 }];
// The fist combo; uppercut and kick floor people. Max 10 means at least ten punches to finish anyone.
const MOVES = {
  jab: { damage: 7, time: 0.3, reach: 1.4 },
  cross: { damage: 8, time: 0.34, reach: 1.45 },
  hook: { damage: 9, time: 0.38, reach: 1.35 },
  uppercut: { damage: 10, time: 0.42, reach: 1.3, knock: true },
  kick: { damage: 10, time: 0.5, reach: 1.7, knock: true },
  batFore: { damage: 25, time: 0.5, reach: 1.95 },
  batBack: { damage: 25, time: 0.5, reach: 1.95, knock: true },
};
const BAT_SWINGS = ['batFore', 'batBack'];
const COMBO_WINDOW = 0.9;
const AIM_ASSIST = Math.cos(THREE.MathUtils.degToRad(5));
const C4_THROW = 19, GRAVITY = 16;

// Fists, bat, pistol, machine gun and C4: hitscan guns from the camera with mild assist, melee combos, sticky charges.
export function createWeapons(scene) {
  const state = {
    current: 'fists', cooldown: 0, aimT: 0, strike: null, combo: 0, sinceStrike: 9,
    ammo: { pistol: WEAPONS.pistol.start, smg: WEAPONS.smg.start, c4: WEAPONS.c4.start },
  };
  const tracers = [];
  const charges = [];
  const tracerMat = new THREE.LineBasicMaterial({ color: '#ffe9a8', transparent: true, opacity: 0.9 });
  const flash = new THREE.PointLight('#ffcf70', 0, 6, 2);
  scene.add(flash);
  const c4Geo = new THREE.BoxGeometry(0.26, 0.12, 0.18);
  const c4Mat = new THREE.MeshLambertMaterial({ color: '#3d4a2a' });
  const ledGeo = new THREE.BoxGeometry(0.05, 0.03, 0.05);

  const has = (w) => WEAPONS[w].type === 'melee' || state.ammo[w] > 0 || (w === 'c4' && charges.length > 0);

  function select(w) {
    if (has(w)) state.current = w;
  }

  function cycle(step = 1) {
    let i = WEAPON_ORDER.indexOf(state.current);
    for (let n = 0; n < WEAPON_ORDER.length; n++) {
      i = (i + step + WEAPON_ORDER.length) % WEAPON_ORDER.length;
      if (has(WEAPON_ORDER[i])) {
        state.current = WEAPON_ORDER[i];
        return;
      }
    }
  }

  function refill() {
    for (const w of ['pistol', 'smg', 'c4']) state.ammo[w] += WEAPONS[w].start;
  }

  function disarm() {
    for (const w of ['pistol', 'smg', 'c4']) state.ammo[w] = 0;
    state.current = 'fists';
  }

  function tracer(from, to) {
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    const line = new THREE.Line(geo, tracerMat.clone());
    scene.add(line);
    tracers.push({ line, t: 0.07 });
    flash.position.copy(from);
    flash.intensity = 6;
  }

  function update(dt, { vehicles = [], colliders = null } = {}) {
    state.cooldown -= dt;
    state.aimT -= dt;
    state.sinceStrike += dt;
    if (state.strike) {
      state.strike.k += dt / MOVES[state.strike.kind].time;
      if (state.strike.k >= 1) state.strike = null;
    }
    flash.intensity = Math.max(0, flash.intensity - dt * 120);
    for (const tr of [...tracers]) {
      tr.t -= dt;
      tr.line.material.opacity = Math.max(0, tr.t / 0.07);
      if (tr.t <= 0) {
        scene.remove(tr.line);
        tr.line.geometry.dispose();
        tracers.splice(tracers.indexOf(tr), 1);
      }
    }
    for (const c of charges) updateCharge(c, dt, vehicles, colliders);
  }

  // First thing a ray hits: a target capsule ({ pos, height, radius }) or a wall, within range.
  function cast(origin, dir, targets, colliders, startT) {
    let wallT = RANGE;
    for (let t = startT; t < RANGE; t += 0.4) {
      const x = origin.x + dir.x * t, y = origin.y + dir.y * t, z = origin.z + dir.z * t;
      if (colliders.contains(x, z, y)) {
        wallT = t;
        break;
      }
    }
    let best = null, bestT = wallT;
    const flat = dir.x * dir.x + dir.z * dir.z;
    for (const tg of targets) {
      const t = ((tg.pos.x - origin.x) * dir.x + (tg.pos.z - origin.z) * dir.z) / flat;
      if (t < startT || t > bestT) continue;
      const px = origin.x + dir.x * t, pz = origin.z + dir.z * t, py = origin.y + dir.y * t;
      if (Math.hypot(px - tg.pos.x, pz - tg.pos.z) > tg.radius) continue;
      if (py < tg.pos.y || py > tg.pos.y + tg.height) continue;
      best = tg;
      bestT = t;
    }
    return { target: best, point: origin.clone().addScaledVector(dir, bestT) };
  }

  // One round from the current gun along the camera's aim, nudged onto a nearby target; returns the hit and where it landed.
  function shoot({ camera, shooter, muzzle, targets, colliders }) {
    const gun = WEAPONS[state.current];
    if (state.cooldown > 0) return null;
    if (state.ammo[state.current] <= 0) {
      cycle();
      return null;
    }
    state.cooldown = gun.cooldown;
    state.ammo[state.current]--;
    state.aimT = 0.8;
    const eye = camera.position.clone();
    const look = new THREE.Vector3();
    camera.getWorldDirection(look);
    if (gun.spread) {
      look.x += (Math.random() - 0.5) * gun.spread * 2;
      look.y += (Math.random() - 0.5) * gun.spread * 2;
      look.z += (Math.random() - 0.5) * gun.spread * 2;
      look.normalize();
    }
    const startT = eye.distanceTo(shooter) + 0.6;
    const origin = new THREE.Vector3(shooter.x, shooter.y + 1.4, shooter.z);
    const fire = (at) => {
      const dir = at.clone().sub(origin).normalize();
      return { ...cast(origin, dir, targets, colliders, 0.4), dir };
    };
    // The camera picks the aim point; the bullet flies from the shooter's chest so walls beside the camera don't eat it.
    let hit = fire(cast(eye, look, targets, colliders, startT).point);
    if (!hit.target) {
      // Mild assist: only when you'd otherwise miss, nudge onto the chest of someone just off the crosshair.
      let assist = null, bestDot = AIM_ASSIST;
      for (const tg of targets) {
        if (tg.kind === 'car' || tg.kind === 'copcar') continue;
        const chest = new THREE.Vector3(tg.pos.x, tg.pos.y + tg.height * 0.65, tg.pos.z);
        const to = chest.clone().sub(eye);
        const d = to.length();
        if (d > RANGE || d < startT) continue;
        const dot = to.divideScalar(d).dot(look);
        if (dot > bestDot) {
          bestDot = dot;
          assist = chest;
        }
      }
      if (assist) hit = fire(assist);
    }
    const dir = hit.dir;
    muzzle.updateWorldMatrix(true, false);
    tracer(new THREE.Vector3().setFromMatrixPosition(muzzle.matrixWorld), hit.point);
    const zone = hit.target && ZONES.find((z) => hit.point.y - hit.target.pos.y > z.above * (hit.target.height / 1.8));
    const damage = zone ? Math.round(zone.damage * gun.damage) : 0;
    return { ...hit, zone: zone?.name, damage, dir: new THREE.Vector2(dir.x, dir.z).normalize() };
  }

  // Next move in the fist combo or bat swing (it resets after a pause), landing on whoever is closest in front.
  function melee({ pos, heading, targets }) {
    if (state.strike && state.strike.k < 0.7) return null;
    const chain = state.current === 'bat' ? BAT_SWINGS : STRIKES;
    state.combo = state.sinceStrike < COMBO_WINDOW ? (state.combo + 1) % chain.length : 0;
    state.sinceStrike = 0;
    const kind = chain[state.combo % chain.length];
    const move = MOVES[kind];
    state.strike = { kind, k: 0 };
    const fx = Math.sin(heading), fz = Math.cos(heading);
    let best = null, bestD = move.reach;
    for (const tg of targets) {
      const dx = tg.pos.x - pos.x, dz = tg.pos.z - pos.z, d = Math.hypot(dx, dz);
      if (d > bestD || Math.abs(tg.pos.y - pos.y) > 1 || (dx * fx + dz * fz) / (d || 1) < 0.4) continue;
      best = tg;
      bestD = d;
    }
    return { target: best, kind, damage: move.damage, knock: !!move.knock, dir: new THREE.Vector2(fx, fz) };
  }

  // Lob a C4 charge along the camera's aim; it sticks to the first car, wall or patch of ground it touches.
  function throwC4(from, dir) {
    if (state.cooldown > 0 || state.ammo.c4 <= 0) return false;
    state.ammo.c4--;
    state.cooldown = 0.5;
    const mesh = new THREE.Mesh(c4Geo, c4Mat);
    const led = new THREE.Mesh(ledGeo, new THREE.MeshBasicMaterial({ color: '#ff2020' }));
    led.position.y = 0.08;
    mesh.add(led);
    mesh.position.copy(from);
    scene.add(mesh);
    const vel = dir.clone().multiplyScalar(C4_THROW);
    vel.y += 2.5;
    charges.push({ mesh, led, vel, stuck: false, car: null, t: 0 });
    return true;
  }

  function updateCharge(c, dt, vehicles, colliders) {
    c.t += dt;
    c.led.visible = Math.sin(c.t * 12) > 0;
    if (c.stuck) return;
    const p = c.mesh.position;
    c.vel.y -= GRAVITY * dt;
    const prev = p.clone();
    p.addScaledVector(c.vel, dt);
    c.mesh.rotation.x += dt * 8;
    for (const v of vehicles) {
      const dx = p.x - v.pos.x, dz = p.z - v.pos.z;
      if (Math.abs(dx) > 4 || Math.abs(dz) > 4) continue;
      const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
      // A little margin so a charge lobbed at a car's flank sticks instead of dropping beside it.
      if (Math.abs(dx * fx + dz * fz) > v.spec.length / 2 + 0.4 || Math.abs(dx * fz - dz * fx) > v.spec.width / 2 + 0.5) continue;
      if (p.y > v.pos.y + 2.4) continue;
      // Stick it to the car so it rides along until detonation.
      c.stuck = true;
      c.car = v;
      v.model.group.updateMatrixWorld(true);
      v.model.group.attach(c.mesh);
      return;
    }
    const ground = heightAt(p.x, p.z);
    if (p.y <= ground + 0.06 || colliders?.contains(p.x, p.z, p.y)) {
      if (p.y > ground + 0.06) p.copy(prev);
      else p.y = ground + 0.06;
      c.mesh.rotation.set(0, c.mesh.rotation.y, 0);
      c.stuck = true;
    }
  }

  // Set off every charge; returns where each one was (and the car it was stuck to).
  function detonate() {
    const out = charges.map((c) => {
      const pos = new THREE.Vector3();
      c.mesh.getWorldPosition(pos);
      c.mesh.parent?.remove(c.mesh);
      return { pos, car: c.car };
    });
    charges.length = 0;
    if (state.current === 'c4' && state.ammo.c4 <= 0) cycle();
    return out;
  }

  return { state, select, cycle, has, refill, disarm, update, shoot, melee, throwC4, detonate, tracer, charges, MOVES };
}
