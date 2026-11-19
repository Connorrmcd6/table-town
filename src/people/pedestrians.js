import * as THREE from 'three';
import { heightAt } from '../world/heightmap.js';
import { makePerson, animatePerson, knockDown, randomLook, poseArms, addPistol, STRIKES } from './person.js';

const RECYCLE = 170, SPAWN_MIN = 30, SPAWN_MAX = 140;
const ARMED = 0.12, BRAVE = 0.4;
const FIGHT_RUN = 5, PUNCH_RANGE = 1.15, SHOOT_RANGE = 18, CALM_AFTER = 18;

function perimeterPoint(r, t) {
  const w = r.x1 - r.x0, h = r.z1 - r.z0, P = 2 * (w + h);
  t = ((t % P) + P) % P;
  if (t < w) return [r.x0 + t, r.z0, 1, 0];
  if (t < w + h) return [r.x1, r.z0 + (t - w), 0, 1];
  if (t < 2 * w + h) return [r.x1 - (t - w - h), r.z1, -1, 0];
  return [r.x0, r.z1 - (t - 2 * w - h), 0, -1];
}

function nearestT(r, x, z) {
  const w = r.x1 - r.x0, h = r.z1 - r.z0;
  const cx = Math.max(r.x0, Math.min(r.x1, x)), cz = Math.max(r.z0, Math.min(r.z1, z));
  const d = [cz - r.z0, r.x1 - cx, r.z1 - cz, cx - r.x0];
  const k = d.indexOf(Math.min(...d));
  return [cx - r.x0, w + (cz - r.z0), w + h + (r.x1 - cx), 2 * w + h + (r.z1 - cz)][k];
}

export function vehicleCircles(v) {
  if (v.circles) return v.circles();
  const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
  const off = v.spec.length / 2 - v.spec.width / 2, r = v.spec.width / 2 + 0.05;
  return [-1, 0, 1].map((k) => ({ x: v.pos.x + fx * off * k, z: v.pos.z + fz * off * k, r }));
}

const vehicleSpeed = (v) => Math.abs(v.speed);

