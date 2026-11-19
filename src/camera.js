import * as THREE from 'three';
import { heightAt } from './world/heightmap.js';

const MODES = [
  { dist: 11, height: 4.2, look: 1.8 },
  { dist: 18, height: 7, look: 2 },
  { dist: 0.2, height: 2.0, look: 1.9, inside: true },
];
const RECENTER_AFTER = 1.5;

export function lockPointer(canvas) {
  try {
    canvas.requestPointerLock?.()?.catch?.(() => {});
  } catch {
    // Pointer lock unavailable (embedded frame or no user gesture); mouse-look just stays off.
  }
}

export class ChaseCamera {
  constructor(camera, canvas) {
    this.camera = camera;
    this.mode = 0;
    this.yaw = null;
    this.pos = new THREE.Vector3();
    this.lookYaw = 0;
    this.lookPitch = 0;
    this.idle = RECENTER_AFTER + 1;
    this.enabled = false;
    canvas.addEventListener('click', () => {
      if (this.enabled && document.pointerLockElement !== canvas) lockPointer(canvas);
    });
    document.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== canvas) return;
      this.lookYaw -= e.movementX * 0.004;
      this.lookPitch = Math.max(-0.35, Math.min(1.1, this.lookPitch + e.movementY * 0.003));
      this.idle = 0;
    });
  }

  // Downward aim angle while aiming; level at rest.
  get aimPitch() {
    return Math.max(-0.5, Math.min(0.6, this.lookPitch * 0.7 + 0.03));
  }

  cycle() {
    this.mode = (this.mode + 1) % MODES.length;
  }

  get viewYaw() {
    return (this.yaw ?? 0) + this.lookYaw;
  }

  update(dt, car, snap = false) {
    const m = car.cameraProfile || MODES[this.mode];
    const vel = car.vel.length();
    if (this.yaw === null || snap) this.yaw = car.heading;
    if (m.free) {
      // On foot the camera only turns when the mouse does; the character never drags it around.
      this.yaw += this.lookYaw;
      this.lookYaw = 0;
    } else {
      let d = car.heading - this.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.yaw += d * Math.min(1, dt * (m.inside ? 20 : 3.5));
    }

    this.idle += dt;
    if (!m.free && this.idle > RECENTER_AFTER && vel > 3) {
      const k = Math.min(1, dt * 2.5);
      this.lookYaw = Math.atan2(Math.sin(this.lookYaw), Math.cos(this.lookYaw)) * (1 - k);
      this.lookPitch *= 1 - k;
    }

    const yaw = this.yaw + this.lookYaw;
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    const carY = car.model.group.position.y;
    if (m.inside) {
      this.pos.set(car.pos.x + Math.sin(this.yaw) * 1.6, carY + m.height, car.pos.z + Math.cos(this.yaw) * 1.6);
      this.camera.position.copy(this.pos);
      this.camera.lookAt(
        this.pos.x + fx * 30,
        this.pos.y - Math.sin(this.lookPitch) * 30,
        this.pos.z + fz * 30
      );
    } else {
      const dist = m.dist + Math.min(vel * 0.08, 4);
      const flat = dist * Math.cos((m.aim ? 0.15 : this.lookPitch) * 0.8);
      // Over-the-shoulder offset to the right (used while aiming).
      const sx = -fz * (m.side || 0), sz = fx * (m.side || 0);
      const target = new THREE.Vector3(car.pos.x - fx * flat + sx, 0, car.pos.z - fz * flat + sz);
      target.y = Math.max(carY + m.height + (m.aim ? 0 : Math.sin(this.lookPitch * 0.8) * dist), heightAt(target.x, target.z) + 1.5);
      if (snap) this.pos.copy(target);
      else this.pos.lerp(target, Math.min(1, dt * (this.idle < 0.3 ? 14 : 6)));
      this.camera.position.copy(this.pos);
      if (m.aim) {
        // Aiming looks along the crosshair, not at the player, so mouse pitch alone sets how high you shoot.
        const p = this.aimPitch;
        this.camera.lookAt(this.pos.x + fx * Math.cos(p) * 50, this.pos.y - Math.sin(p) * 50, this.pos.z + fz * Math.cos(p) * 50);
      } else {
        const ahead = 4 * Math.min(1, Math.max(0, this.idle - RECENTER_AFTER));
        this.camera.lookAt(car.pos.x + fx * ahead + sx, carY + m.look, car.pos.z + fz * ahead + sz);
      }
    }
    const fovTarget = 62 + Math.min(vel * 0.35, 14);
    this.camera.fov += (fovTarget - this.camera.fov) * Math.min(1, dt * 2);
    this.camera.updateProjectionMatrix();
  }
}
