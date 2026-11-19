import * as THREE from 'three';
import { heightAt } from '../world/heightmap.js';
import { makePerson, animatePerson, knockDown, poseArms, addPistol } from './person.js';
import { vehicleCircles } from './pedestrians.js';

const COP_LOOK = {
  skin: '#5a3a28', top: '#1d2a4a', bottom: '#151c30', shoes: '#111', hair: '#120c08', hat: '#1d2a4a',
  hairStyle: 'cap', longSleeves: true, shorts: false, scale: 1,
};
const SKINS = ['#4a2e1e', '#5a3a28', '#7a5038', '#8f6040', '#c48f68', '#e0b896'];
const RUN = 6.8, GRAB_RANGE = 1.4, SHOOT_RANGE = 26, KEEP_AWAY = 9;

// Cops on foot: they pile out of a stopped patrol car, chase the player, arrest or shoot, then get back in.
export function createOfficers(scene) {
  const list = [];

  function deploy(chaser) {
    const car = chaser.car;
    const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
    for (const side of [-1, 1]) {
      const model = makePerson({ ...COP_LOOK, skin: SKINS[Math.floor(Math.random() * SKINS.length)] }, { shadow: true });
      addPistol(model);
      model.gun.visible = true;
      const x = car.pos.x + fz * side * 1.4, z = car.pos.z - fx * side * 1.4;
      const pos = new THREE.Vector3(x, heightAt(x, z), z);
      scene.add(model.group);
      const o = { model, pos, vel: new THREE.Vector2(), heading: car.heading, hp: 100, state: 'run', down: 0, fireT: 0.6 + Math.random(), chaser, grab: false, arms: null };
      list.push(o);
      chaser.officers.push(o);
    }
  }

  function remove(o) {
    scene.remove(o.model.group);
    list.splice(list.indexOf(o), 1);
    const own = o.chaser.officers;
    if (own.includes(o)) own.splice(own.indexOf(o), 1);
  }

  function clear() {
    for (const o of [...list]) remove(o);
  }

  // Bullets and fists make them flinch; heavy blows floor them for a moment; at zero health they stay down for good.
  function damage(o, amount, dir, { knock = false } = {}) {
    if (o.hp <= 0) return false;
    o.hp -= amount;
    if (o.hp <= 0) {
      o.state = 'dead';
      o.vel.set(dir.x, dir.y).multiplyScalar(4);
      o.model.gun.visible = false;
    } else if (knock) {
      o.state = 'down';
      o.down = 1.4;
      o.vel.set(dir.x, dir.y).multiplyScalar(2.5);
    } else {
      o.flinch = 1;
      o.vel.set(dir.x, dir.y).multiplyScalar(1.2);
    }
    return true;
  }

  function moveTo(o, dt, tx, tz, speed, colliders, vehicles) {
    const dx = tx - o.pos.x, dz = tz - o.pos.z, d = Math.hypot(dx, dz);
    const want = d > 0.1 ? new THREE.Vector2((dx / d) * speed, (dz / d) * speed) : new THREE.Vector2();
    o.vel.lerp(want, Math.min(1, dt * 6));
    if (d > 0.1) o.heading = Math.atan2(dx, dz);
    step(o, dt, colliders, vehicles);
  }

  function step(o, dt, colliders, vehicles) {
    o.pos.x += o.vel.x * dt;
    o.pos.z += o.vel.y * dt;
    colliders.resolveCircle(o.pos, 0.35, o.pos.y);
    for (const v of vehicles) {
      if (Math.abs(v.pos.x - o.pos.x) > 5 || Math.abs(v.pos.z - o.pos.z) > 5) continue;
      for (const c of vehicleCircles(v)) {
        const ex = o.pos.x - c.x, ez = o.pos.z - c.z, d = Math.hypot(ex, ez), min = c.r + 0.35;
        if (d < min && d > 1e-4) {
          o.pos.x += (ex / d) * (min - d);
          o.pos.z += (ez / d) * (min - d);
        }
      }
    }
    o.pos.y = heightAt(o.pos.x, o.pos.z);
  }

  // Returns how many officers currently have hands on the player.
  function update(dt, { target, inVehicle, stars, colliders, vehicles, lineClear, onShoot }) {
    let grabbing = 0;
    for (const o of [...list]) {
      const dx = target.x - o.pos.x, dz = target.z - o.pos.z, dist = Math.hypot(dx, dz);
      o.arms = null;
      o.grab = false;
      if (o.state === 'down' || o.state === 'dead') {
        o.down -= dt;
        o.vel.multiplyScalar(Math.exp(-4 * dt));
        step(o, dt, colliders, vehicles);
        knockDown(o.model, o.state === 'dead' ? 1 : Math.min(1, o.down * 2));
        if (o.state === 'down' && o.down <= 0) {
          o.state = 'run';
          knockDown(o.model, 0);
        }
        if (dist > 140) remove(o);
        sync(o);
        continue;
      }
      if (o.flinch > 0) {
        o.flinch = Math.max(0, o.flinch - dt / 0.35);
        o.vel.multiplyScalar(Math.exp(-6 * dt));
        step(o, dt, colliders, vehicles);
        animatePerson(o.model, dt, 0);
        poseArms(o.model, { mode: 'flinch', k: 1 - o.flinch, side: 1 });
        sync(o);
        continue;
      }
      const car = o.chaser.car;
      const carGone = !o.chaser.alive;
      if (carGone && dist > 140) {
        remove(o);
        continue;
      }
      if (!carGone && (inVehicle || stars === 0)) {
        if (dist > 140) {
          remove(o);
          continue;
        }
        moveTo(o, dt, car.pos.x, car.pos.z, RUN, colliders, vehicles.filter((v) => v !== car));
        animatePerson(o.model, dt, o.vel.length());
        if (Math.hypot(car.pos.x - o.pos.x, car.pos.z - o.pos.z) < 2.2) remove(o);
        else sync(o);
        continue;
      }
      const sees = dist < SHOOT_RANGE && lineClear(o.pos.x, o.pos.z, target.x, target.z);
      const hostile = stars >= 3;
      const heightGap = target.y - o.pos.y;
      if (hostile && sees && (dist < KEEP_AWAY + 4 || heightGap > 1.5)) {
        o.vel.multiplyScalar(Math.exp(-8 * dt));
        o.heading = Math.atan2(dx, dz);
        step(o, dt, colliders, vehicles);
        animatePerson(o.model, dt, o.vel.length());
        const pitch = -Math.atan2(heightGap - 0.2, dist) * 0.9;
        o.arms = { mode: 'aim', pitch };
        poseArms(o.model, o.arms);
        o.fireT -= dt;
        if (o.fireT <= 0) {
          o.fireT = 0.8 + Math.random() * 0.7;
          const chance = Math.max(0.2, Math.min(0.75, 1 - dist / 30)) * (target.speed > 5 ? 0.6 : 1);
          o.model.muzzle.updateWorldMatrix(true, false);
          const from = new THREE.Vector3().setFromMatrixPosition(o.model.muzzle.matrixWorld);
          onShoot(from, Math.random() < chance);
        }
      } else if (heightGap > 1.2) {
        moveTo(o, dt, target.x, target.z, RUN * 0.5, colliders, vehicles);
        animatePerson(o.model, dt, o.vel.length());
      } else {
        moveTo(o, dt, target.x, target.z, dist > GRAB_RANGE ? RUN : 0, colliders, vehicles);
        animatePerson(o.model, dt, o.vel.length());
        if (dist < GRAB_RANGE + 0.2) {
          o.grab = true;
          o.arms = { mode: 'aim', pitch: 0.5 };
          poseArms(o.model, o.arms);
          grabbing++;
        }
      }
      if (dist > 200) remove(o);
      else sync(o);
    }
    return grabbing;
  }

  function sync(o) {
    o.model.group.position.copy(o.pos);
    o.model.group.rotation.y = o.heading;
  }

  // Lets bullets, fists and bumpers find officers: a standing capsule around each live one.
  function targets() {
    return list.filter((o) => o.hp > 0);
  }

  return { list, deploy, remove, clear, damage, update, targets };
}
