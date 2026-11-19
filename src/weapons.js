import * as THREE from 'three';
import { STRIKES } from './people/person.js';

const PISTOL = { cooldown: 0.22, range: 80 };
// Head, torso, legs: nobody drops to fewer than three shots.
const ZONES = [{ name: 'head', above: 1.5, damage: 34 }, { name: 'torso', above: 0.8, damage: 26 }, { name: 'legs', above: -1, damage: 17 }];
// The combo chain; uppercut and kick put people on the floor. Max 10 means at least ten punches to finish anyone.
const MOVES = {
  jab: { damage: 7, time: 0.3, reach: 1.4 },
  cross: { damage: 8, time: 0.34, reach: 1.45 },
  hook: { damage: 9, time: 0.38, reach: 1.35 },
  uppercut: { damage: 10, time: 0.42, reach: 1.3, knock: true },
  kick: { damage: 10, time: 0.5, reach: 1.7, knock: true },
};
const COMBO_WINDOW = 0.9;
const AIM_ASSIST = Math.cos(THREE.MathUtils.degToRad(5));

// Fists and a pistol: hitscan from the camera with a little aim assist, tracers and a muzzle flash.
export function createWeapons(scene) {
  const state = { current: 'fists', ammo: 68, cooldown: 0, aimT: 0, strike: null, combo: 0, sinceStrike: 9 };
  const tracers = [];
  const tracerMat = new THREE.LineBasicMaterial({ color: '#ffe9a8', transparent: true, opacity: 0.9 });
  const flash = new THREE.PointLight('#ffcf70', 0, 6, 2);
  scene.add(flash);

  function cycle() {
    state.current = state.current === 'fists' && state.ammo > 0 ? 'pistol' : 'fists';
  }

  function tracer(from, to) {
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    const line = new THREE.Line(geo, tracerMat.clone());
    scene.add(line);
    tracers.push({ line, t: 0.07 });
    flash.position.copy(from);
    flash.intensity = 6;
  }

  function update(dt) {
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
  }

  // First thing a ray hits: a target capsule ({ pos, height, radius }) or a wall, within range.
  function cast(origin, dir, targets, colliders, startT) {
    let wallT = PISTOL.range;
    for (let t = startT; t < PISTOL.range; t += 0.4) {
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

  // Pistol shot along the camera's aim, nudged onto a nearby target; returns the hit (or null) and where it landed.
  function shoot({ camera, shooter, muzzle, targets, colliders }) {
    if (state.cooldown > 0) return null;
    if (state.ammo <= 0) {
      state.current = 'fists';
      return null;
    }
    state.cooldown = PISTOL.cooldown;
    state.ammo--;
    state.aimT = 0.8;
    const eye = camera.position.clone();
    const look = new THREE.Vector3();
    camera.getWorldDirection(look);
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
        if (d > PISTOL.range || d < startT) continue;
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
    return { ...hit, zone: zone?.name, damage: zone?.damage ?? 0, dir: new THREE.Vector2(dir.x, dir.z).normalize() };
  }

  // Next move in the combo (it resets after a pause), landing on whoever is closest in front.
  function punch({ pos, heading, targets }) {
    if (state.strike && state.strike.k < 0.7) return null;
    state.combo = state.sinceStrike < COMBO_WINDOW ? (state.combo + 1) % STRIKES.length : 0;
    state.sinceStrike = 0;
    const kind = STRIKES[state.combo];
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

  return { state, cycle, update, shoot, punch, tracer, MOVES };
}
