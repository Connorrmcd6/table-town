import * as THREE from 'three';
import { createTerrain } from './world/terrain.js';
import { createSky } from './world/sky.js';
import { createCity } from './world/city.js';
import { createLandmarks } from './world/landmarks.js';
import { createSuburbs } from './world/suburbs.js';
import { createStreetlights } from './world/streetlights.js';
import { districtAt, heightAt, w as toWorld } from './world/heightmap.js';
import { ColliderGrid } from './collision.js';
import { playerTaxi } from './vehicles/models.js';
import { Car } from './vehicles/car.js';
import { createTraffic } from './vehicles/traffic.js';
import { cityEdges } from './world/city.js';
import { ChaseCamera, lockPointer } from './camera.js';
import { readDriving, wasPressed, releaseAll, endFrame } from './input.js';
import { createCheatPrompt } from './cheats.js';
import { createHud, streetAt } from './hud.js';
import * as audio from './audio.js';

const START = { x: toWorld(-180) + 2.8, z: toWorld(-230), heading: 0 };
const START_CLOCK = 16 * 60 + 30;
const SUNDOWNER_STOPS = [6 * 60 + 15, 12 * 60, 17 * 60 + 30, 21 * 60];

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
  const landmarks = createLandmarks(scene, city.colliders, suburbs.isSuburb);
  const streetlights = createStreetlights(scene, city.colliders);
  const traffic = createTraffic(scene, city.colliders, [...cityEdges(), ...suburbs.edges]);
  const colliders = new ColliderGrid(city.colliders);
  const taxiModel = playerTaxi();
  const headlight = new THREE.SpotLight('#fff1d0', 0, 80, 0.55, 0.6, 1);
  headlight.position.set(0, 1.1, 2.5);
  headlight.target.position.set(0, 0, 22);
  taxiModel.group.add(headlight, headlight.target);
  scene.add(taxiModel.group);
  const player = new Car(taxiModel, START.x, START.z, START.heading);
  return { sky, city, suburbs, landmarks, streetlights, colliders, player, traffic, headlight };
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
};

function applyLighting() {
  const { sky, city, suburbs } = world;
  const glow = state.loadshedding ? 0 : sky.state.windows;
  city.setWindowGlow(glow);
  suburbs.setWindowGlow(glow);
  world.streetlights.setLevel(state.loadshedding ? 0 : sky.state.lights);
  world.headlight.intensity = sky.state.lights * 90;
}

function applyCheat(cheat) {
  audio.jingle();
  hud.notify(`Cheat activated: ${cheat.label}`);
  const { sky, landmarks, traffic } = world;
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
  }
  applyLighting();
}

const cheatPrompt = createCheatPrompt({
  onCheat: applyCheat,
  onMiss: () => hud.notify('Haibo. That is not a cheat.', 2),
  onToggle: releaseAll,
});

const wind = new THREE.Vector2();
let streetTimer = 0, road = '';
let windT = 0;

function respawn() {
  const { player } = world;
  player.pos.set(START.x, heightAt(START.x, START.z), START.z);
  player.heading = START.heading;
  player.vel.set(0, 0);
  chase.update(0, player, true);
  hud.notify('Back in Bo-Kaap, bru');
}

function tick(dt) {
  const { player, traffic, sky, landmarks, colliders } = world;
  const active = state.started && !cheatPrompt.open;
  const input = active ? readDriving() : { throttle: false, brake: false, steer: 0, handbrake: false };

  if (active) {
    if (wasPressed('Backquote') || wasPressed('Slash')) cheatPrompt.toggle();
    if (wasPressed('KeyH')) audio.hoot();
    if (wasPressed('KeyG')) {
      const line = audio.gaartjie();
      if (line) hud.say(`"${line}"`);
    }
    if (wasPressed('KeyC')) chase.cycle();
    if (wasPressed('KeyM')) hud.notify(audio.toggleMute() ? 'Sound off' : 'Sound on', 1.5);
    if (wasPressed('KeyR')) respawn();
  }

  const sdt = dt * state.timeScale;
  windT += sdt;
  if (state.windOn) {
    const gust = 3.5 + Math.sin(windT * 0.7) * 2 + Math.sin(windT * 2.3) * 1.2;
    wind.set(-0.7, -0.7).multiplyScalar(gust);
  } else wind.set(0, 0);

  const onImpact = (s) => audio.crash(s);
  player.update(sdt, input, { colliders, boost: state.boost, wind: state.windOn ? wind : null, onImpact });
  traffic.update(sdt, player, onImpact, { signalsOff: state.loadshedding, lights: world.sky.state.lights });
  landmarks.update(sdt);
  chase.update(dt, player);
  state.minutes += sdt;
  sky.setTime(state.minutes);
  applyLighting();
  sky.follow(player.pos);
  audio.updateEngine(player.speed, input.throttle);
  const area = districtAt(player.pos.x, player.pos.z, player.pos.y);
  streetTimer -= dt;
  if (streetTimer <= 0) {
    streetTimer = 0.25;
    road = streetAt(player.pos.x, player.pos.z);
  }
  hud.update(dt, { cash: state.cash, minutes: state.minutes, kmh: Math.abs(player.speed) * 3.6, area, road });
  hud.drawRadar(player, traffic.cars);
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

setTimeout(() => {
  world = build();
  world.sky.setTime(state.minutes);
  world.sky.follow(world.player.pos);
  applyLighting();
  chase.update(0, world.player, true);
  startEl.textContent = 'Press Enter or click to start';
  window.addEventListener('keydown', (e) => { if (e.code === 'Enter') start(); });
  titleEl.addEventListener('click', start);
  window.__tabletown = { world, state, camera, renderer, scene, applyCheat, tick, chase };
  requestAnimationFrame(loop);
}, 50);
