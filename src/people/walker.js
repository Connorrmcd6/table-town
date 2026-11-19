import * as THREE from 'three';
import { heightAt } from '../world/heightmap.js';
import { makePerson, animatePerson, knockDown, poseAirborne, poseRoll } from './person.js';
import { vehicleCircles } from './pedestrians.js';

const SPRINT = 8.5;
const JUMP_SPEED = 6, GRAVITY = 18;
export const PLAYER_LOOK = {
  skin: '#7a5038', top: '#8a1c2b', bottom: '#1b1b1b', shoes: '#f4f4f0', hair: '#120c08', hat: '#d9c38a',
  hairStyle: 'bucket', longSleeves: false, shorts: false, scale: 1,
};

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
    this.vy = 0;
    this.airborne = false;
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
    this.vy = 0;
    this.airborne = false;
    this.sync(0);
  }

  setActive(on) {
    this.active = on;
    this.model.group.visible = on;
  }

  get busy() {
    return this.down > 0 || this.roll !== null;
  }

  hit(dir, strength) {
    this.roll = null;
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

  update(dt, input, viewYaw, { colliders, vehicles, jump = false }) {
    if (jump && !this.airborne && !this.busy) {
      this.vy = JUMP_SPEED;
      this.airborne = true;
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
      const target = len > 0 ? SPRINT : 0;
      if (len > 0) {
        mx /= len; mz /= len;
        let d = Math.atan2(mx, mz) - this.heading;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        this.heading += d * Math.min(1, dt * 12);
      }
      this.vel.lerp(new THREE.Vector2(mx * target, mz * target), Math.min(1, dt * 8));
    }
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.y * dt;
    colliders.resolveCircle(this.pos, this.spec.radius);
    for (const v of vehicles) {
      const dx = this.pos.x - v.pos.x, dz = this.pos.z - v.pos.z;
      if (Math.abs(dx) > 5 || Math.abs(dz) > 5) continue;
      for (const c of vehicleCircles(v)) {
        const ex = this.pos.x - c.x, ez = this.pos.z - c.z;
        const d = Math.hypot(ex, ez), min = c.r + this.spec.radius;
        if (d < min && d > 1e-4) {
          this.pos.x += (ex / d) * (min - d);
          this.pos.z += (ez / d) * (min - d);
        }
      }
    }
    const ground = heightAt(this.pos.x, this.pos.z);
    if (this.airborne) {
      this.vy -= GRAVITY * dt;
      this.pos.y += this.vy * dt;
      if (this.pos.y <= ground) {
        this.pos.y = ground;
        this.vy = 0;
        this.airborne = false;
      }
    } else this.pos.y = ground;
    this.sync(dt);
  }

  sync(dt) {
    const g = this.model.group;
    g.position.copy(this.pos);
    g.rotation.y = this.heading;
    if (this.roll) poseRoll(this.model, this.roll.t, this.roll.dur, this.roll.spins, this.roll.recover);
    else if (this.down > 0) knockDown(this.model, Math.min(1, this.down * 2));
    else {
      knockDown(this.model, 0);
      if (this.airborne) poseAirborne(this.model, dt, this.vy);
      else animatePerson(this.model, dt, this.speed);
    }
  }
}
