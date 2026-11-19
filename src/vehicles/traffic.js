import * as THREE from 'three';
import { heightAt } from '../world/heightmap.js';
import { GRID_X, GRID_Z, CBD_EDGE } from '../world/city.js';
import { makeVehicle, setBrakeLights } from './models.js';

const CYCLE = 32;
const NS_GREEN = 13, NS_AMBER = 16, EW_GREEN = 29;

let seed = 777;
function rand() {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
}

const keyOf = (x, z) => `${Math.round(x * 10)},${Math.round(z * 10)}`;
const laneFor = (width) => Math.max(1.8, Math.min(3.2, width / 4));

function buildGraph(edges) {
  const nodes = new Map();
  const node = ([x, z]) => {
    const k = keyOf(x, z);
    if (!nodes.has(k)) nodes.set(k, { key: k, x, z, nbrs: [], signal: null, occupants: new Map() });
    return nodes.get(k);
  };
  const list = [];
  for (const e of edges) {
    const a = node(e.a), b = node(e.b);
    if (a === b || a.nbrs.some((n) => n.node === b)) continue;
    a.nbrs.push({ node: b, width: e.width });
    b.nbrs.push({ node: a, width: e.width });
    list.push({ a, b, width: e.width });
  }
  for (const n of nodes.values()) n.stopBack = Math.max(...n.nbrs.map((e) => e.width)) / 2 + 2.5;
  return { nodes, list };
}

const isCityLine = (arr, v) => arr.some((g) => Math.abs(g - v) < 0.05);

function addSignals(nodes) {
  const signalled = [];
  for (const n of nodes.values()) {
    if (n.nbrs.length < 3 || n.x < CBD_EDGE - 0.05) continue;
    if (!isCityLine(GRID_X, n.x) || !isCityLine(GRID_Z, n.z)) continue;
    n.signal = { offset: (GRID_X.findIndex((g) => Math.abs(g - n.x) < 0.05) * 3 + GRID_Z.findIndex((g) => Math.abs(g - n.z) < 0.05) * 5) % CYCLE };
    signalled.push(n);
  }
  return signalled;
}

function signalAt(node, axis, time) {
  const t = (time + node.signal.offset) % CYCLE;
  if (axis === 'ns') return t < NS_GREEN ? 'green' : t < NS_AMBER ? 'amber' : 'red';
  return t < NS_AMBER ? 'red' : t < EW_GREEN ? 'green' : 'amber';
}

const axisOf = (from, to) => (Math.abs(from.x - to.x) < 0.05 ? 'ns' : 'ew');

// Keep-left: lane offset is to the left of the direction of travel.
function lanePoint(from, to, dist, lane) {
  let dx = to.x - from.x, dz = to.z - from.z;
  const len = Math.hypot(dx, dz);
  dx /= len; dz /= len;
  const d = dist < 0 ? len + dist : dist;
  return { x: from.x + dx * d + dz * lane, z: from.z + dz * d - dx * lane };
}

const edgeWidth = (a, b) => a.nbrs.find((n) => n.node === b)?.width ?? 8;

function unit(ax, az, bx, bz) {
  const l = Math.hypot(bx - ax, bz - az) || 1;
  return [(bx - ax) / l, (bz - az) / l];
}

// How a car passes through a junction: which way it came in, and whether it goes straight or turns right (crossing oncoming).
function movement(from, node, to) {
  const [ix, iz] = unit(from.x, from.z, node.x, node.z);
  const [ox, oz] = unit(node.x, node.z, to.x, to.z);
  const straight = ix * ox + iz * oz > 0.7;
  const left = ox * iz - oz * ix > 0;
  return { from, ix, iz, crossesOncoming: !straight && !left };
}

function compatible(a, b) {
  if (a.from === b.from) return true;
  const opposite = a.ix * b.ix + a.iz * b.iz < -0.7;
  return opposite && !a.crossesOncoming && !b.crossesOncoming;
}

const STALE_OCCUPANT = 12;

