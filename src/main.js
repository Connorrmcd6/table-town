import * as THREE from 'three';
import { createTerrain } from './world/terrain.js';
import { createSky } from './world/sky.js';
import { createCity } from './world/city.js';
import { createLandmarks } from './world/landmarks.js';
import { createSuburbs } from './world/suburbs.js';
import { createStreetlights } from './world/streetlights.js';
import { districtAt, w as toWorld } from './world/heightmap.js';
import { ColliderGrid } from './collision.js';
import { playerTaxi, makeVehicle, seatRider } from './vehicles/models.js';
import { clearPose, addPistol, addArsenal } from './people/person.js';
import { createWeapons, WEAPONS, WEAPON_ORDER } from './weapons.js';
import { createWrecks, vehicleHp, vehicleMaxHp } from './vehicles/wreck.js';
import { createPickups, createHospitalMarker } from './world/pickups.js';
import { Car } from './vehicles/car.js';
import { loadVehicleModels } from './vehicles/gltfVehicles.js';
import { createTraffic } from './vehicles/traffic.js';
import { cityEdges, routeEdges, createJunctions, ROADS } from './world/city.js';
import { buildRoadIndex } from './world/roadIndex.js';
import { Walker, roofHeight } from './people/walker.js';
import { createPedestrians, vehicleCircles } from './people/pedestrians.js';
import { createPolice, collideCars, placeOnRoad } from './police.js';
import { ChaseCamera, lockPointer } from './camera.js';
import { readDriving, wasPressed, isDown, takeMouse, releaseAll, endFrame } from './input.js';
import { createCheatPrompt } from './cheats.js';
import { createHud, streetAt } from './hud.js';
import * as audio from './audio.js';

const START = { x: toWorld(-180) + 2.8, z: toWorld(-230), heading: 0 };
const HOSPITAL = { x: toWorld(1100), z: toWorld(300), name: 'Groote Skuur Hospital' };
const STATION = { x: toWorld(400), z: toWorld(-330), name: 'Caledon Square' };
const START_CLOCK = 16 * 60 + 30;
const SUNDOWNER_STOPS = [6 * 60 + 15, 12 * 60, 17 * 60 + 30, 21 * 60];
const MAX_PARKED = 6;
const ENTER_RANGE = 2.2;
const VEHICLE_NAMES = { taxi: 'taxi', golf: 'Citi Golf', bakkie: 'bakkie', police: 'police car', scooter: 'Sixty60 bike', superbike: 'Ducati', sports: 'Ranger Raptor' };
const JACKED_LINES = ['Haai! Jou ma se...!', "Voetsek! That's my car!", 'Eish! Not again!', 'Hey bru! Bring it back!', 'Ag no man, I just washed it!'];
const HIT_LINES = ['Eish!', 'Watch where you drive, bru!', 'Aikona!', 'Jirre!'];

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.3, 30000);
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// A soft unshadowed light that follows the player at night so you can always see who's around you.
const playerFill = new THREE.PointLight('#ffe6c0', 0, 18, 1);
scene.add(playerFill);

const titleEl = document.getElementById('title');
const startEl = document.getElementById('start');

// First patch of pavement near (x, z) that's off the road and clear of buildings and walls.
function openSpotNear(boxes, roads, x, z) {
  const grid = new ColliderGrid(boxes);
  for (let r = 6; r < 30; r += 1.5) {
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
      const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      const clear = [[0, 0], [2, 0], [-2, 0], [0, 2], [0, -2]].every(([dx, dz]) => !grid.boxesAt(px + dx, pz + dz).length);
      if (clear && roads.clearance(px, pz) > 2.5) return { x: px, z: pz };
    }
  }
  return { x, z };
}

function build() {
  const sky = createSky(scene);
  scene.add(createTerrain());
  const city = createCity(scene);
  const suburbs = createSuburbs(scene, city.colliders);
  const roads = buildRoadIndex(ROADS);
  createJunctions(scene, roads);
  const landmarks = createLandmarks(scene, city.colliders, { isSuburb: suburbs.isSuburb, roads, parks: city.blocks.filter((b) => b.park) });
  const streetlights = createStreetlights(scene, city.colliders, roads);
  const traffic = createTraffic(scene, city.colliders, [...cityEdges(), ...routeEdges(), ...suburbs.edges], 90, roads);
  const colliders = new ColliderGrid(city.colliders);
  const taxiModel = playerTaxi();
  scene.add(taxiModel.group);
  const vehicle = new Car(taxiModel, START.x, START.z, START.heading);
  const headlight = new THREE.SpotLight('#fff1d0', 0, 80, 0.55, 0.6, 1);
  headlight.position.set(0, 1.1, 2.5);
  headlight.target.position.set(0, 0, 22);
  const walker = new Walker(scene);
  addPistol(walker.model);
  addArsenal(walker.model);
  walker.onLand = (drop) => damage((drop - 4) * 7);
  const weapons = createWeapons(scene);
  const wrecks = createWrecks(scene);
  const walkRects = [
    ...city.blocks.map((b) => ({ x0: b.x0 + 1.2, x1: b.x1 - 1.2, z0: b.z0 + 1.2, z1: b.z1 - 1.2, sidewalk: true })),
    ...suburbs.walkRects,
  ];
  const peds = createPedestrians(scene, walkRects, 50);
  const pickups = createPickups(scene, walkRects);
  const clinic = placeOnRoad(traffic, HOSPITAL.x, HOSPITAL.z);
  const spot = openSpotNear(city.colliders, roads, clinic.x, clinic.z);
  const hospital = createHospitalMarker(scene, spot.x, spot.z);
  const police = createPolice(scene, traffic);
  const showroomZ = toWorld(-180) - 2.6;
  const parked = [['sports', 13], ['scooter', 21], ['superbike', 26]].map(([type, dx]) => {
    const model = makeVehicle(type, Math.random, { rider: false });
    scene.add(model.group);
    return new Car(model, toWorld(-180) + dx, showroomZ, Math.PI / 2);
  });
  return { sky, city, suburbs, landmarks, streetlights, colliders, vehicle, traffic, headlight, roads, walker, peds, police, parked, weapons, pickups, hospital, wrecks };
}

