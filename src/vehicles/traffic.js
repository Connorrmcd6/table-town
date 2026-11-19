import * as THREE from 'three';
import { heightAt } from '../world/heightmap.js';
import { GRID_X, GRID_Z } from '../world/city.js';
import { makeVehicle } from './models.js';

const LANE = 2.8;
const STOP_BACK = 9;

let seed = 777;
function rand() {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
}

const node = (i, j) => ({ i, j, x: GRID_X[i], z: GRID_Z[j] });

function neighbours(n) {
  const out = [];
  if (n.i > 0) out.push(node(n.i - 1, n.j));
  if (n.i < GRID_X.length - 1) out.push(node(n.i + 1, n.j));
  if (n.j > 0) out.push(node(n.i, n.j - 1));
  if (n.j < GRID_Z.length - 1) out.push(node(n.i, n.j + 1));
  return out;
}

// Keep-left: lane offset is to the left of travel direction.
function lanePoint(from, to, t, back = 0) {
  let dx = to.x - from.x, dz = to.z - from.z;
  const len = Math.hypot(dx, dz);
  dx /= len; dz /= len;
  const d = t * len - back;
  return { x: from.x + dx * d + dz * LANE, z: from.z + dz * d - dx * LANE };
}

class AICar {
  constructor(model, from, to) {
    this.model = model;
    this.spec = model.spec;
    this.from = from;
    this.to = to;
    this.prev = null;
    this.waypoints = [];
    this.pos = new THREE.Vector3();
    this.knock = new THREE.Vector2();
    this.speed = 0;
    this.cruise = 9 + rand() * 6;
    this.frozen = false;
    const start = lanePoint(from, to, 0.2 + rand() * 0.5);
    this.pos.set(start.x, heightAt(start.x, start.z), start.z);
    this.heading = Math.atan2(to.x - from.x, to.z - from.z);
    this.planNext();
  }

  planNext() {
    const options = neighbours(this.to).filter((n) => !(n.i === this.from.i && n.j === this.from.j));
    const next = options.length ? options[Math.floor(rand() * options.length)] : this.from;
    const arrive = lanePoint(this.from, this.to, 1, STOP_BACK);
    const leave = lanePoint(this.to, next, 0, -STOP_BACK);
    const mid = {
      x: (arrive.x + leave.x) / 2 + (this.to.x - (arrive.x + leave.x) / 2) * 0.35,
      z: (arrive.z + leave.z) / 2 + (this.to.z - (arrive.z + leave.z) / 2) * 0.35,
    };
    this.waypoints.push(arrive, mid, leave);
    this.prev = this.from;
    this.from = this.to;
    this.to = next;
  }

  update(dt, others, player) {
    if (this.frozen) return;
    const target = this.waypoints[0];
    let dx = target.x - this.pos.x, dz = target.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 2.5) {
      this.waypoints.shift();
      if (this.waypoints.length < 2) this.planNext();
      return this.update(dt, others, player);
    }
    const want = Math.atan2(dx, dz);
    let diff = want - this.heading;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.heading += Math.max(-1.6 * dt, Math.min(1.6 * dt, diff * 3 * dt));

    let limit = this.cruise * (Math.abs(diff) > 0.4 ? 0.45 : 1);
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const blockers = [...others, player];
    for (const o of blockers) {
      if (o === this) continue;
      const ox = o.pos.x - this.pos.x, oz = o.pos.z - this.pos.z;
      const along = ox * fx + oz * fz;
      const side = Math.abs(ox * fz - oz * fx);
      if (along > 0 && along < 14 && side < 2.4) limit = Math.min(limit, Math.max(0, (along - 6) * 1.2));
    }
    this.speed += Math.max(-12 * dt, Math.min(4 * dt, limit - this.speed));
    this.pos.x += fx * this.speed * dt + this.knock.x * dt;
    this.pos.z += fz * this.speed * dt + this.knock.y * dt;
    this.knock.multiplyScalar(Math.exp(-3 * dt));
    this.pos.y = heightAt(this.pos.x, this.pos.z);
    this.sync(dt);
  }

  sync(dt) {
    const g = this.model.group;
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const hl = this.spec.length / 2;
    const hF = heightAt(this.pos.x + fx * hl, this.pos.z + fz * hl);
    const hB = heightAt(this.pos.x - fx * hl, this.pos.z - fz * hl);
    g.position.set(this.pos.x, (hF + hB) / 2 + 0.02, this.pos.z);
    g.rotation.set(-Math.atan2(hF - hB, this.spec.length), this.heading, 0, 'YXZ');
    const spin = (this.speed * dt) / this.spec.radius;
    for (const w of this.model.wheels.all) w.rotation.x += spin;
  }
}

export function createTraffic(scene, count = 34) {
  const cars = [];
  const types = ['golf', 'golf', 'golf', 'taxi', 'taxi', 'bakkie', 'bakkie', 'police'];
  for (let k = 0; k < count; k++) {
    const i = Math.floor(rand() * GRID_X.length);
    const j = Math.floor(rand() * GRID_Z.length);
    const from = node(i, j);
    const opts = neighbours(from);
    const to = opts[Math.floor(rand() * opts.length)];
    const model = makeVehicle(types[k % types.length], rand);
    scene.add(model.group);
    cars.push(new AICar(model, from, to));
  }

  function collidePlayer(player, onImpact) {
    for (const c of cars) {
      const dx = player.pos.x - c.pos.x, dz = player.pos.z - c.pos.z;
      const minD = (player.spec.length + c.spec.length) / 2 - 0.8;
      const d = Math.hypot(dx, dz);
      if (d > minD + 3) continue;
      for (const pc of player.circles()) {
        const ex = pc.x - c.pos.x, ez = pc.z - c.pos.z;
        const fx = Math.sin(c.heading), fz = Math.cos(c.heading);
        const along = Math.max(-c.spec.length / 2 + c.spec.width / 2, Math.min(c.spec.length / 2 - c.spec.width / 2, ex * fx + ez * fz));
        const qx = c.pos.x + fx * along, qz = c.pos.z + fz * along;
        const nx = pc.x - qx, nz = pc.z - qz;
        const nd = Math.hypot(nx, nz);
        const rr = pc.r + c.spec.width / 2;
        if (nd >= rr || nd < 1e-4) continue;
        const n = new THREE.Vector2(nx / nd, nz / nd);
        const push = rr - nd;
        player.pos.x += n.x * push * 0.6;
        player.pos.z += n.y * push * 0.6;
        c.pos.x -= n.x * push * 0.4;
        c.pos.z -= n.y * push * 0.4;
        const vn = player.vel.dot(n);
        if (vn < 0) {
          c.knock.addScaledVector(n, vn * 0.8 * player.spec.mass / c.spec.mass);
          player.vel.addScaledVector(n, -vn * 1.1);
          player.vel.multiplyScalar(0.9);
          c.speed *= 0.3;
          if (-vn > 3) onImpact(-vn);
        }
        break;
      }
    }
  }

  return {
    cars,
    setFrozen(v) {
      for (const c of cars) c.frozen = v;
    },
    update(dt, player, onImpact) {
      for (const c of cars) c.update(dt, cars, player);
      collidePlayer(player, onImpact);
    },
  };
}
