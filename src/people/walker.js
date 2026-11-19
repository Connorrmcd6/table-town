import * as THREE from 'three';
import { heightAt } from '../world/heightmap.js';
import { makePerson, animatePerson, knockDown, poseAirborne, poseRoll, poseClimb, poseArms } from './person.js';
import { vehicleCircles } from './pedestrians.js';

const SPRINT = 8.5, AIM_WALK = 3.2;
const JUMP_SPEED = 6, GRAVITY = 18;
const CLIMB_MIN = 0.7, CLIMB_MAX = 7.5;
export const PLAYER_LOOK = {
  skin: '#7a5038', top: '#8a1c2b', bottom: '#1b1b1b', shoes: '#f4f4f0', hair: '#120c08', hat: '#d9c38a',
  hairStyle: 'bucket', longSleeves: false, shorts: false, scale: 1,
};

const roofCache = new WeakMap();
const box = new THREE.Box3();
// Roof height of a vehicle above its own origin, measured once from the model.
export function roofHeight(v) {
  if (!roofCache.has(v.model)) {
    const g = v.model.group;
    box.setFromObject(g);
    roofCache.set(v.model, box.max.y - g.position.y);
  }
  return roofCache.get(v.model);
}

// Where (x, z) lands on top of vehicle v, or null if it's off the roof's footprint.
function onVehicleTop(v, x, z) {
  if (v.spec.bike) return null;
  const dx = x - v.pos.x, dz = z - v.pos.z;
  const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
  const along = dx * fx + dz * fz, across = dx * fz - dz * fx;
  if (Math.abs(along) > v.spec.length / 2 - 0.15 || Math.abs(across) > v.spec.width / 2 - 0.1) return null;
  return v.pos.y + roofHeight(v) - 0.05;
}

// The player on foot: moves relative to the camera, turns to face where it walks.
export class Walker {
  constructor(scene) {
    this.model = makePerson(PLAYER_LOOK, { shadow: true });
    this.model.type = 'person';
    this.spec = { length: 0.6, width: 0.6, radius: 0.35 };
    this.cameraProfile = { dist: 5.5, height: 2.4, look: 1.4, free: true };
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector2();
    this.heading = 0;
    this.down = 0;
    this.roll = null;
    this.climb = null;
    this.vy = 0;
    this.airborne = false;
    this.fallFrom = 0;
    this.riding = null;
    this.arms = null;
    this.onLand = null;
    this.active = false;
    this.model.group.visible = false;
    scene.add(this.model.group);
  }

  get speed() {
    return this.vel.length();
  }

  place(x, z, heading) {
    this.pos.set(x, heightAt(x, z), z);
    this.heading = heading;
    this.vel.set(0, 0);
    this.down = 0;
    this.roll = null;
    this.climb = null;
    this.riding = null;
    this.vy = 0;
    this.airborne = false;
    this.sync(0);
  }

  setActive(on) {
    this.active = on;
    this.model.group.visible = on;
  }

  get busy() {
    return this.down > 0 || this.roll !== null || this.climb !== null;
  }

  hit(dir, strength) {
    this.roll = null;
    this.climb = null;
    this.down = 1.6;
    this.vel.copy(dir).multiplyScalar(Math.min(strength, 9));
  }

  bail(dir, speed) {
    const spins = speed > 20 ? 2 : 1;
    this.heading = Math.atan2(dir.x, dir.y);
    this.vel.copy(dir).multiplyScalar(Math.min(speed * 0.6, 12));
    this.roll = { t: 0, dur: 0.5 + 0.4 * spins, spins, recover: 0.35 };
    this.airborne = false;
    this.vy = 0;
  }

  // Highest thing under the feet: terrain, a roof, or a vehicle we're standing on.
  support(colliders, vehicles) {
    const x = this.pos.x, z = this.pos.z;
    let y = Math.max(heightAt(x, z), colliders.surfaceAt(x, z, this.pos.y));
    let car = null;
    for (const v of vehicles) {
      if (Math.abs(v.pos.x - x) > 4 || Math.abs(v.pos.z - z) > 4) continue;
      const top = onVehicleTop(v, x, z);
      if (top !== null && top <= this.pos.y + 0.45 && top > y) {
        y = top;
        car = v;
      }
    }
    return { y, car };
  }

  tryClimb(colliders, vehicles) {
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    let target = colliders.climbTarget(this.pos.x, this.pos.z, fx, fz, this.pos.y, CLIMB_MIN, CLIMB_MAX);
    if (!target) {
      for (const v of vehicles) {
        for (const d of [0.7, 1.1]) {
          const x = this.pos.x + fx * d, z = this.pos.z + fz * d;
          const top = onVehicleTop(v, x, z);
          if (top === null || top - this.pos.y < CLIMB_MIN) continue;
          const vx = Math.sin(v.heading), vz = Math.cos(v.heading);
          const along = (x - v.pos.x) * vx + (z - v.pos.z) * vz;
          target = { x: v.pos.x + vx * along, z: v.pos.z + vz * along, y: top, rise: top - this.pos.y, car: v };
          break;
        }
        if (target) break;
      }
    }
    if (!target) return false;
    this.climb = { t: 0, dur: 0.45 + target.rise * 0.16, from: this.pos.clone(), to: target, car: target.car || null };
    this.vel.set(0, 0);
    this.vy = 0;
    this.airborne = false;
    return true;
  }