let world;
const hud = createHud();
const chase = new ChaseCamera(camera, canvas);
const state = {
  cash: 350,
  minutes: START_CLOCK,
  timeScale: 1,
  boost: 1,
  windOn: false,
  frozen: false,
  loadshedding: false,
  started: false,
  onFoot: false,
  health: 100,
  sinceHurt: 99,
  hospitalT: 0,
  overlay: null,
};

const controlled = () => (state.onFoot ? world.walker : world.vehicle);

function attachHeadlight(car) {
  const { headlight } = world;
  headlight.parent?.remove(headlight);
  headlight.target.parent?.remove(headlight.target);
  if (car) car.model.group.add(headlight, headlight.target);
}

function applyLighting() {
  const { sky, city, suburbs } = world;
  const glow = state.loadshedding ? 0 : sky.state.windows;
  city.setWindowGlow(glow);
  suburbs.setWindowGlow(glow);
  world.streetlights.setLevel(state.loadshedding ? 0 : sky.state.lights);
  world.headlight.intensity = state.onFoot ? 0 : sky.state.lights * 90;
  renderer.toneMappingExposure = 1.2 + sky.state.night * 0.35;
  playerFill.intensity = sky.state.night * (state.loadshedding ? 6 : 10);
}

function applyCheat(cheat) {
  audio.jingle();
  hud.notify(`Cheat activated: ${cheat.label}`);
  const { sky, landmarks, traffic, police } = world;
  switch (cheat.code) {
    case 'LOADSHEDDING':
      state.loadshedding = !state.loadshedding;
      if (state.loadshedding && sky.state.night < 0.5) state.minutes = Math.floor(state.minutes / 1440) * 1440 + 21 * 60;
      if (state.loadshedding) hud.say('Stage 6. The robots are out, drive safe.', 4);
      break;
    case 'SOUTHEASTER':
      state.windOn = !state.windOn;
      landmarks.tablecloth.set(state.windOn);
      audio.setWind(state.windOn ? 1 : 0);
      if (state.windOn) hud.say("The Cape Doctor is in. Tablecloth's on the mountain.", 4);
      break;
    case 'NOWNOW':
      state.timeScale = state.timeScale === 1 ? 0.35 : 1;
      break;
    case 'JUSTNOW':
      state.frozen = !state.frozen;
      traffic.setFrozen(state.frozen);
      break;
    case 'SIXTYMINUTES':
      state.boost = state.boost === 1 ? 1.9 : 1;
      break;
    case 'SUNDOWNER': {
      const day = Math.floor(state.minutes / 1440) * 1440;
      const now = state.minutes - day;
      const next = SUNDOWNER_STOPS.find((m) => m > now + 1);
      state.minutes = next === undefined ? day + 1440 + SUNDOWNER_STOPS[0] : day + next;
      break;
    }
    case 'LEKKER':
      state.cash += 250000;
      break;
    case 'BRIBE':
      police.clear();
      state.cash = Math.max(0, state.cash - 200);
      break;
    case 'VETKOEK':
      state.health = 100;
      break;
    case 'TROUBLE':
      police.addHeat(90);
      break;
    case 'TSOTSI':
      world.weapons.refill();
      world.weapons.select('smg');
      break;
  }
  applyLighting();
}

const cheatPrompt = createCheatPrompt({
  onCheat: applyCheat,
  onMiss: () => hud.notify('Haibo. That is not a cheat.', 2),
  onToggle: releaseAll,
});

function crime(heat, x, z, witnessRange = 60) {
  world.police.addHeat(world.police.nearCop(x, z, witnessRange) ? heat * 2 : heat);
}

function say(line) {
  hud.say(`"${line}"`, 2.5);
  audio.speak(line, 1.1);
}

// Everything you can climb into from the pavement, closest first.
function nearestEnterable() {
  const { walker, traffic, police, parked } = world;
  const candidates = [
    ...parked.map((car) => ({ kind: 'parked', car })),
    ...traffic.cars.map((ai) => ({ kind: 'traffic', ai, car: ai })),
    ...police.chasers.map((c) => ({ kind: 'cop', chaser: c, car: c.car })),
  ];
  let best = null, bestD = Infinity;
  for (const c of candidates) {
    if (c.car.wreck) continue;
    for (const circle of vehicleCircles(c.car)) {
      const d = Math.hypot(circle.x - walker.pos.x, circle.z - walker.pos.z) - circle.r;
      if (d < bestD) { bestD = d; best = c; }
    }
  }
  return bestD < ENTER_RANGE ? best : null;
}