class AICar {
  constructor(model, from, to) {
    this.model = model;
    this.spec = model.spec;
    this.from = from;
    this.to = to;
    this.waypoints = [];
    this.pos = new THREE.Vector3();
    this.knock = new THREE.Vector2();
    this.speed = 0;
    this.cruise = 9 + rand() * 6;
    this.frozen = false;
    this.waited = 0;
    const len = Math.hypot(to.x - from.x, to.z - from.z);
    const start = lanePoint(from, to, len * (0.2 + rand() * 0.5), laneFor(edgeWidth(from, to)));
    this.pos.set(start.x, heightAt(start.x, start.z), start.z);
    this.heading = Math.atan2(to.x - from.x, to.z - from.z);
    this.planNext();
  }

  planNext() {
    const options = this.to.nbrs.map((n) => n.node).filter((n) => n !== this.from);
    const next = options.length ? options[Math.floor(rand() * options.length)] : this.from;
    const inLane = laneFor(edgeWidth(this.from, this.to));
    const outLane = laneFor(edgeWidth(this.to, next));
    const arrive = lanePoint(this.from, this.to, -this.to.stopBack, inLane);
    const leave = lanePoint(this.to, next, this.to.stopBack, outLane);
    const mid = {
      x: (arrive.x + leave.x) / 2 + (this.to.x - (arrive.x + leave.x) / 2) * 0.35,
      z: (arrive.z + leave.z) / 2 + (this.to.z - (arrive.z + leave.z) / 2) * 0.35,
    };
    arrive.stopAt = this.to;
    arrive.axis = axisOf(this.from, this.to);
    if (this.to.nbrs.length >= 3) arrive.move = movement(this.from, this.to, next);
    leave.exits = this.to;
    this.waypoints.push(arrive, mid, leave);
    this.from = this.to;
    this.to = next;
  }

  holdFor(wp, dist, env) {
    const n = wp.stopAt;
    if (!n || !n.signal || env.signalsOff) return false;
    const s = signalAt(n, wp.axis, env.time);
    return s === 'red' || (s === 'amber' && dist > 9);
  }

  junctionBlocked(wp, dist, env) {
    if (!wp.move || dist > 12 || this.waited > 6) return false;
    for (const [car, entry] of wp.stopAt.occupants) {
      if (car === this) continue;
      if (env.time - entry.at > STALE_OCCUPANT) {
        wp.stopAt.occupants.delete(car);
        continue;
      }
      if (!compatible(wp.move, entry.move)) return true;
    }
    return false;
  }

  mustWait(wp, dist, env) {
    return this.holdFor(wp, dist, env) || this.junctionBlocked(wp, dist, env);
  }

  passed(wp, env) {
    if (wp.move) wp.stopAt.occupants.set(this, { move: wp.move, at: env.time });
    if (wp.exits) wp.exits.occupants.delete(this);
    if (wp.stopAt) this.waited = 0;
  }

  // Shot at or spooked: 'flee' floors it along the route ignoring lights; 'ram' goes straight for the player on foot.
  provoke(mode, seconds) {
    if (this.panic?.mode === 'ram' && mode === 'flee') return;
    this.panic = { mode, t: seconds };
  }

  ram(dt, env) {
    const w = env.walker;
    const dx = w.pos.x - this.pos.x, dz = w.pos.z - this.pos.z;
    if (Math.hypot(dx, dz) < 3.5) {
      // Got you (or nearly): keep going and get out of there.
      this.panic = { mode: 'flee', t: 8 };
      return;
    }
    let diff = Math.atan2(dx, dz) - this.heading;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    const turn = Math.max(-2.4 * dt, Math.min(2.4 * dt, diff * 4 * dt));
    this.heading += turn;
    this.yawRate = dt > 0 ? turn / dt : 0;
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    // Never plough through a building to get you: bail out into a getaway instead.
    if (env.grid?.contains(this.pos.x + fx * 4, this.pos.z + fz * 4, this.pos.y + 0.8)) {
      this.speed *= 0.4;
      this.panic = { mode: 'flee', t: 6 };
      return;
    }
    const want = Math.abs(diff) > 1.2 ? 8 : Math.min(26, this.spec.maxSpeed * 0.7);
    this.speed += Math.max(-12 * dt, Math.min(9 * dt, want - this.speed));
    setBrakeLights(this.model, false);
    this.pos.x += fx * this.speed * dt + this.knock.x * dt;
    this.pos.z += fz * this.speed * dt + this.knock.y * dt;
    this.knock.multiplyScalar(Math.exp(-3 * dt));
    this.pos.y = heightAt(this.pos.x, this.pos.z);
    this.sync(dt);
  }

