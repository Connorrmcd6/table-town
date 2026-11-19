import { Car } from './vehicles/car.js';
import { makeVehicle } from './vehicles/models.js';
import { heightAt } from './world/heightmap.js';
import { createOfficers } from './people/officers.js';

const STAR_HEAT = [20, 80, 180, 320, 500];
const MAX_HEAT = 700;
const SEE_RANGE = 70;

export function starsFor(heat) {
  return STAR_HEAT.filter((h) => heat >= h).length;
}

// Push two physics cars apart and cancel their closing speed; returns the impact speed.
export function collideCars(a, b) {
  if (Math.abs(a.pos.x - b.pos.x) > 8 || Math.abs(a.pos.z - b.pos.z) > 8) return 0;
  let impact = 0;
  for (const ca of a.circles()) {
    for (const cb of b.circles()) {
      const dx = ca.x - cb.x, dz = ca.z - cb.z;
      const d = Math.hypot(dx, dz), min = ca.r + cb.r;
      if (d >= min || d < 1e-4) continue;
      const nx = dx / d, nz = dz / d, push = (min - d) / 2;
      a.pos.x += nx * push; a.pos.z += nz * push;
      b.pos.x -= nx * push; b.pos.z -= nz * push;
      const rel = (a.vel.x - b.vel.x) * nx + (a.vel.y - b.vel.y) * nz;
      if (rel < 0) {
        a.vel.x -= nx * rel * 0.6; a.vel.y -= nz * rel * 0.6;
        b.vel.x += nx * rel * 0.6; b.vel.y += nz * rel * 0.6;
        impact = Math.max(impact, -rel);
      }
      return impact;
    }
  }
  return impact;
}

function lineClear(colliders, ax, az, bx, bz) {
  const len = Math.hypot(bx - ax, bz - az);
  for (let d = 4; d < len - 3; d += 4) {
    if (colliders.contains(ax + ((bx - ax) * d) / len, az + ((bz - az) * d) / len)) return false;
  }
  return true;
}