function enterVehicle(target) {
  const { traffic, police, parked, peds, walker } = world;
  let car;
  if (target.kind === 'traffic') {
    const ai = target.ai;
    traffic.removeCar(ai);
    car = new Car(ai.model, ai.pos.x, ai.pos.z, ai.heading);
    const lx = Math.cos(ai.heading), lz = -Math.sin(ai.heading);
    peds.eject(ai.pos.x + lx * 2, ai.pos.z + lz * 2, ai.heading + Math.PI / 2);
    say(JACKED_LINES[Math.floor(Math.random() * JACKED_LINES.length)]);
    crime(12, walker.pos.x, walker.pos.z, 45);
  } else if (target.kind === 'cop') {
    target.chaser.alive = false;
    police.chasers.splice(police.chasers.indexOf(target.chaser), 1);
    car = target.car;
  } else {
    car = target.car;
    parked.splice(parked.indexOf(car), 1);
  }
  if (car.model.type === 'police') {
    police.raiseTo(3);
    hud.say('You stole a police car. They will not let that go.', 3);
  }
  if (car.model.rider) {
    car.model.group.remove(car.model.rider.group);
    car.model.rider = null;
  }
  world.vehicle = car;
  state.onFoot = false;
  walker.setActive(false);
  if (car.spec.bike) {
    seatRider(car.model, walker.model);
    walker.model.group.visible = true;
  }
  attachHeadlight(car);
  hud.notify(`You're in the ${VEHICLE_NAMES[car.model.type] || 'car'}`, 1.5);
}

function parkVehicle(car) {
  const { parked } = world;
  parked.push(car);
  while (parked.length > MAX_PARKED) {
    const old = parked.shift();
    scene.remove(old.model.group);
  }
}

function dismount(vehicle) {
  const { walker } = world;
  if (!vehicle.spec.bike || walker.model.group.parent !== vehicle.model.group) return;
  scene.add(walker.model.group);
  walker.model.group.rotation.set(0, 0, 0);
  clearPose(walker.model);
}

const BAIL_SPEED = 5;

function exitVehicle({ dead = false } = {}) {
  const { vehicle, walker } = world;
  const speed = vehicle.vel.length();
  const lx = Math.cos(vehicle.heading), lz = -Math.sin(vehicle.heading);
  const side = vehicle.spec.width / 2 + 0.7;
  dismount(vehicle);
  walker.place(vehicle.pos.x + lx * side, vehicle.pos.z + lz * side, vehicle.heading);
  walker.setActive(true);
  vehicle.steer = 0;
  parkVehicle(vehicle);
  world.vehicle = null;
  state.onFoot = true;
  attachHeadlight(null);
  if (dead) {
    walker.die(new THREE.Vector2(lx, lz));
    return;
  }
  if (speed > BAIL_SPEED) {
    const dir = new THREE.Vector2(vehicle.vel.x + lx * 2, vehicle.vel.y + lz * 2).normalize();
    walker.bail(dir, speed);
    audio.crash(speed * 0.6);
    if (speed > 14) damage((speed - 14) * 1.2);
  } else walker.vel.set(lx * 2.5, lz * 2.5);
}

function respawnAt(spot, kind) {
  const { police, walker, weapons } = world;
  police.clear();
  if (kind === 'busted') {
    weapons.disarm();
  }
  if (world.vehicle) {
    dismount(world.vehicle);
    parkVehicle(world.vehicle);
    world.vehicle = null;
  }
  const p = placeOnRoad(world.traffic, spot.x, spot.z);
  walker.place(p.x + 9, p.z + 9, p.heading);
  walker.setActive(true);
  state.onFoot = true;
  state.health = 100;
  attachHeadlight(null);
  chase.update(0, walker, true);
  world.peds.seedNear(walker.pos.x, walker.pos.z);
  const fee = kind === 'wasted' ? 1000 : 500;
  state.cash = Math.max(0, state.cash - fee);
  hud.notify(`${spot.name}. That cost you R${fee}.`, 3.5);
}

function showOverlay(kind) {
  if (state.overlay) return;
  state.overlay = { kind, timer: 3.2 };
  if (kind === 'wasted') {
    if (state.onFoot) world.walker.die();
    else exitVehicle({ dead: true });
  }
  hud.bigText(kind === 'wasted' ? 'WASTED' : 'BUSTED', kind === 'wasted' ? '#c0392b' : '#4a7bd9');
  audio.crash(20);
}

function unstick() {
  const { vehicle, traffic } = world;
  const p = placeOnRoad(traffic, vehicle.pos.x, vehicle.pos.z);
  vehicle.pos.set(p.x, p.y, p.z);
  vehicle.heading = p.heading;
  vehicle.vel.set(0, 0);
  chase.update(0, vehicle, true);
  hud.notify('Back on the road, bru', 1.5);
}

const wind = new THREE.Vector2();
let streetTimer = 0, road = '', windT = 0, ramCooldown = 0;
const redRunCooldown = new Map();

const HOSPITAL_FEE = 200, REGEN_TO = 50, REGEN_AFTER = 8;

function damage(amount) {
  state.sinceHurt = 0;
  state.health -= amount;
  if (state.health <= 0) {
    state.health = 0;
    showOverlay('wasted');
  }
}

