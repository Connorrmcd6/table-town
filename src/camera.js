import * as THREE from 'three';
import { heightAt } from './world/heightmap.js';

const MODES = [
  { dist: 11, height: 4.2, look: 1.8 },
  { dist: 18, height: 7, look: 2 },
  { dist: 0.2, height: 2.0, look: 1.9, inside: true },
];

export class ChaseCamera {
  constructor(camera) {
    this.camera = camera;
    this.mode = 0;
    this.yaw = null;
    this.pos = new THREE.Vector3();
  }

  cycle() {
    this.mode = (this.mode + 1) % MODES.length;
  }

  update(dt, car, snap = false) {
    const m = MODES[this.mode];
    const vel = car.vel.length();
    const targetYaw = car.heading;
    if (this.yaw === null || snap) this.yaw = targetYaw;
    let d = targetYaw - this.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.yaw += d * Math.min(1, dt * (m.inside ? 20 : 3.5));
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const dist = m.dist + Math.min(vel * 0.08, 4) * (m.inside ? 0 : 1);
    const target = new THREE.Vector3(car.pos.x - fx * dist, 0, car.pos.z - fz * dist);
    target.y = Math.max(car.model.group.position.y + m.height, heightAt(target.x, target.z) + 1.5);
    if (m.inside) {
      target.set(car.pos.x + fx * 1.6, car.model.group.position.y + m.height, car.pos.z + fz * 1.6);
      this.pos.copy(target);
    } else if (snap) this.pos.copy(target);
    else this.pos.lerp(target, Math.min(1, dt * 6));
    this.camera.position.copy(this.pos);
    const lookAhead = m.inside ? 30 : 4;
    this.camera.lookAt(
      car.pos.x + fx * lookAhead,
      car.model.group.position.y + m.look,
      car.pos.z + fz * lookAhead
    );
    const fovTarget = 62 + Math.min(vel * 0.35, 14);
    this.camera.fov += (fovTarget - this.camera.fov) * Math.min(1, dt * 2);
    this.camera.updateProjectionMatrix();
  }
}