  update(dt, input, viewYaw, { colliders, vehicles, jump = false, aiming = false }) {
    const others = vehicles.filter((v) => v !== this.riding);
    if (this.riding) {
      const v = this.riding;
      const yaw = v.heading - this.ride.heading;
      const c = Math.cos(yaw), s = Math.sin(yaw);
      const rx = this.ride.x * c + this.ride.z * s, rz = -this.ride.x * s + this.ride.z * c;
      this.pos.x = v.pos.x + rx;
      this.pos.z = v.pos.z + rz;
      this.heading += yaw;
    }

    if (this.climb) {
      this.updateClimb(dt);
      this.sync(dt);
      return;
    }
    if (jump && !this.airborne && !this.busy) {
      if (!this.tryClimb(colliders, vehicles)) {
        this.vy = JUMP_SPEED;
        this.airborne = true;
        this.fallFrom = this.pos.y;
      }
    }
    if (this.roll) {
      const r = this.roll;
      r.t += dt;
      this.vel.multiplyScalar(Math.exp((r.t < r.dur ? -1.6 : -8) * dt));
      if (r.t >= r.dur + r.recover) this.roll = null;
    } else if (this.down > 0) {
      this.down -= dt;
      this.vel.multiplyScalar(Math.exp(-3 * dt));
    } else {
      const fwd = (input.throttle ? 1 : 0) - (input.brake ? 1 : 0);
      const side = input.steer;
      const fx = Math.sin(viewYaw), fz = Math.cos(viewYaw);
      let mx = fx * fwd + fz * side, mz = fz * fwd - fx * side;
      const len = Math.hypot(mx, mz);
      const target = len > 0 ? (aiming ? AIM_WALK : SPRINT) : 0;
      if (len > 0) {
        mx /= len; mz /= len;
      }
      const face = aiming ? viewYaw : len > 0 ? Math.atan2(mx, mz) : this.heading;
      let d = face - this.heading;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.heading += d * Math.min(1, dt * (aiming ? 20 : 12));
      this.vel.lerp(new THREE.Vector2(mx * target, mz * target), Math.min(1, dt * 8));
    }
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.y * dt;
    colliders.resolveCircle(this.pos, this.spec.radius, this.pos.y);
    for (const v of others) {
      const dx = this.pos.x - v.pos.x, dz = this.pos.z - v.pos.z;
      if (Math.abs(dx) > 5 || Math.abs(dz) > 5) continue;
      if (!v.spec.bike && this.pos.y >= v.pos.y + roofHeight(v) - 0.5) continue;
      for (const c of vehicleCircles(v)) {
        const ex = this.pos.x - c.x, ez = this.pos.z - c.z;
        const d = Math.hypot(ex, ez), min = c.r + this.spec.radius;
        if (d < min && d > 1e-4) {
          this.pos.x += (ex / d) * (min - d);
          this.pos.z += (ez / d) * (min - d);
        }
      }
    }

    const ground = this.support(colliders, vehicles);
    if (!this.airborne && this.pos.y > ground.y + 0.3) {
      this.airborne = true;
      this.vy = 0;
      this.fallFrom = this.pos.y;
    }
    if (this.airborne) {
      this.vy -= GRAVITY * dt;
      this.pos.y += this.vy * dt;
      if (this.pos.y <= ground.y && this.vy <= 0) {
        this.pos.y = ground.y;
        this.vy = 0;
        this.airborne = false;
        const drop = this.fallFrom - ground.y;
        if (drop > 4 && this.onLand) this.onLand(drop);
        if (drop > 6) this.down = Math.min(2, 0.6 + drop * 0.08);
      }
    } else this.pos.y = ground.y;
    this.setRiding(this.airborne ? null : ground.car);
    this.sync(dt);
  }

  setRiding(car) {
    this.riding = car;
    if (car) this.ride = { x: this.pos.x - car.pos.x, z: this.pos.z - car.pos.z, heading: car.heading };
  }

  updateClimb(dt) {
    const c = this.climb;
    c.t += dt;
    const k = Math.min(1, c.t / c.dur);
    const up = Math.min(1, k / 0.7), over = Math.max(0, (k - 0.7) / 0.3);
    const ease = (x) => x * x * (3 - 2 * x);
    const to = c.car ? { x: c.to.x, z: c.to.z, y: onVehicleTop(c.car, c.to.x, c.to.z) ?? c.to.y } : c.to;
    const edgeX = c.from.x + (to.x - c.from.x) * 0.35, edgeZ = c.from.z + (to.z - c.from.z) * 0.35;
    this.pos.y = c.from.y + (to.y - c.from.y) * ease(up);
    this.pos.x = c.from.x + (edgeX - c.from.x) * ease(up) + (to.x - edgeX) * ease(over);
    this.pos.z = c.from.z + (edgeZ - c.from.z) * ease(up) + (to.z - edgeZ) * ease(over);
    if (k >= 1) {
      this.climb = null;
      this.pos.y = to.y;
      this.setRiding(c.car);
    }
  }

  sync(dt) {
    const g = this.model.group;
    g.position.copy(this.pos);
    g.rotation.y = this.heading;
    if (this.climb) poseClimb(this.model, Math.min(1, this.climb.t / this.climb.dur));
    else if (this.roll) poseRoll(this.model, this.roll.t, this.roll.dur, this.roll.spins, this.roll.recover);
    else if (this.down > 0) knockDown(this.model, Math.min(1, this.down * 2));
    else {
      knockDown(this.model, 0);
      if (this.airborne) poseAirborne(this.model, dt, this.vy);
      else animatePerson(this.model, dt, this.speed);
      if (this.arms) poseArms(this.model, this.arms);
    }
  }
}