function checkRedLights(car) {
  const { traffic, police } = world;
  if (Math.abs(car.speed) < 5) return;
  const axis = Math.abs(Math.sin(car.heading)) > Math.abs(Math.cos(car.heading)) ? 'ew' : 'ns';
  for (const n of traffic.nodes) {
    if (!n.signal || Math.abs(n.x - car.pos.x) > 6 || Math.abs(n.z - car.pos.z) > 6) continue;
    if ((redRunCooldown.get(n) || 0) > state.minutes) continue;
    redRunCooldown.set(n, state.minutes + 1);
    if (traffic.signal(n, axis) === 'red' && police.nearCop(car.pos.x, car.pos.z, 60)) {
      police.addHeat(25);
      hud.notify('Skipped a red robot in front of the cops', 2);
    }
  }
}

function hitByTraffic(walker, vehicles) {
  if (walker.down > 0) return;
  for (const v of vehicles) {
    const s = Math.abs(v.speed);
    if (s < 3 || Math.abs(v.pos.x - walker.pos.x) > 6 || Math.abs(v.pos.z - walker.pos.z) > 6) continue;
    if (walker.pos.y > v.pos.y + 1.2 || walker.riding === v) continue;
    for (const c of vehicleCircles(v)) {
      if (Math.hypot(c.x - walker.pos.x, c.z - walker.pos.z) < c.r + walker.spec.radius + 0.1) {
        walker.hit(new THREE.Vector2(Math.sin(v.heading), Math.cos(v.heading)), s * 0.6);
        damage(s * 3.5);
        audio.crash(s);
        return;
      }
    }
  }
}

const FOOT_CAMERA = { dist: 5.5, height: 2.4, look: 1.4, free: true };
const AIM_CAMERA = { dist: 3.4, height: 2.15, look: 1.85, side: 0.85, free: true, aim: true };
const PUNCH_ASSIST = { range: 2.6, cone: Math.cos(THREE.MathUtils.degToRad(65)) };

function ramPolice() {
  if (ramCooldown > 0) return;
  ramCooldown = 1;
  const first = world.police.state.stars < 3;
  world.police.raiseTo(3);
  if (first) hud.say('You rammed the cops. Now they are properly angry.', 3);
}

function hurtCop(o, amount, dir, how, knock = false) {
  const { police } = world;
  const first = police.state.stars < 5;
  if (!police.officers.damage(o, amount, dir, { knock })) return;
  police.raiseTo(5);
  if (first) hud.say(how === 'car' ? 'You ran over a cop. Every unit in the Cape is coming.' : 'You attacked a cop. Every unit in the Cape is coming.', 3);
}

// Bullets, fists and bumpers can all find these.
function combatTargets() {
  const { peds, police } = world;
  const list = [];
  for (const p of peds.peds) {
    if (p.state !== 'dead' && p.model.group.visible) list.push({ pos: p.pos, height: p.state === 'down' ? 0.5 : 1.8, radius: 0.45, kind: 'ped', ref: p });
  }
  for (const o of police.officers.list) {
    if (o.hp > 0) list.push({ pos: o.pos, height: o.state === 'down' ? 0.5 : 1.8, radius: 0.45, kind: 'cop', ref: o });
  }
  // Cars stop bullets too: one short cylinder per body section.
  const me = world.walker.pos;
  const cars = [...world.traffic.cars.map((v) => [v, 'car']), ...police.chasers.map((c) => [c.car, 'copcar'])];
  for (const [v, kind] of cars) {
    if (v.spec.bike || Math.abs(v.pos.x - me.x) > 70 || Math.abs(v.pos.z - me.z) > 70) continue;
    const height = roofHeight(v);
    for (const c of vehicleCircles(v)) list.push({ pos: { x: c.x, y: v.pos.y, z: c.z }, height, radius: c.r, kind, ref: v });
  }
  return list;
}

// A shot driver either floors it out of there or comes straight at you; cop cars just bring the heat.
function shootCar(v, kind) {
  const { police, walker } = world;
  hurtVehicle(v, 9);
  if (v.wreck) return;
  if (kind === 'copcar' || v.model.type === 'police') {
    police.raiseTo(3);
    if (kind === 'car') v.provoke('ram', 8);
    return;
  }
  crime(15, walker.pos.x, walker.pos.z, 50);
  if (!v.panic) v.provoke(Math.random() < 0.35 ? 'ram' : 'flee', 8 + Math.random() * 6);
}

