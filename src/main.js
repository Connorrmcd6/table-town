import * as THREE from 'three';
import { createTerrain } from './world/terrain.js';
import { createSky, TIME_ORDER } from './world/sky.js';
import { createCity } from './world/city.js';
import { createLandmarks } from './world/landmarks.js';
import { districtAt, heightAt } from './world/heightmap.js';
import { ColliderGrid } from './collision.js';
import { playerTaxi } from './vehicles/models.js';
import { Car } from './vehicles/car.js';
import { createTraffic } from './vehicles/traffic.js';
import { ChaseCamera } from './camera.js';
import { readDriving, wasPressed, releaseAll, endFrame } from './input.js';
import { createCheatPrompt } from './cheats.js';
import { createHud } from './hud.js';
import * as audio from './audio.js';

const START = { x: -247.2, z: -330, heading: 0 };
const PRESET_CLOCK = { golden: 17 * 60 + 30, noon: 12 * 60, night: 21 * 60 };

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
  const landmarks = createLandmarks(scene, city.colliders);
  const colliders = new ColliderGrid(city.colliders);
  const taxiModel = playerTaxi();
  scene.add(taxiModel.group);
  const player = new Car(taxiModel, START.x, START.z, START.heading);
  const traffic = createTraffic(scene);
  return { sky, city, landmarks, colliders, player, traffic };
}

let world;
const hud = createHud();
const chase = new ChaseCamera(camera);
const state = {
  cash: 350,
  minutes: PRESET_CLOCK.golden,
  timeScale: 1,
  boost: 1,
  windOn: false,
  frozen: false,
  loadshedding: false,
  started: false,
};

function applyLighting() {
  const { sky, city } = world;
  city.setWindowGlow(state.loadshedding ? 0 : sky.state.windows);
}

function applyCheat(cheat) {
  audio.jingle();
  hud.notify(`Cheat activated: ${cheat.label}`);
  const { sky, landmarks, traffic } = world;
  switch (cheat.code) {
    case 'LOADSHEDDING':
      state.loadshedding = !state.loadshedding;
      sky.apply(state.loadshedding ? 'night' : 'golden');
      state.minutes = PRESET_CLOCK[sky.state.preset];
      if (state.loadshedding) hud.say('Eskom has implemented stage 6. Sorry for the inconvenience.', 4);
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
      const next = TIME_ORDER[(TIME_ORDER.indexOf(sky.state.preset) + 1) % TIME_ORDER.length];
      state.loadshedding = false;
      sky.apply(next);
      state.minutes = PRESET_CLOCK[next];
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
  traffic.update(sdt, player, onImpact);
  landmarks.update(sdt);
  chase.update(dt, player);
  sky.follow(player.pos);

  state.minutes += sdt;
  audio.updateEngine(player.speed, input.throttle);
  const area = districtAt(player.pos.x, player.pos.z, player.pos.y);
  hud.update(dt, { cash: state.cash, minutes: state.minutes, kmh: Math.abs(player.speed) * 3.6, area });
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
  audio.initAudio();
}

setTimeout(() => {
  world = build();
  applyLighting();
  chase.update(0, world.player, true);
  startEl.textContent = 'Press Enter or click to start';
  window.addEventListener('keydown', (e) => { if (e.code === 'Enter') start(); });
  titleEl.addEventListener('click', start);
  window.__tabletown = { world, state, camera, renderer, scene, applyCheat, tick };
  requestAnimationFrame(loop);
}, 50);