  update(dt, others, player, env) {
    if (this.frozen) return;
    if (this.wreck) {
      this.speed = Math.max(0, this.speed - 10 * dt);
      const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
      this.pos.x += fx * this.speed * dt + this.knock.x * dt;
      this.pos.z += fz * this.speed * dt + this.knock.y * dt;
      this.knock.multiplyScalar(Math.exp(-3 * dt));
      setBrakeLights(this.model, false);
      this.sync(dt);
      return;
    }
    if (this.panic) {
      this.panic.t -= dt;
      if (this.panic.t <= 0) this.panic = null;
      else if (this.panic.mode === 'ram' && !env.walker) this.panic.mode = 'flee';
    }
    if (this.panic?.mode === 'ram') {
      this.ram(dt, env);
      return;
    }
    const fleeing = this.panic?.mode === 'flee';
    let target = this.waypoints[0];
    let dist = Math.hypot(target.x - this.pos.x, target.z - this.pos.z);
    let held = !fleeing && this.mustWait(target, dist, env);
    for (let guard = 0; dist < 2.5 && !held && guard < 4; guard++) {
      this.passed(this.waypoints.shift(), env);
      if (this.waypoints.length < 2) this.planNext();
      target = this.waypoints[0];
      dist = Math.hypot(target.x - this.pos.x, target.z - this.pos.z);
      held = !fleeing && this.mustWait(target, dist, env);
    }
    if (held && this.speed < 0.5 && !this.holdFor(target, dist, env)) this.waited += dt;
    const dx = target.x - this.pos.x, dz = target.z - this.pos.z;
    let diff = Math.atan2(dx, dz) - this.heading;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    const turn = dist > 1 ? Math.max(-1.6 * dt, Math.min(1.6 * dt, diff * 3 * dt)) : 0;
    this.heading += turn;
    this.yawRate = dt > 0 ? turn / dt : 0;

    const cruise = fleeing ? Math.max(20, this.cruise * 2.2) : this.cruise;
    let limit = cruise * (Math.abs(diff) > 0.4 ? (fleeing ? 0.6 : 0.45) : 1);
    if (held) limit = Math.min(limit, Math.max(0, (dist - 1.2) * 1.3));
    if (!fleeing && env.signalsOff && target.stopAt?.signal && dist < 15) limit = Math.min(limit, 5);
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    if (!fleeing) {
      for (const o of others) this.yieldTo(o, fx, fz, (v) => { limit = Math.min(limit, v); });
      this.yieldTo(player, fx, fz, (v) => { limit = Math.min(limit, v); });
    }
    setBrakeLights(this.model, limit < this.speed - 0.5 || (this.speed < 0.5 && limit < 0.5));
    this.speed += Math.max(-12 * dt, Math.min((fleeing ? 9 : 4) * dt, limit - this.speed));
    this.pos.x += fx * this.speed * dt + this.knock.x * dt;
    this.pos.z += fz * this.speed * dt + this.knock.y * dt;
    this.knock.multiplyScalar(Math.exp(-3 * dt));
    this.pos.y = heightAt(this.pos.x, this.pos.z);
    this.sync(dt);
  }

  yieldTo(o, fx, fz, cap) {
    if (!o || o === this) return;
    const ox = o.pos.x - this.pos.x, oz = o.pos.z - this.pos.z;
    if (Math.abs(ox) > 16 || Math.abs(oz) > 16) return;
    if (o.model?.type !== 'person' && Math.cos(o.heading - this.heading) < -0.5) return;
    const along = ox * fx + oz * fz;
    const side = Math.abs(ox * fz - oz * fx);
    if (along > 0 && along < 14 && side < 2.4) cap(Math.max(0, (along - 6) * 1.2));
  }

