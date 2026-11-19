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
import { clearPose } from './people/person.js';
import { Car } from './vehicles/car.js';
import { loadVehicleModels } from './vehicles/gltfVehicles.js';
import { createTraffic } from './vehicles/traffic.js';
import { cityEdges, routeEdges, createJunctions, ROADS } from './world/city.js';
import { buildRoadIndex } from './world/roadIndex.js';
import { Walker } from './people/walker.js';
import { createPedestrians, vehicleCircles } from './people/pedestrians.js';
import { createPolice, collideCars, placeOnRoad } from './police.js';
import { ChaseCamera, lockPointer } from './camera.js';
import { readDriving, wasPressed, releaseAll, endFrame } from './input.js';
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

const titleEl = document.getElementById('title');
const startEl = document.getElementById('start');

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
  const walkRects = [
    ...city.blocks.map((b) => ({ x0: b.x0 + 1.2, x1: b.x1 - 1.2, z0: b.z0 + 1.2, z1: b.z1 - 1.2, sidewalk: true })),
    ...suburbs.walkRects,
  ];
  const peds = createPedestrians(scene, walkRects, 50);
  const police = createPolice(scene, traffic);
  const showroomZ = toWorld(-180) - 2.6;
  const parked = [['sports', 13], ['scooter', 21], ['superbike', 26]].map(([type, dx]) => {
    const model = makeVehicle(type, Math.random, { rider: false });
    scene.add(model.group);
    return new Car(model, toWorld(-180) + dx, showroomZ, Math.PI / 2);
  });
  return { sky, city, suburbs, landmarks, streetlights, colliders, vehicle, traffic, headlight, roads, walker, peds, police, parked };
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
    crime(ai.model.type === 'police' ? 80 : 12, walker.pos.x, walker.pos.z, 45);
  } else if (target.kind === 'cop') {
    police.chasers.splice(police.chasers.indexOf(target.chaser), 1);
    car = target.car;
    crime(80, walker.pos.x, walker.pos.z);
  } else {
    car = target.car;
    parked.splice(parked.indexOf(car), 1);
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

function exitVehicle() {
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
  if (speed > BAIL_SPEED) {
    const dir = new THREE.Vector2(vehicle.vel.x + lx * 2, vehicle.vel.y + lz * 2).normalize();
    walker.bail(dir, speed);
    audio.crash(speed * 0.6);
    if (speed > 14) damage((speed - 14) * 1.2);
  } else walker.vel.set(lx * 2.5, lz * 2.5);
}

function respawnAt(spot, kind) {
  const { police, walker } = world;
  police.clear();
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

function damage(amount) {
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

const camRay = new THREE.Vector3();
function keepCameraOutOfWalls(focus, colliders) {
  const from = camRay.set(focus.pos.x, focus.pos.y + 1.6, focus.pos.z);
  const to = camera.position;
  const len = from.distanceTo(to);
  for (let d = 0.6; d < len; d += 0.4) {
    const k = d / len;
    const x = from.x + (to.x - from.x) * k, z = from.z + (to.z - from.z) * k;
    if (colliders.contains(x, z)) {
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

  const sdt = dt * state.timeScale;
  windT += sdt;
  if (state.windOn) {
    const gust = 3.5 + Math.sin(windT * 0.7) * 2 + Math.sin(windT * 2.3) * 1.2;
    wind.set(-0.7, -0.7).multiplyScalar(gust);
  } else wind.set(0, 0);

  const onImpact = (s) => {
    audio.crash(s);
    if (!state.onFoot && s > 11) damage((s - 11) * 1.4);
  };
  const vehicle = world.vehicle;
  const env = { colliders, boost: state.boost, wind: state.windOn ? wind : null, onImpact };
  if (vehicle) {
    vehicle.update(sdt, input, env);
    for (const p of parked) collideCars(vehicle, p);
    checkRedLights(vehicle);
  }
  for (const p of parked) p.update(sdt, { throttle: false, brake: false, steer: 0, handbrake: Math.abs(p.speed) < 1.5 }, { colliders });

  const cops = police.chasers.map((c) => c.car);
  if (state.onFoot) {
    walker.update(sdt, input, chase.viewYaw, { colliders, vehicles: [...traffic.cars, ...cops, ...parked], jump: active && wasPressed('Space') });
    hitByTraffic(walker, [...traffic.cars, ...cops]);
  }
  traffic.update(sdt, vehicle, onImpact, { signalsOff: state.loadshedding, lights: sky.state.lights, walker: state.onFoot ? walker : null });

  const me = controlled();
  peds.update(sdt, me.pos, [...(vehicle ? [vehicle] : []), ...traffic.cars, ...cops, ...parked], vehicle, (p, v, s) => {
    if (v !== vehicle) return;
    crime(28, p.pos.x, p.pos.z);
    if (Math.random() < 0.5) say(HIT_LINES[Math.floor(Math.random() * HIT_LINES.length)]);
    audio.crash(s * 0.6);
  });

  ramCooldown -= sdt;
  const fx = Math.sin(me.heading), fz = Math.cos(me.heading);
  const result = police.update(sdt, {
    target: { x: me.pos.x, z: me.pos.z, vx: state.onFoot ? walker.vel.x : vehicle.vel.x, vz: state.onFoot ? walker.vel.y : vehicle.vel.y, speed: Math.abs(me.speed), fx, fz },
    viewYaw: chase.viewYaw,
    colliders,
    playerVehicle: vehicle,
    onFoot: state.onFoot,
    onRam: (s) => {
      onImpact(s);
      if (ramCooldown <= 0) { police.addHeat(15); ramCooldown = 1; }
    },
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
  hud.status({ health: state.health, stars: police.state.stars, seen: police.state.seen });
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