function attack(current) {
  const { walker, weapons, peds, police, colliders } = world;
  const def = WEAPONS[current];
  if (def.type === 'throw') {
    if (wasPressed('Mouse2')) for (const c of weapons.detonate()) c4Blast(c.pos, c.car);
    if (!wasPressed('Mouse0')) return;
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    walker.heading = chase.viewYaw;
    const from = new THREE.Vector3(walker.pos.x + Math.sin(walker.heading) * 0.5, walker.pos.y + 1.6, walker.pos.z + Math.cos(walker.heading) * 0.5);
    if (weapons.throwC4(from, dir)) weapons.state.strike = { kind: 'cross', k: 0 };
    return;
  }
  const gun = def.type === 'gun';
  const trigger = gun ? isDown('Mouse0') : wasPressed('Mouse0');
  if (!trigger) return;
  const targets = combatTargets();
  if (gun) {
    walker.heading = chase.viewYaw;
    const muzzle = current === 'smg' ? walker.model.smgMuzzle : walker.model.muzzle;
    const shot = weapons.shoot({ camera, shooter: walker.pos, muzzle, targets, colliders });
    if (!shot) return;
    audio.gunshot(current === 'smg' ? 0.7 : 1);
    peds.scare(walker.pos.x, walker.pos.z, 35);
    world.traffic.scare(walker.pos.x, walker.pos.z, 25);
    if (police.nearCop(walker.pos.x, walker.pos.z, 50)) police.raiseTo(2);
    else police.addHeat(current === 'smg' ? 3 : 8);
    landHit(shot.target, shot.damage, shot.dir, 'shot');
  } else {
    const people = targets.filter((t) => t.kind === 'ped' || t.kind === 'cop');
    assistPunch(people);
    const hit = weapons.melee({ pos: walker.pos, heading: walker.heading, targets: people });
    if (hit?.target) {
      audio.punch();
      landHit(hit.target, hit.damage, hit.dir, 'punch', hit.knock);
    }
  }
}

// Mild punch assist: turn to face whoever is close in front, and step in if they're just out of reach.
function assistPunch(targets) {
  const { walker } = world;
  const facing = chase.viewYaw;
  const fx = Math.sin(facing), fz = Math.cos(facing);
  let best = null, bestD = PUNCH_ASSIST.range;
  for (const tg of targets) {
    const dx = tg.pos.x - walker.pos.x, dz = tg.pos.z - walker.pos.z, d = Math.hypot(dx, dz);
    if (d > bestD || Math.abs(tg.pos.y - walker.pos.y) > 1 || (dx * fx + dz * fz) / (d || 1) < PUNCH_ASSIST.cone) continue;
    best = tg;
    bestD = d;
  }
  if (!best) return;
  const dx = best.pos.x - walker.pos.x, dz = best.pos.z - walker.pos.z;
  walker.heading = Math.atan2(dx, dz);
  if (bestD > 1.2) walker.vel.set((dx / bestD) * 5, (dz / bestD) * 5);
}

function landHit(target, amount, dir, how, knock = false) {
  if (!target) return;
  const { peds, walker } = world;
  if (target.kind === 'car' || target.kind === 'copcar') shootCar(target.ref, target.kind);
  else if (target.kind === 'cop') hurtCop(target.ref, amount, dir, how, knock);
  else {
    const killed = peds.hurt(target.ref, amount, dir, { knock });
    crime(killed ? 60 : how === 'shot' ? 30 : 6, walker.pos.x, walker.pos.z, 50);
    if (!killed && how === 'punch' && Math.random() < 0.3) say(HIT_LINES[Math.floor(Math.random() * HIT_LINES.length)]);
  }
}

// A pedestrian who's fighting back lands a punch or takes a shot at the player.
function pedAttack(p, kind) {
  const { walker, weapons } = world;
  if (!state.onFoot) return;
  if (kind === 'punch') {
    audio.punch();
    damage(4);
    const dx = walker.pos.x - p.pos.x, dz = walker.pos.z - p.pos.z, d = Math.hypot(dx, dz) || 1;
    walker.vel.add(new THREE.Vector2((dx / d) * 2, (dz / d) * 2));
    return;
  }
  p.model.muzzle.updateWorldMatrix(true, false);
  const from = new THREE.Vector3().setFromMatrixPosition(p.model.muzzle.matrixWorld);
  const hit = Math.random() < 0.35;
  const to = new THREE.Vector3(walker.pos.x, walker.pos.y + 1.2, walker.pos.z);
  if (!hit) to.add(new THREE.Vector3((Math.random() - 0.5) * 3, Math.random() * 1.5, (Math.random() - 0.5) * 3));
  weapons.tracer(from, to);
  audio.gunshot(Math.max(0.15, 1 - from.distanceTo(to) / 40));
  if (hit) damage(5);
}

function runOverCops(vehicle) {
  const s = Math.abs(vehicle.speed);
  if (s < 3) return;
  for (const o of world.police.officers.list) {
    if (o.hp <= 0 || Math.abs(o.pos.x - vehicle.pos.x) > 5 || Math.abs(o.pos.z - vehicle.pos.z) > 5) continue;
    for (const c of vehicleCircles(vehicle)) {
      if (Math.hypot(c.x - o.pos.x, c.z - o.pos.z) < c.r + 0.35) {
        hurtCop(o, s > 8 ? 100 : 40, new THREE.Vector2(Math.sin(vehicle.heading), Math.cos(vehicle.heading)), 'car');
        audio.crash(s * 0.6);
        break;
      }
    }
  }
}

const shotAim = new THREE.Vector3();
function copShot(from, hit) {
  const me = controlled();
  shotAim.set(me.pos.x, me.pos.y + (state.onFoot ? 1.2 : 1), me.pos.z);
  if (!hit) shotAim.add(new THREE.Vector3((Math.random() - 0.5) * 3, Math.random() * 1.5, (Math.random() - 0.5) * 3));
  world.weapons.tracer(from, shotAim);
  audio.gunshot(Math.max(0.15, 1 - from.distanceTo(shotAim) / 40));
  if (hit) {
    damage(state.onFoot ? 6 : 2);
    if (!state.onFoot) hurtVehicle(world.vehicle, 5);
  }
}