  sync(dt) {
    const g = this.model.group;
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const hl = this.spec.length / 2;
    const hF = heightAt(this.pos.x + fx * hl, this.pos.z + fz * hl);
    const hB = heightAt(this.pos.x - fx * hl, this.pos.z - fz * hl);
    g.position.set(this.pos.x, (hF + hB) / 2 + 0.02, this.pos.z);
    if (this.model.rider) this.model.rider.group.visible = this.nearPlayer !== false;
    const lean = this.spec.bike ? Math.max(-0.6, Math.min(0.6, -(this.yawRate || 0) * this.speed * 0.09)) : 0;
    g.rotation.set(-Math.atan2(hF - hB, this.spec.length), this.heading, lean, 'YXZ');
    const spin = (this.speed * dt) / this.spec.radius;
    for (const w of this.model.wheels.all) w.rotation.x += spin;
  }
}

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export const GLOW_TEXTURE = glowTexture();

export function glowMaterial(color) {
  return new THREE.MeshBasicMaterial({
    map: GLOW_TEXTURE, color, transparent: true, opacity: 0, depthWrite: false,
    blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
  });
}

function createRobots(scene, colliders, signalled, roads) {
  const heads = [];
  for (const n of signalled) {
    const cross = n.stopBack - 2.5;
    for (const { node: from, width } of n.nbrs) {
      let dx = n.x - from.x, dz = n.z - from.z;
      const len = Math.hypot(dx, dz);
      dx /= len; dz /= len;
      const x = n.x - dx * (cross + 1.4) + dz * (width / 2 + 1.0);
      const z = n.z - dz * (cross + 1.4) - dx * (width / 2 + 1.0);
      if (roads && roads.clearance(x, z) < 0.3) continue;
      heads.push({ node: n, axis: axisOf(from, n), x, z, rot: Math.atan2(-dx, -dz) });
      colliders.push({ minX: x - 0.2, maxX: x + 0.2, minZ: z - 0.2, maxZ: z + 0.2 });
    }
  }
  const poleGeo = new THREE.CylinderGeometry(0.08, 0.1, 3.4, 6).translate(0, 1.7, 0);
  const boxGeo = new THREE.BoxGeometry(0.55, 1.45, 0.3).translate(0, 3.4, 0);
  const lampGeo = new THREE.BoxGeometry(0.34, 0.34, 0.04);
  const poles = new THREE.InstancedMesh(poleGeo, new THREE.MeshLambertMaterial({ color: '#3a3d40' }), heads.length);
  const boxes = new THREE.InstancedMesh(boxGeo, new THREE.MeshLambertMaterial({ color: '#1c1e20' }), heads.length);
  const lampMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  const lamps = ['red', 'amber', 'green'].map(() => new THREE.InstancedMesh(lampGeo, lampMat, heads.length));
  const m = new THREE.Matrix4(), off = new THREE.Matrix4();
  heads.forEach((h, i) => {
    m.makeRotationY(h.rot).setPosition(h.x, heightAt(h.x, h.z), h.z);
    poles.setMatrixAt(i, m);
    boxes.setMatrixAt(i, m);
    [0.44, 0, -0.44].forEach((dy, k) => lamps[k].setMatrixAt(i, off.copy(m).multiply(new THREE.Matrix4().makeTranslation(0, 3.4 + dy, 0.17))));
  });
  poles.castShadow = boxes.castShadow = true;
  scene.add(poles, boxes, ...lamps);
  for (const l of lamps) l.setColorAt(0, new THREE.Color());

  const ON = [new THREE.Color('#ff2a1a'), new THREE.Color('#ffb020'), new THREE.Color('#30ff70')];
  const OFF = [new THREE.Color('#3a0c08'), new THREE.Color('#3a2808'), new THREE.Color('#0a3014')];
  const ORDER = { red: 0, amber: 1, green: 2 };
  return (time, off) => {
    heads.forEach((h, i) => {
      const lit = off ? -1 : ORDER[signalAt(h.node, h.axis, time)];
      for (let k = 0; k < 3; k++) lamps[k].setColorAt(i, k === lit ? ON[k] : OFF[k]);
    });
    for (const l of lamps) l.instanceColor.needsUpdate = true;
  };
}

