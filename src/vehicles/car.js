import * as THREE from 'three';
import { heightAt } from '../world/heightmap.js';

const G = 9.8;

export class Car {
  constructor(model, x, z, heading) {
    this.model = model;
    this.spec = model.spec;
    this.pos = new THREE.Vector3(x, heightAt(x, z), z);
    this.heading = heading;
    this.vel = new THREE.Vector2();
    this.steer = 0;
    this.pitch = 0;
    this.roll = 0;
    this.lastImpact = 0;
    this.sync();
  }

  get forward() {
    return new THREE.Vector2(Math.sin(this.heading), Math.cos(this.heading));
  }

  get speed() {
    return this.vel.dot(this.forward);
  }

  circles() {
    const f = this.forward;
    const off = this.spec.length / 2 - this.spec.width / 2;
    const r = this.spec.width / 2 + 0.05;
    return [
      { x: this.pos.x + f.x * off, z: this.pos.z + f.y * off, r },
      { x: this.pos.x, z: this.pos.z, r },
      { x: this.pos.x - f.x * off, z: this.pos.z - f.y * off, r },
    ];
  }

  update(dt, input, env) {
    const { spec } = this;
    const boost = env.boost || 1;
    const f = this.forward;
    const r = new THREE.Vector2(-f.y, f.x);
    let vF = this.vel.dot(f);
    let vR = this.vel.dot(r);
    const maxSpeed = spec.maxSpeed * boost;

    if (input.throttle) {
      if (vF < -0.5) vF += 18 * dt;
      else vF += spec.accel * boost * Math.max(0, 1 - vF / maxSpeed) * dt;
    }
    if (input.brake) {
      if (vF > 0.5) vF -= 20 * dt;
      else vF -= spec.accel * 0.6 * Math.max(0, 1 + vF / 9) * dt;
    }
    if (!input.throttle && !input.brake) vF -= Math.sign(vF) * Math.min(Math.abs(vF), 1.6 * dt);
    vF -= vF * Math.abs(vF) * 0.0012 * dt * 10;

    const ahead = heightAt(this.pos.x + f.x * 1.5, this.pos.z + f.y * 1.5);
    const behind = heightAt(this.pos.x - f.x * 1.5, this.pos.z - f.y * 1.5);
    const slope = (ahead - behind) / 3;
    vF -= G * Math.sin(Math.atan(slope)) * dt * 0.85;

    if (input.handbrake) vF -= Math.sign(vF) * Math.min(Math.abs(vF), 6 * dt);
    const grip = input.handbrake ? 1.2 : 7;
    vR *= Math.exp(-grip * dt);

    const targetSteer = input.steer * 0.6 / (1 + Math.abs(vF) / 14);
    this.steer += (targetSteer - this.steer) * Math.min(1, dt * 8);
    let yaw = (vF / spec.wheelbase) * Math.tan(this.steer);
    if (input.handbrake) yaw *= 1.5;

    this.vel.set(f.x * vF + r.x * vR, f.y * vF + r.y * vR);
    if (env.wind) this.vel.addScaledVector(env.wind, dt);
    this.heading += yaw * dt;

    const prev = this.pos.clone();
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.y * dt;

    if (heightAt(this.pos.x, this.pos.z) < -0.3) {
      this.pos.copy(prev);
      this.impact(new THREE.Vector2(-this.vel.x, -this.vel.y).normalize(), env);
    }
    this.collide(env);
    this.pos.y = heightAt(this.pos.x, this.pos.z);
    this.sync(dt);
  }

  collide(env) {
    const cs = this.circles();
    let dx = 0, dz = 0, n = null;
    for (const c of cs) {
      const p = { x: c.x, z: c.z };
      const hit = env.colliders.resolveCircle(p, c.r);
      if (hit) {
        dx += p.x - c.x;
        dz += p.z - c.z;
        n = n ? { x: n.x + hit.x, z: n.z + hit.z } : hit;
      }
    }
    if (!n) return;
    this.pos.x += dx;
    this.pos.z += dz;
    const nv = new THREE.Vector2(n.x, n.z).normalize();
    this.impact(nv, env);
  }

  impact(n, env) {
    const vn = this.vel.dot(n);
    if (vn < 0) {
      this.vel.addScaledVector(n, -vn * 1.35);
      this.vel.multiplyScalar(0.85);
      if (-vn > 3 && env.onImpact) env.onImpact(-vn);
    }
  }

  sync(dt = 1) {
    const { spec } = this;
    const f = this.forward;
    const r = new THREE.Vector2(-f.y, f.x);
    const hl = spec.length / 2, hw = spec.width / 2;
    const hF = heightAt(this.pos.x + f.x * hl, this.pos.z + f.y * hl);
    const hB = heightAt(this.pos.x - f.x * hl, this.pos.z - f.y * hl);
    const hR = heightAt(this.pos.x + r.x * hw, this.pos.z + r.y * hw);
    const hL = heightAt(this.pos.x - r.x * hw, this.pos.z - r.y * hw);
    const k = Math.min(1, dt * 10);
    this.pitch += (Math.atan2(hF - hB, spec.length) - this.pitch) * k;
    this.roll += (Math.atan2(hR - hL, spec.width) - this.roll) * k;
    const g = this.model.group;
    g.position.copy(this.pos);
    g.position.y = (hF + hB + hL + hR) / 4 + 0.02;
    g.rotation.set(-this.pitch, this.heading, -this.roll, 'YXZ');
    const spin = (this.speed * dt) / spec.radius;
    for (const w of this.model.wheels.all) w.rotation.x += spin;
    for (const p of this.model.wheels.front) p.rotation.y = this.steer;
  }
}
