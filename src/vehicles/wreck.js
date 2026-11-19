import * as THREE from 'three';
import { GLOW_TEXTURE } from './traffic.js';
import { roofHeight } from '../people/walker.js';

const MAX_HP = { bike: 60, car: 100 };
const BURN_TIME = 7, BLAST_RADIUS = 7;
const CHARRED = new THREE.MeshLambertMaterial({ color: '#1c1a18' });
const flameMat = new THREE.SpriteMaterial({ map: GLOW_TEXTURE, color: '#ff7a1a', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
const smokeMat = new THREE.SpriteMaterial({ map: GLOW_TEXTURE, color: '#2a2622', depthWrite: false, transparent: true, opacity: 0.55 });

export const vehicleHp = (v) => v.hp ?? (v.spec.bike ? MAX_HP.bike : MAX_HP.car);
export const vehicleMaxHp = (v) => (v.spec.bike ? MAX_HP.bike : MAX_HP.car);

// Vehicles that are on fire or burnt out: they stall, burn for a few seconds, then blow up and stay as a charred shell.
export function createWrecks(scene) {
  const burning = [];

  function ignite(v) {
    const fire = new THREE.Group();
    const roof = roofHeight(v);
    // Flames lick out of the bonnet and over the roof so they show from any angle.
    const flames = Array.from({ length: 8 }, (_, i) => {
      const s = new THREE.Sprite(flameMat.clone());
      const front = i < 4;
      s.position.set((Math.random() - 0.5) * v.spec.width * 0.7,
        front ? roof * 0.55 + Math.random() * 0.4 : roof + 0.1 + Math.random() * 0.3,
        front ? v.spec.length * 0.5 - 0.2 : (Math.random() - 0.3) * v.spec.length * 0.5);
      fire.add(s);
      return s;
    });
    const smoke = Array.from({ length: 5 }, () => {
      const s = new THREE.Sprite(smokeMat.clone());
      fire.add(s);
      return { s, t: Math.random() * 2 };
    });
    v.model.group.add(fire);
    v.wreck = { state: 'burning', t: 0, fire, flames, smoke, roof };
    burning.push(v);
  }

  // Returns true when this hit set the vehicle alight.
  function damage(v, amount) {
    if (v.wreck || amount <= 0) return false;
    v.hp = vehicleHp(v) - amount;
    if (v.hp > 0) return false;
    v.hp = 0;
    ignite(v);
    return true;
  }

  function char(v) {
    v.model.group.traverse((o) => {
      if (o.isMesh) o.material = CHARRED;
    });
  }

  // onBlast(vehicle, radius) lets the game hurt whoever is nearby.
  function update(dt, onBlast) {
    for (const v of [...burning]) {
      const w = v.wreck;
      w.t += dt;
      if (w.state === 'burning') {
        w.flames.forEach((f, i) => {
          const k = 0.8 + Math.sin(w.t * 13 + i * 2.1) * 0.25 + Math.random() * 0.15;
          f.scale.setScalar(1.7 * k);
        });
      }
      for (const p of w.smoke) {
        p.t = (p.t + dt * 0.6) % 2;
        p.s.position.set(Math.sin(p.t * 3) * 0.3, w.roof + 0.4 + p.t * 2.2, 0);
        p.s.scale.setScalar(1 + p.t * 1.4);
        p.s.material.opacity = 0.5 * (1 - p.t / 2);
      }
      if (w.state === 'burning' && w.t > BURN_TIME) {
        w.state = 'burnt';
        char(v);
        w.flames.forEach((f) => f.scale.setScalar(7));
        w.blast = 0.25;
        flash(v.pos);
        onBlast(v, BLAST_RADIUS);
      }
      if (w.state === 'burnt') {
        w.blast -= dt;
        if (w.blast <= 0) {
          v.model.group.remove(w.fire);
          burning.splice(burning.indexOf(v), 1);
        }
      }
    }
  }

  // Blow a vehicle up right now (C4): skips the burning stage.
  function explode(v) {
    if (!v.wreck) ignite(v);
    if (v.wreck.state === 'burning') v.wreck.t = BURN_TIME + 0.001;
  }

  const blasts = [];
  // A fireball at a point: grows and fades over half a second.
  function flash(pos) {
    const fire = new THREE.Sprite(flameMat.clone());
    const smoke = new THREE.Sprite(smokeMat.clone());
    fire.position.copy(pos).y += 1;
    smoke.position.copy(pos).y += 2;
    scene.add(fire, smoke);
    blasts.push({ fire, smoke, t: 0 });
  }

  function updateBlasts(dt) {
    for (const b of [...blasts]) {
      b.t += dt;
      const k = b.t / 0.55;
      b.fire.scale.setScalar(3 + k * 12);
      b.fire.material.opacity = Math.max(0, 1 - k);
      b.smoke.scale.setScalar(4 + k * 10);
      b.smoke.position.y += dt * 3;
      b.smoke.material.opacity = Math.max(0, 0.6 * (1 - k * 0.6));
      if (k >= 1.6) {
        scene.remove(b.fire, b.smoke);
        blasts.splice(blasts.indexOf(b), 1);
      }
    }
  }

  return { damage, update: (dt, onBlast) => { update(dt, onBlast); updateBlasts(dt); }, ignite, explode, flash };
}