// Vetkoek pickups, slow regen up to half health, and the hospital marker for a full patch-up.
function heal(dt, me) {
  const { pickups, hospital } = world;
  hospital.update(dt);
  if (state.overlay) return;
  const got = pickups.update(dt, me.pos, !state.onFoot, state.health);
  if (got) {
    state.health = Math.min(100, state.health + got);
    audio.punch();
    hud.notify(`Vetkoek! +${got} health`, 1.5);
  }
  state.sinceHurt += dt;
  if (state.sinceHurt > REGEN_AFTER && state.health < REGEN_TO) state.health = Math.min(REGEN_TO, state.health + dt * 3);
  state.hospitalT -= dt;
  if (state.hospitalT <= 0 && state.health < 100 && hospital.contains(me.pos.x, me.pos.z)) {
    state.hospitalT = 4;
    if (state.cash >= HOSPITAL_FEE) {
      state.cash -= HOSPITAL_FEE;
      state.health = 100;
      audio.jingle();
      hud.notify(`Groote Schuur patched you up. R${HOSPITAL_FEE}.`, 3);
    } else hud.notify(`You need R${HOSPITAL_FEE} for the hospital, bru.`, 3);
  }
}

// Knock health off a vehicle; at zero it catches fire, and a car with a driver in it loses them.
function hurtVehicle(v, amount) {
  if (!v || !world.wrecks.damage(v, amount)) return;
  if (v === world.vehicle) {
    hud.say('Your ride is on fire! Get out!', 3);
    return;
  }
  if (world.traffic.cars.includes(v)) {
    const lx = Math.cos(v.heading), lz = -Math.sin(v.heading);
    world.peds.eject(v.pos.x + lx * 2.2, v.pos.z + lz * 2.2, v.heading + Math.PI / 2);
  }
}

// A burning wreck going up: everyone close by gets hurt, and nearby vehicles take a beating too.
function blast(v, radius) {
  if (v === world.vehicle) {
    audio.crash(30);
    damage(500);
    return;
  }
  explosionDamage(v.pos, radius, v, false);
}

// C4 going off: anything it's stuck to, and any vehicle right next to it, goes up on the spot.
function c4Blast(pos, car) {
  world.wrecks.flash(pos);
  if (car) world.wrecks.explode(car);
  explosionDamage(pos, 8, car, true);
  crime(60, pos.x, pos.z, 60);
}

function explosionDamage(at, radius, source, instant) {
  const { walker, peds, police, traffic, parked } = world;
  const v = { pos: at };
  audio.crash(30);
  if (state.onFoot) {
    const dx = walker.pos.x - v.pos.x, dz = walker.pos.z - v.pos.z, d = Math.hypot(dx, dz);
    if (d < radius) {
      damage(80 * (1 - d / radius) + 10);
      walker.hit(new THREE.Vector2(dx / (d || 1), dz / (d || 1)), 9);
    }
  }
  for (const p of peds.peds) {
    const dx = p.pos.x - v.pos.x, dz = p.pos.z - v.pos.z, d = Math.hypot(dx, dz);
    if (d < radius && p.state !== 'dead') peds.hurt(p, 120 * (1 - d / radius), new THREE.Vector2(dx / (d || 1), dz / (d || 1)), { knock: true });
  }
  for (const o of police.officers.list) {
    const dx = o.pos.x - v.pos.x, dz = o.pos.z - v.pos.z, d = Math.hypot(dx, dz);
    if (d >= radius) continue;
    const dir = new THREE.Vector2(dx / (d || 1), dz / (d || 1));
    if (instant) hurtCop(o, 120 * (1 - d / radius), dir, 'shot', true);
    else police.officers.damage(o, 120 * (1 - d / radius), dir, { knock: true });
  }
  const others = [...traffic.cars, ...parked, ...police.chasers.map((c) => c.car), ...(world.vehicle ? [world.vehicle] : [])];
  for (const o of others) {
    if (o === source) continue;
    const d = Math.hypot(o.pos.x - v.pos.x, o.pos.z - v.pos.z);
    if (instant && d < radius * 0.6) world.wrecks.explode(o);
    else if (d < radius) hurtVehicle(o, 70 * (1 - d / radius));
  }
}

// Burnt-out traffic is towed away once you've left it well behind.
function clearWrecks(dt, me) {
  const { traffic } = world;
  for (const c of [...traffic.cars]) {
    if (c.wreck?.state !== 'burnt') continue;
    c.wreck.idle = (c.wreck.idle || 0) + dt;
    if (c.wreck.idle > 30 && Math.hypot(c.pos.x - me.pos.x, c.pos.z - me.pos.z) > 90) {
      traffic.removeCar(c);
      scene.remove(c.model.group);
    }
  }
}

// Hold Q for the weapon wheel (time slows, the mouse picks a slot, release equips); a quick tap just cycles.
const picker = { held: 0, open: false, x: 0, y: 0, sel: 0 };

function wheelSlots() {
  const { weapons } = world;
  return WEAPON_ORDER.map((w) => {
    const ammo = w === 'c4' ? weapons.state.ammo.c4 + (weapons.charges.length ? ` (${weapons.charges.length} set)` : '') : weapons.state.ammo[w] ?? null;
    return { label: WEAPONS[w].label, ammo, empty: !weapons.has(w) };
  });
}

function closePicker() {
  picker.open = false;
  chase.lockLook = false;
  hud.wheel(null);
}