// Sidewalk pedestrians. Hurt one and they either run or come at you (some with a pistol); enough damage and they stay down.
export function createPedestrians(scene, rects, count = 50) {
  const peds = [];
  for (let i = 0; i < count; i++) {
    const model = makePerson(randomLook());
    addPistol(model);
    model.group.visible = false;
    scene.add(model.group);
    peds.push({ model, pos: new THREE.Vector3(), knock: new THREE.Vector2(), heading: 0, rect: null, t: 0, dir: 1, speed: 1.3, state: 'idle', timer: 0, hp: 100 });
  }

  function reset(p) {
    p.hp = 100;
    p.armed = Math.random() < ARMED;
    p.brave = p.armed || Math.random() < BRAVE;
    p.flinch = 0;
    p.strike = null;
    p.attackT = 0;
    p.braveFor = false;
    p.model.gun.visible = false;
    knockDown(p.model, 0);
  }

  function spawn(p, cx, cz) {
    for (let tries = 0; tries < 12; tries++) {
      const r = rects[Math.floor(Math.random() * rects.length)];
      const d = Math.hypot((r.x0 + r.x1) / 2 - cx, (r.z0 + r.z1) / 2 - cz);
      if (d < SPAWN_MIN || d > SPAWN_MAX) continue;
      p.rect = r;
      p.t = Math.random() * 2 * (r.x1 - r.x0 + r.z1 - r.z0);
      p.dir = Math.random() < 0.5 ? 1 : -1;
      p.speed = 1.1 + Math.random() * 0.6;
      p.state = 'walk';
      reset(p);
      p.model.group.visible = true;
      return;
    }
  }

  function seedNear(cx, cz) {
    const near = rects.filter((r) => Math.hypot((r.x0 + r.x1) / 2 - cx, (r.z0 + r.z1) / 2 - cz) < SPAWN_MAX);
    if (!near.length) return;
    for (const p of peds) {
      const r = near[Math.floor(Math.random() * near.length)];
      p.rect = r;
      p.t = Math.random() * 2 * (r.x1 - r.x0 + r.z1 - r.z0);
      p.dir = Math.random() < 0.5 ? 1 : -1;
      p.state = 'walk';
      reset(p);
      p.model.group.visible = true;
      const [x, z] = perimeterPoint(r, p.t);
      p.pos.set(x, 0, z);
    }
  }

  function rejoinSidewalk(p, state, timer) {
    p.t = nearestT(p.rect, p.pos.x, p.pos.z);
    p.state = state;
    p.timer = timer;
    p.model.gun.visible = false;
  }

  // React to being hurt by the player: run, or turn and fight.
  function provoke(p) {
    if (p.state === 'dead' || p.state === 'down') return;
    if (p.brave) {
      p.state = 'fight';
      p.timer = CALM_AFTER;
      p.model.gun.visible = p.armed;
    } else rejoinSidewalk(p, 'flee', 6);
  }

  // A punch or bullet from the player; returns true if it killed them.
  function hurt(p, amount, dir, { knock = false } = {}) {
    if (p.state === 'dead') return false;
    p.hp -= amount;
    if (p.hp <= 0) {
      p.state = 'dead';
      p.timer = 0;
      p.knock.set(dir.x * 3, dir.y * 3);
      p.model.gun.visible = false;
      return true;
    }
    if (knock) {
      p.state = 'down';
      p.timer = 1.4;
      p.knock.set(dir.x * 2.5, dir.y * 2.5);
      p.provoked = true;
      return false;
    }
    p.flinch = 1;
    p.flinchSide = Math.random() < 0.5 ? -1 : 1;
    p.knock.set(dir.x * 1.2, dir.y * 1.2);
    provoke(p);
    return false;
  }

  // Run over by a car: damage scales with speed.
  function runOver(p, v, s) {
    const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
    p.hp -= s * 7;
    p.knock.set(fx * s * 0.6, fz * s * 0.6);
    if (p.hp <= 0) {
      p.state = 'dead';
      p.model.gun.visible = false;
    } else {
      p.state = 'down';
      p.timer = 4 + Math.random() * 2;
      p.provoked = true;
    }
  }

  function updateFight(p, dt, threat, colliders) {
    const dx = threat.pos.x - p.pos.x, dz = threat.pos.z - p.pos.z, dist = Math.hypot(dx, dz);
    p.timer -= dt;
    if (!threat.onFoot || dist > 45 || p.timer <= 0) {
      rejoinSidewalk(p, 'flee', 3);
      return;
    }
    p.heading = Math.atan2(dx, dz);
    p.attackT -= dt;
    let speed = 0;
    if (p.armed) {
      if (dist > SHOOT_RANGE) speed = FIGHT_RUN;
      else if (dist < 5) speed = -3;
      if (dist <= SHOOT_RANGE && p.attackT <= 0) {
        p.attackT = 1 + Math.random() * 0.8;
        threat.onAttack(p, 'shot');
      }
    } else if (dist > PUNCH_RANGE) speed = FIGHT_RUN;
    else if (p.attackT <= 0 && !p.strike) {
      p.attackT = 0.9 + Math.random() * 0.6;
      p.strike = { kind: STRIKES[Math.floor(Math.random() * 3)], k: 0, landed: false };
    }
    if (speed) {
      p.pos.x += (dx / dist) * speed * dt;
      p.pos.z += (dz / dist) * speed * dt;
      colliders.resolveCircle(p.pos, 0.35, p.pos.y);
    }
    animatePerson(p.model, dt, Math.abs(speed));
    if (p.strike) {
      p.strike.k += dt / 0.4;
      if (!p.strike.landed && p.strike.k > 0.5) {
        p.strike.landed = true;
        if (dist < PUNCH_RANGE + 0.3) threat.onAttack(p, 'punch');
      }
      poseArms(p.model, { mode: p.strike.kind, k: p.strike.k });
      if (p.strike.k >= 1) p.strike = null;
    } else if (p.armed) poseArms(p.model, { mode: 'aim', pitch: 0.05 });
    else poseArms(p.model, { mode: 'guard' });
  }

  function update(dt, center, vehicles, player, onHit, threat, colliders) {
    for (const p of peds) {
      if (p.state === 'idle' || Math.hypot(p.pos.x - center.x, p.pos.z - center.z) > RECYCLE) {
        p.model.group.visible = false;
        spawn(p, center.x, center.z);
        if (p.state === 'idle') continue;
        const [x, z] = perimeterPoint(p.rect, p.t);
        p.pos.set(x, 0, z);
      }

      if (p.state === 'dead' || p.state === 'down') {
        p.timer -= dt;
        p.pos.x += p.knock.x * dt;
        p.pos.z += p.knock.y * dt;
        p.knock.multiplyScalar(Math.exp(-4 * dt));
        knockDown(p.model, p.state === 'dead' ? 1 : Math.min(1, p.timer * 2));
        if (p.state === 'down' && p.timer <= 0) {
          if (p.provoked && p.brave && threat.onFoot) {
            p.provoked = false;
            p.state = 'fight';
            p.timer = CALM_AFTER;
            p.model.gun.visible = p.armed;
          } else rejoinSidewalk(p, 'flee', 3);
        }
      } else if (p.state === 'fight') {
        p.pos.x += p.knock.x * dt;
        p.pos.z += p.knock.y * dt;
        p.knock.multiplyScalar(Math.exp(-6 * dt));
        updateFight(p, dt, threat, colliders);
      } else {
        if (p.state === 'flee') {
          p.timer -= dt;
          if (p.timer <= 0) p.state = 'walk';
        }
        const speed = p.state === 'flee' ? 4.5 : p.speed;
        p.t += p.dir * speed * dt;
        const [x, z, tx, tz] = perimeterPoint(p.rect, p.t);
        p.pos.x += (x - p.pos.x) * Math.min(1, dt * 6) + p.knock.x * dt;
        p.pos.z += (z - p.pos.z) * Math.min(1, dt * 6) + p.knock.y * dt;
        p.knock.multiplyScalar(Math.exp(-6 * dt));
        p.heading = Math.atan2(tx * p.dir, tz * p.dir);
        animatePerson(p.model, dt, speed);
      }
      if (p.flinch > 0 && p.state !== 'dead' && p.state !== 'down') {
        p.flinch = Math.max(0, p.flinch - dt / 0.35);
        if (!p.strike) poseArms(p.model, { mode: 'flinch', k: 1 - p.flinch, side: p.flinchSide });
      }

      for (const v of vehicles) {
        const s = vehicleSpeed(v);
        const dx = p.pos.x - v.pos.x, dz = p.pos.z - v.pos.z;
        if (Math.abs(dx) > 10 || Math.abs(dz) > 10) continue;
        if (p.state === 'walk' && s > 6 && v === player && !p.braveFor) {
          const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
          if (dx * fx + dz * fz > 0 && Math.abs(dx * fz - dz * fx) < 4) {
            p.braveFor = Math.random() > 0.6;
            if (p.braveFor) continue;
            p.state = 'flee';
            p.timer = 2;
            p.dir = -p.dir;
          }
        }
        if (p.state === 'down' || p.state === 'dead' || s < 2.5) continue;
        for (const c of vehicleCircles(v)) {
          if (Math.hypot(p.pos.x - c.x, p.pos.z - c.z) < c.r + 0.35) {
            runOver(p, v, s);
            onHit(p, v, s);
            break;
          }
        }
      }

      const onPlatform = p.rect.sidewalk ? 0.3 : 0;
      p.pos.y = heightAt(p.pos.x, p.pos.z) + onPlatform;
      p.model.group.position.copy(p.pos);
      p.model.group.rotation.y = p.heading;
      p.model.group.visible = Math.abs(p.pos.x - center.x) < 90 && Math.abs(p.pos.z - center.z) < 90;
    }
  }

  // Bystanders for jacked drivers: an extra person that runs off and is then recycled.
  function eject(x, z, heading) {
    const p = peds.find((q) => q.state !== 'down' && q.state !== 'dead') || peds[0];
    const r = rects.reduce((best, q) => {
      const d = Math.hypot((q.x0 + q.x1) / 2 - x, (q.z0 + q.z1) / 2 - z);
      return d < best.d ? { q, d } : best;
    }, { q: rects[0], d: Infinity }).q;
    p.rect = r;
    reset(p);
    p.pos.set(x, heightAt(x, z), z);
    p.heading = heading;
    p.t = nearestT(r, x, z);
    p.state = 'flee';
    p.timer = 4;
    p.model.group.visible = true;
    return p;
  }

  // Everyone walking within r of (x, z) runs for it; the brave ones who saw it come looking for a fight.
  function scare(x, z, r) {
    for (const p of peds) {
      if (p.state !== 'walk' || Math.hypot(p.pos.x - x, p.pos.z - z) > r) continue;
      if (p.armed && Math.random() < 0.5) provoke(p);
      else rejoinSidewalk(p, 'flee', 4 + Math.random() * 2);
      if (p.state === 'flee' && Math.random() < 0.5) p.dir = -p.dir;
    }
  }

  return { peds, update, eject, seedNear, hurt, scare };
}
