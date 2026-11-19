import * as THREE from 'three';

const PISTOL = { damage: 34, cooldown: 0.22, range: 80, clip: 17 };
const PUNCH = { damage: 20, cooldown: 0.42, range: 1.5 };
const AIM_ASSIST = Math.cos(THREE.MathUtils.degToRad(7));

// Fists and a pistol: hitscan from the camera with a little aim assist, tracers and a muzzle flash.
export function createWeapons(scene) {
  const state = { current: 'fists', ammo: 68, cooldown: 0, punchT: 1, aimT: 0 };
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
    state.punchT += dt / PUNCH.cooldown;
    state.aimT -= dt;
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
    let aimAt = null, bestDot = AIM_ASSIST;
    for (const tg of targets) {
      const chest = new THREE.Vector3(tg.pos.x, tg.pos.y + tg.height * 0.65, tg.pos.z);
      const to = chest.clone().sub(eye);
      const d = to.length();
      if (d > PISTOL.range || d < startT) continue;
      const dot = to.divideScalar(d).dot(look);
      if (dot > bestDot) {
        bestDot = dot;
        aimAt = chest;
      }
    }
    // The camera picks the aim point; the bullet itself flies from the shooter's chest so walls next to the camera don't eat it.
    if (!aimAt) aimAt = cast(eye, look, [], colliders, startT).point;
    const origin = new THREE.Vector3(shooter.x, shooter.y + 1.4, shooter.z);
    const dir = aimAt.clone().sub(origin).normalize();
    const hit = cast(origin, dir, targets, colliders, 0.4);
    muzzle.updateWorldMatrix(true, false);
    tracer(new THREE.Vector3().setFromMatrixPosition(muzzle.matrixWorld), hit.point);
    return { ...hit, dir: new THREE.Vector2(dir.x, dir.z).normalize() };
  }

  // Jab whoever is closest in front of the puncher.
  function punch({ pos, heading, targets }) {
    if (state.punchT < 1) return null;
    state.punchT = 0;
    const fx = Math.sin(heading), fz = Math.cos(heading);
    let best = null, bestD = PUNCH.range;
    for (const tg of targets) {
      const dx = tg.pos.x - pos.x, dz = tg.pos.z - pos.z, d = Math.hypot(dx, dz);
      if (d > bestD || Math.abs(tg.pos.y - pos.y) > 1 || (dx * fx + dz * fz) / (d || 1) < 0.4) continue;
      best = tg;
      bestD = d;
    }
    return { target: best, dir: new THREE.Vector2(fx, fz) };
  }

  return { state, cycle, update, shoot, punch, tracer, PISTOL, PUNCH };
}