function updatePicker(dt) {
  const { weapons } = world;
  if (isDown('KeyQ')) {
    picker.held += dt;
    if (!picker.open && picker.held > 0.18) {
      picker.open = true;
      chase.lockLook = true;
      picker.x = picker.y = 0;
      picker.sel = WEAPON_ORDER.indexOf(weapons.state.current);
      takeMouse();
    }
  } else if (picker.held > 0) {
    if (picker.open) {
      weapons.select(WEAPON_ORDER[picker.sel]);
      closePicker();
    } else weapons.cycle();
    picker.held = 0;
  }
  if (!picker.open) return;
  const m = takeMouse();
  picker.x += m.x;
  picker.y += m.y;
  const len = Math.hypot(picker.x, picker.y);
  if (len > 90) {
    picker.x *= 90 / len;
    picker.y *= 90 / len;
  }
  if (len > 20) {
    const a = Math.atan2(picker.y, picker.x) + Math.PI / 2;
    const n = WEAPON_ORDER.length;
    picker.sel = ((Math.round((a / (Math.PI * 2)) * n) % n) + n) % n;
  }
  hud.wheel(wheelSlots(), picker.sel);
}

const camRay = new THREE.Vector3();
function keepCameraOutOfWalls(focus, colliders) {
  const from = camRay.set(focus.pos.x, focus.pos.y + 1.6, focus.pos.z);
  const to = camera.position;
  const len = from.distanceTo(to);
  for (let d = 0.6; d < len; d += 0.4) {
    const k = d / len;
    const x = from.x + (to.x - from.x) * k, z = from.z + (to.z - from.z) * k, y = from.y + (to.y - from.y) * k;
    if (colliders.contains(x, z, y)) {
      const back = Math.max(0.3, d - 0.5) / len;
      camera.position.lerpVectors(from, to, back);
      return;
    }
  }
}