export function createTraffic(scene, colliders, edges, count = 80, roads = null) {
  const { nodes, list } = buildGraph(edges);
  const updateRobots = createRobots(scene, colliders, addSignals(nodes), roads);
  const cityEdges = list.filter((e) => e.width >= 10);
  const cars = [];
  const types = ['golf', 'golf', 'taxi', 'taxi', 'bakkie', 'bakkie', 'police', 'golf', 'taxi', 'scooter', 'scooter', 'superbike', 'sports', 'golf'];
  for (let k = 0; k < count; k++) {
    const pool = k % 2 === 0 ? cityEdges : list;
    const e = pool[Math.floor(rand() * pool.length)];
    const [from, to] = rand() < 0.5 ? [e.a, e.b] : [e.b, e.a];
    const model = makeVehicle(types[k % types.length], rand);
    scene.add(model.group);
    cars.push(new AICar(model, from, to));
  }

  const pools = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), glowMaterial('#ffe2a8'), cars.length);
  pools.frustumCulled = false;
  scene.add(pools);
  const pm = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  const pScale = new THREE.Vector3(5, 1, 10), pPos = new THREE.Vector3();

  function collidePlayer(player, onImpact) {
    for (const c of cars) {
      const dx = player.pos.x - c.pos.x, dz = player.pos.z - c.pos.z;
      const minD = (player.spec.length + c.spec.length) / 2 - 0.8;
      if (Math.hypot(dx, dz) > minD + 3) continue;
      for (const pc of player.circles()) {
        const ex = pc.x - c.pos.x, ez = pc.z - c.pos.z;
        const fx = Math.sin(c.heading), fz = Math.cos(c.heading);
        const half = c.spec.length / 2 - c.spec.width / 2;
        const along = Math.max(-half, Math.min(half, ex * fx + ez * fz));
        const nx = pc.x - (c.pos.x + fx * along), nz = pc.z - (c.pos.z + fz * along);
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
          if (-vn > 3) onImpact(-vn, c);
        }
        break;
      }
    }
  }

  let time = 0;
  const nodeList = [...nodes.values()].filter((n) => n.nbrs.length > 0);
  return {
    cars,
    nodes: nodeList,
    signal(node, axis) {
      return node.signal ? signalAt(node, axis, time) : 'green';
    },
    nearestNode(x, z) {
      let best = nodeList[0], bd = Infinity;
      for (const n of nodeList) {
        const d = (n.x - x) ** 2 + (n.z - z) ** 2;
        if (d < bd) { bd = d; best = n; }
      }
      return best;
    },
    removeCar(car) {
      const i = cars.indexOf(car);
      if (i >= 0) cars.splice(i, 1);
      for (const n of nodeList) n.occupants.delete(car);
      pools.count = cars.length;
    },
    get time() {
      return time;
    },
    setFrozen(v) {
      for (const c of cars) c.frozen = v;
    },
    // Gunfire nearby: some drivers floor it.
    scare(x, z, r) {
      for (const c of cars) {
        if (!c.panic && Math.hypot(c.pos.x - x, c.pos.z - z) < r && Math.random() < 0.5) c.provoke('flee', 8 + Math.random() * 6);
      }
    },
    update(dt, player, onImpact, { signalsOff = false, lights = 0, walker = null, grid = null } = {}) {
      time += dt;
      const env = { time, signalsOff, walker, grid };
      const focus = player || walker;
      for (const c of cars) {
        if (focus) c.nearPlayer = Math.abs(c.pos.x - focus.pos.x) < 90 && Math.abs(c.pos.z - focus.pos.z) < 90;
        c.update(dt, cars, focus, env);
      }
      if (player) collidePlayer(player, onImpact);
      updateRobots(time, signalsOff);
      pools.material.opacity = lights * 0.75;
      pools.visible = lights > 0.01;
      if (pools.visible) {
        cars.forEach((c, i) => {
          const fx = Math.sin(c.heading), fz = Math.cos(c.heading);
          const x = c.pos.x + fx * 7.5, z = c.pos.z + fz * 7.5;
          pPos.set(x, heightAt(x, z) + 0.3, z);
          q.setFromAxisAngle(up, c.heading);
          pools.setMatrixAt(i, pm.compose(pPos, q, pScale));
        });
        pools.instanceMatrix.needsUpdate = true;
      }
    },
  };
}