export function createPolice(scene, traffic) {
  const state = { heat: 0, stars: 0, seen: false, bust: 0 };
  const chasers = [];
  const officers = createOfficers(scene);
  let spawnTimer = 0, pathTimer = 0, flash = 0;
  let distMap = new Map();

  function addHeat(amount) {
    state.heat = Math.min(MAX_HEAT, state.heat + amount);
  }

  // Jump straight to at least this many stars.
  function raiseTo(stars) {
    // Land near the top of the band so the level sticks for a while once they lose sight of you.
    const ceiling = stars < STAR_HEAT.length ? STAR_HEAT[stars] - 1 : MAX_HEAT;
    state.heat = Math.max(state.heat, ceiling);
    state.stars = starsFor(state.heat);
  }

  function remove(c) {
    c.alive = false;
    scene.remove(c.car.model.group);
    chasers.splice(chasers.indexOf(c), 1);
  }

  function clear() {
    state.heat = 0;
    state.bust = 0;
    for (const c of [...chasers]) remove(c);
    officers.clear();
  }

  function spawn(target, viewYaw) {
    const fx = Math.sin(viewYaw), fz = Math.cos(viewYaw);
    const options = traffic.nodes.filter((n) => {
      const dx = n.x - target.x, dz = n.z - target.z, d = Math.hypot(dx, dz);
      return d > 90 && d < 200 && (dx * fx + dz * fz) / d < 0.3;
    });
    if (!options.length) return;
    const n = options[Math.floor(Math.random() * options.length)];
    const model = makeVehicle('police');
    scene.add(model.group);
    const car = new Car(model, n.x, n.z, Math.atan2(target.x - n.x, target.z - n.z));
    chasers.push({ car, stuck: 0, reverse: 0, aim: { x: target.x, z: target.z }, officers: [], alive: true });
  }

  function rebuildPaths(target) {
    const start = traffic.nearestNode(target.x, target.z);
    distMap = new Map([[start, 0]]);
    const queue = [start];
    while (queue.length) {
      const n = queue.shift();
      const d = distMap.get(n);
      for (const { node } of n.nbrs) {
        if (distMap.has(node)) continue;
        distMap.set(node, d + 1);
        queue.push(node);
      }
    }
  }

  function aimFor(c, target, colliders) {
    const p = c.car.pos;
    const d = Math.hypot(target.x - p.x, target.z - p.z);
    if (d < 50 && lineClear(colliders, p.x, p.z, target.x, target.z)) {
      c.aim = { x: target.x + target.vx * 0.6, z: target.z + target.vz * 0.6 };
      return;
    }
    const here = traffic.nearestNode(p.x, p.z);
    if (!distMap.has(here)) {
      c.aim = { x: target.x, z: target.z };
      return;
    }
    let best = here, bestD = distMap.get(here);
    for (const { node } of here.nbrs) {
      const nd = distMap.get(node) ?? Infinity;
      if (nd < bestD) { best = node; bestD = nd; }
    }
    if (best === here && Math.hypot(here.x - p.x, here.z - p.z) < 8) c.aim = { x: target.x, z: target.z };
    else c.aim = { x: best.x, z: best.z };
  }

  function drive(c, dt, target, colliders, onFoot) {
    const car = c.car;
    const dx = c.aim.x - car.pos.x, dz = c.aim.z - car.pos.z;
    let diff = Math.atan2(dx, dz) - car.heading;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    const dist = Math.hypot(target.x - car.pos.x, target.z - car.pos.z);
    const speed = car.speed;
    const turnAround = Math.abs(diff) >= 1.7 && speed > 6;
    const input = { throttle: !turnAround, brake: turnAround, steer: Math.max(-1, Math.min(1, diff * 2.5)), handbrake: Math.abs(diff) > 0.9 && speed > 14 };
    // Roll up on a pedestrian and stop short rather than mowing them down.
    if (onFoot && dist < 60 && (dist < 10 || speed > Math.max(2, (dist - 9) * 0.55))) {
      input.throttle = false;
      input.brake = true;
    }
    if (input.throttle && Math.abs(speed) < 1) c.stuck += dt;
    else c.stuck = Math.max(0, c.stuck - dt);
    if (c.stuck > 1.2) { c.reverse = 1.3; c.stuck = 0; }
    if (c.reverse > 0) {
      c.reverse -= dt;
      input.throttle = false;
      input.brake = true;
      input.steer = -input.steer;
    }
    car.update(dt, input, { colliders, boost: 0.95 });
  }

  function flashSirens(dt) {
    flash += dt;
    const on = Math.sin(flash * 14) > 0;
    for (const c of chasers) {
      const [red, blue] = c.car.model.siren;
      red.material.color.set(on ? '#ff2020' : '#3a0505');
      blue.material.color.set(on ? '#0a0f3a' : '#2040ff');
    }
  }

  function update(dt, { target, viewYaw, colliders, playerVehicle, onFoot, onRam, vehicles, onShoot }) {
    state.stars = starsFor(state.heat);
    const wanted = state.stars > 0;
    const desired = wanted ? Math.min(8, state.stars * 2) : 0;
    spawnTimer -= dt;
    if (chasers.length < desired && spawnTimer <= 0) {
      spawn(target, viewYaw);
      spawnTimer = 2.5;
    }
    pathTimer -= dt;
    if (wanted && pathTimer <= 0) {
      rebuildPaths(target);
      pathTimer = 0.6;
    }
    state.seen = false;
    let closest = Infinity;
    for (const c of [...chasers]) {
      const d = Math.hypot(target.x - c.car.pos.x, target.z - c.car.pos.z);
      closest = Math.min(closest, d);
      if (!wanted) {
        if (d > 60) remove(c);
        else c.car.update(dt, { throttle: false, brake: true, steer: 0, handbrake: false }, { colliders });
        continue;
      }
      if (d > 320) { remove(c); continue; }
      if (d < SEE_RANGE && lineClear(colliders, c.car.pos.x, c.car.pos.z, target.x, target.z)) state.seen = true;
      c.slowT = Math.abs(c.car.speed) < 2.5 ? (c.slowT || 0) + dt : 0;
      // Close and stopped, or stuck in a back street: get out and finish it on foot.
      if (onFoot && !c.officers.length && ((d < 24 && c.slowT > 0) || (d < 70 && c.slowT > 2))) officers.deploy(c);
      if (c.officers.some((o) => o.hp > 0)) {
        c.car.update(dt, { throttle: false, brake: true, steer: 0, handbrake: true }, { colliders });
      } else {
        aimFor(c, target, colliders);
        drive(c, dt, target, colliders, onFoot);
      }
      if (playerVehicle) {
        const hit = collideCars(playerVehicle, c.car);
        if (hit > 3) onRam(hit);
      }
      for (const other of chasers) if (other !== c) collideCars(c.car, other.car);
    }
    const grabbing = officers.update(dt, {
      target, inVehicle: !onFoot, stars: state.stars, colliders, vehicles,
      lineClear: (ax, az, bx, bz) => lineClear(colliders, ax, az, bx, bz),
      onShoot,
    });
    for (const o of officers.list) {
      if (o.state !== 'down' && Math.hypot(o.pos.x - target.x, o.pos.z - target.z) < SEE_RANGE && lineClear(colliders, o.pos.x, o.pos.z, target.x, target.z)) state.seen = true;
    }
    if (wanted && !state.seen) state.heat = Math.max(STAR_HEAT[0] * 0.5, state.heat - dt * 9);
    if (wanted && !state.seen && state.heat <= STAR_HEAT[0] * 0.5 + 0.01) state.heat = 0;

    const slow = onFoot ? target.speed < 3 : target.speed < 1.5;
    if (wanted && (onFoot ? grabbing > 0 : closest < 7.5 && slow)) state.bust += dt * (onFoot ? 0.8 + grabbing * 0.4 : 1);
    else state.bust = Math.max(0, state.bust - dt * 2);
    flashSirens(dt);
    return { closest: wanted ? closest : Infinity, busted: state.bust > 2.2 };
  }

  function nearCop(x, z, r) {
    if (chasers.some((c) => Math.hypot(c.car.pos.x - x, c.car.pos.z - z) < r)) return true;
    return traffic.cars.some((c) => c.model.type === 'police' && Math.hypot(c.pos.x - x, c.pos.z - z) < r);
  }

  return { state, chasers, officers, addHeat, raiseTo, clear, update, nearCop };
}

export function placeOnRoad(traffic, x, z) {
  const n = traffic.nearestNode(x, z);
  const nb = n.nbrs[0]?.node || n;
  const heading = Math.atan2(nb.x - n.x, nb.z - n.z);
  return { x: n.x, z: n.z, y: heightAt(n.x, n.z), heading };
}