function tick(dt) {
  const { traffic, sky, landmarks, colliders, walker, peds, police, parked } = world;
  const active = state.started && !cheatPrompt.open && !state.overlay;
  const input = active ? readDriving() : { throttle: false, brake: false, steer: 0, handbrake: false };

  if (active) {
    if (wasPressed('Backquote') || wasPressed('Slash')) cheatPrompt.toggle();
    if (wasPressed('KeyC')) chase.cycle();
    if (wasPressed('KeyM')) hud.notify(audio.toggleMute() ? 'Sound off' : 'Sound on', 1.5);
    if (state.onFoot) {
      if (wasPressed('KeyF')) {
        const target = nearestEnterable();
        if (target) enterVehicle(target);
      }
      if (wasPressed('WheelUp')) world.weapons.cycle(-1);
      if (wasPressed('WheelDown')) world.weapons.cycle(1);
      updatePicker(dt);
    } else {
      if (wasPressed('KeyH')) audio.hoot();
      if (wasPressed('KeyG') && world.vehicle.model.type === 'taxi') {
        const line = audio.gaartjie();
        if (line) hud.say(`"${line}"`);
      }
      if (wasPressed('KeyR')) unstick();
      if (wasPressed('KeyF')) exitVehicle();
    }
  }

  if (picker.open && (!active || !state.onFoot)) closePicker();
  const sdt = dt * state.timeScale * (picker.open ? 0.3 : 1);
  windT += sdt;
  if (state.windOn) {
    const gust = 3.5 + Math.sin(windT * 0.7) * 2 + Math.sin(windT * 2.3) * 1.2;
    wind.set(-0.7, -0.7).multiplyScalar(gust);
  } else wind.set(0, 0);

  const onImpact = (s, other) => {
    audio.crash(s);
    if (!state.onFoot && s > 11) damage((s - 11) * 1.4);
    if (vehicle) hurtVehicle(vehicle, (s - 3) * 4);
    if (other) hurtVehicle(other, (s - 3) * 3);
    if (other?.model?.type === 'police') ramPolice();
  };
  const vehicle = world.vehicle;
  const env = { colliders, boost: state.boost, wind: state.windOn ? wind : null, onImpact };
  if (vehicle) {
    vehicle.update(sdt, input, env);
    for (const p of parked) {
      const hit = collideCars(vehicle, p);
      if (hit > 3) onImpact(hit, p);
    }
    checkRedLights(vehicle);
  }
  for (const p of parked) p.update(sdt, { throttle: false, brake: false, steer: 0, handbrake: Math.abs(p.speed) < 1.5 }, { colliders });

  const cops = police.chasers.map((c) => c.car);
  const { weapons } = world;
  weapons.update(sdt, { vehicles: [...traffic.cars, ...cops, ...parked, ...(vehicle ? [vehicle] : [])], colliders });
  const current = weapons.state.current;
  const kind = WEAPONS[current].type;
  const armed = state.onFoot && kind === 'gun';
  const aiming = state.onFoot && active && !picker.open && ((armed && (isDown('Mouse2') || weapons.state.aimT > 0)) || kind === 'throw');
  for (const [w, mesh] of Object.entries(walker.model.held)) mesh.visible = state.onFoot && w === current && (w !== 'c4' || weapons.state.ammo.c4 > 0);
  walker.cameraProfile = aiming ? AIM_CAMERA : FOOT_CAMERA;
  if (state.onFoot) {
    walker.update(sdt, input, chase.viewYaw, { colliders, vehicles: [...traffic.cars, ...cops, ...parked], jump: active && wasPressed('Space'), aiming });
    hitByTraffic(walker, [...traffic.cars, ...cops]);
    if (active && !picker.open && !walker.busy && !walker.airborne) attack(current);
    walker.arms = !walker.busy && aiming && armed ? { mode: 'aim', pitch: chase.aimPitch }
      : weapons.state.strike ? { mode: weapons.state.strike.kind, k: weapons.state.strike.k }
        : current === 'bat' && !walker.busy && !walker.airborne ? { mode: 'batReady' } : null;
  } else if (vehicle) runOverCops(vehicle);
  traffic.update(sdt, vehicle, onImpact, { signalsOff: state.loadshedding, lights: sky.state.lights, walker: state.onFoot && !walker.dead ? walker : null, grid: colliders });

  const me = controlled();
  peds.update(sdt, me.pos, [...(vehicle ? [vehicle] : []), ...traffic.cars, ...cops, ...parked], vehicle, (p, v, s) => {
    if (v !== vehicle) return;
    crime(28, p.pos.x, p.pos.z);
    if (Math.random() < 0.5) say(HIT_LINES[Math.floor(Math.random() * HIT_LINES.length)]);
    audio.crash(s * 0.6);
  }, { pos: walker.pos, onFoot: state.onFoot && !state.overlay, onAttack: pedAttack }, colliders);

  ramCooldown -= sdt;
  const fx = Math.sin(me.heading), fz = Math.cos(me.heading);
  const result = police.update(sdt, {
    target: { x: me.pos.x, y: me.pos.y, z: me.pos.z, vx: state.onFoot ? walker.vel.x : vehicle.vel.x, vz: state.onFoot ? walker.vel.y : vehicle.vel.y, speed: Math.abs(me.speed), fx, fz },
    viewYaw: chase.viewYaw,
    colliders,
    playerVehicle: vehicle,
    onFoot: state.onFoot,
    vehicles: [...traffic.cars, ...cops, ...parked, ...(vehicle ? [vehicle] : [])],
    onRam: (s, copCar) => {
      onImpact(s, copCar);
      ramPolice();
    },
    onShoot: copShot,
  });
  if (result.busted) showOverlay('busted');
  audio.setSiren(result.closest < 150 ? 1 - result.closest / 150 : 0);

  if (state.overlay) {
    state.overlay.timer -= dt;
    if (state.overlay.timer <= 0) {
      const kind = state.overlay.kind;
      state.overlay = null;
      hud.bigText(null);
      respawnAt(kind === 'wasted' ? HOSPITAL : STATION, kind);
    }
  }

  heal(sdt, me);
  world.wrecks.update(sdt, blast);
  clearWrecks(sdt, me);
  world.streetlights.update(dt, me.pos);
  playerFill.position.set(me.pos.x, me.pos.y + 3.5, me.pos.z);
  landmarks.update(sdt);
  chase.update(dt, controlled());
  keepCameraOutOfWalls(controlled(), colliders);
  state.minutes += sdt;
  sky.setTime(state.minutes);
  applyLighting();
  const focus = controlled();
  sky.follow(focus.pos);
  audio.updateEngine(vehicle ? vehicle.speed : 0, input.throttle, !!vehicle, vehicle ? vehicle.spec.maxSpeed * 2.9 : 160);
  const area = districtAt(focus.pos.x, focus.pos.z, focus.pos.y);
  streetTimer -= dt;
  if (streetTimer <= 0) {
    streetTimer = 0.25;
    road = streetAt(focus.pos.x, focus.pos.z);
  }
  hud.update(dt, { cash: state.cash, minutes: state.minutes, kmh: vehicle ? Math.abs(vehicle.speed) * 3.6 : null, area, road });
  hud.status({ health: state.health, stars: police.state.stars, seen: police.state.seen, car: vehicle ? vehicleHp(vehicle) / vehicleMaxHp(vehicle) : null });
  const ammo = weapons.state.ammo[current];
  hud.weapon(state.onFoot ? `${WEAPONS[current].label}${ammo !== undefined ? ` ${ammo}` : ''}` : '', aiming);
  let promptText = null;
  if (state.onFoot && active) {
    const t = nearestEnterable();
    if (t) promptText = `F - ${t.kind === 'parked' ? 'get in' : 'jack'} the ${VEHICLE_NAMES[t.car.model.type] || 'car'}`;
  }
  hud.prompt(promptText);
  hud.drawRadar(focus, traffic.cars, cops);
  endFrame();
}

let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  tick(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}

function start() {
  if (state.started || !world) return;
  state.started = true;
  titleEl.classList.add('hidden');
  chase.enabled = true;
  lockPointer(canvas);
  audio.initAudio();
}

loadVehicleModels().then(() => {
  world = build();
  attachHeadlight(world.vehicle);
  world.sky.setTime(state.minutes);
  world.sky.follow(world.vehicle.pos);
  world.peds.seedNear(START.x, START.z);
  applyLighting();
  chase.update(0, world.vehicle, true);
  startEl.textContent = 'Press Enter or click to start';
  window.addEventListener('keydown', (e) => { if (e.code === 'Enter') start(); });
  titleEl.addEventListener('click', start);
  window.__tabletown = { world, state, camera, renderer, scene, applyCheat, tick, chase };
  requestAnimationFrame(loop);
});
