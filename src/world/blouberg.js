import * as THREE from 'three';
import { heightAt, bloubergZ, w as toWorld } from './heightmap.js';
import { MeshBuilder, FACE } from './geometry.js';
import { addSuburbHouse, footprintHeights } from './houses.js';
import { officeTextures, houseFacadeTexture } from './textures.js';
import { BLOUBERG_ROAD_OFFSET } from './city.js';
import { makePerson, randomLook } from '../people/person.js';

let seed = 6060;
function rand() {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
}
const pick = (a) => a[Math.floor(rand() * a.length)];

const X0 = -450, X1 = 925;
// World z of the shoreline, and of a line `off` raw metres inland from it.
const shoreZ = (x) => toWorld(bloubergZ(x / toWorld(1)));
const inland = (x, off) => shoreZ(x) - toWorld(off);
const ROAD_HALF = 5;

// Holiday flats and beach houses on the landward side of Beach Boulevard, all facing the mountain.
function frontage(flats, walls, roofs, colliders) {
  const tones = ['#f4f1ea', '#ece4d4', '#e8eef0', '#f1e6cf', '#dfe6e0'];
  let x = toWorld(X0);
  while (x < toWorld(X1)) {
    const roadZ = inland(x, BLOUBERG_ROAD_OFFSET);
    if (rand() < 0.35) {
      const w = 18 + rand() * 12, d = 14 + rand() * 8;
      const z1 = roadZ - ROAD_HALF - 6, z0 = z1 - d;
      const { min, max } = footprintHeights(x, x + w, z0, z1);
      const base = min - 1, top = max + 7 + rand() * 9, bay = 14, ground = (max - base) / bay;
      flats.box(x + w / 2, base, (z0 + z1) / 2, w, top - base, d, new THREE.Color(pick(tones)),
        (fi, fw, fh) => (fi === FACE.TOP || fi === FACE.BOTTOM ? null : [0, -ground, fw / bay, fh / bay - ground]), [0.01, 0.99]);
      colliders.push({ minX: x, maxX: x + w, minZ: z0, maxZ: z1, top });
      x += w + 4 + rand() * 6;
    } else {
      const w = 9 + rand() * 4, d = 10;
      addSuburbHouse(walls, roofs, colliders, rand, x + w / 2, roadZ - ROAD_HALF - 5 - d / 2, w, d, '+z');
      x += w + 3 + rand() * 4;
    }
  }
}

function kiosk(parts, colliders) {
  const x = toWorld(300), z = inland(x, 120), y = heightAt(x, z);
  const b = new MeshBuilder();
  b.box(x, y - 0.5, z, 12, 4.2, 8, new THREE.Color('#f4f1ea'));
  b.box(x, y + 3.7, z, 13, 0.4, 9, new THREE.Color('#2e86de'));
  b.box(x, y + 2.2, z + 4.6, 10, 0.2, 2.2, new THREE.Color('#f1c40f'));
  for (const dx of [-5.5, 5.5]) b.box(x + dx, y - 0.2, z + 5.4, 0.2, 2.3, 0.2, new THREE.Color('#d9d2c4'));
  parts.push(b.build());
  colliders.push({ minX: x - 6, maxX: x + 6, minZ: z - 4, maxZ: z + 4, top: y + 4.1 });
}

// Low tufts of dune scrub between the road and the sand.
function scrubSpots() {
  const out = [];
  for (let i = 0; i < 420; i++) {
    const x = toWorld(X0 - 200 + rand() * (X1 - X0 + 400));
    const z = inland(x, 115 + rand() * 50);
    out.push([x, heightAt(x, z), z, 0.6 + rand() * 1.1]);
  }
  return out;
}

const WIND = new THREE.Vector3(-0.62, 0, -0.78).normalize();
const KITE_COLOURS = ['#e74c3c', '#f1c40f', '#2ecc71', '#3498db', '#9b59b6', '#ff7f50', '#1abc9c', '#ecf0f1'];

function kiteGeometry(r, span) {
  return new THREE.CylinderGeometry(r, r, 1.8, 12, 1, true, Math.PI - span / 2, span)
    .rotateX(Math.PI / 2)
    .translate(0, -r * Math.cos(span / 2), 0);
}

function poseKiter(p) {
  p.legL.rotation.set(-0.35, 0, 0.15);
  p.legR.rotation.set(0.25, 0, -0.15);
  p.kneeL.rotation.x = 0.55;
  p.kneeR.rotation.x = 0.35;
  p.torso.rotation.set(-0.2, 0, 0);
  p.armL.rotation.set(-1.25, 0, -0.15);
  p.armR.rotation.set(-1.25, 0, 0.15);
  p.elbowL.rotation.x = -0.35;
  p.elbowR.rotation.x = -0.35;
}

// Kitesurfers reaching back and forth across the southeaster, with the odd boosted jump.
function createKitesurfers(scene) {
  const r = 7, span = 2.3;
  const tip = new THREE.Vector3(r * Math.sin(span / 2), 0, 0);
  const geo = kiteGeometry(r, span);
  const boardGeo = new THREE.BoxGeometry(1.4, 0.08, 0.42);
  const kiters = [];
  for (let i = 0; i < 8; i++) {
    const person = makePerson(randomLook(rand));
    poseKiter(person);
    const board = new THREE.Mesh(boardGeo, new THREE.MeshLambertMaterial({ color: pick(['#f4f4f0', '#1b1b1b', '#e67e22', '#2e86de']) }));
    board.position.y = 0.05;
    person.group.add(board);
    scene.add(person.group);
    const kite = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: pick(KITE_COLOURS), side: THREE.DoubleSide }));
    kite.castShadow = true;
    scene.add(kite);
    const lineGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3));
    const lines = new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({ color: '#202020' }));
    lines.frustumCulled = false;
    scene.add(lines);
    const xa = toWorld(X0 + rand() * 500), xb = toWorld(X1 - rand() * 500);
    kiters.push({
      person, kite, lines, xa, xb, x: xa + rand() * (xb - xa), dir: rand() < 0.5 ? 1 : -1,
      out: toWorld(40 + rand() * 160), speed: 8 + rand() * 5, t: rand() * 10, jump: null, nextJump: 3 + rand() * 10,
    });
  }

  const pos = new THREE.Vector3(), kitePos = new THREE.Vector3(), hand = new THREE.Vector3(), w = new THREE.Vector3();
  return (dt) => {
    for (const k of kiters) {
      k.t += dt;
      k.x += k.dir * k.speed * dt;
      if ((k.dir > 0 && k.x > k.xb) || (k.dir < 0 && k.x < k.xa)) k.dir = -k.dir;
      let lift = 0;
      k.nextJump -= dt;
      if (!k.jump && k.nextJump <= 0) k.jump = { t: 0, dur: 1.6 + rand() * 0.8, h: 3 + rand() * 4 };
      if (k.jump) {
        k.jump.t += dt;
        const u = k.jump.t / k.jump.dur;
        lift = 4 * k.jump.h * u * (1 - u);
        if (u >= 1) {
          k.jump = null;
          k.nextJump = 6 + rand() * 12;
        }
      }
      const z = shoreZ(k.x) + k.out;
      pos.set(k.x, 0.05 + lift, z);
      const g = k.person.group;
      g.position.copy(pos);
      g.rotation.set(0, Math.atan2(WIND.x, WIND.z), k.dir * 0.25);

      // The kite flies downwind and high, swept a little ahead of the rider and swaying in the gusts.
      const sway = Math.sin(k.t * 0.7) * 0.25;
      w.set(-WIND.z, 0, WIND.x).multiplyScalar(k.dir * 0.35 + sway);
      kitePos.copy(pos).addScaledVector(WIND, 20).addScaledVector(w, 20).add(new THREE.Vector3(0, 15 + lift * 0.4 + Math.sin(k.t * 1.3) * 1.5, 0));
      k.kite.position.copy(kitePos);
      k.kite.lookAt(pos.x, pos.y + 1.2, pos.z);

      hand.set(0, 1.25 * g.scale.y, 0.4).applyEuler(g.rotation).add(pos);
      k.kite.updateMatrixWorld();
      const a = tip.clone().applyMatrix4(k.kite.matrixWorld), b = tip.clone().setX(-tip.x).applyMatrix4(k.kite.matrixWorld);
      const arr = k.lines.geometry.attributes.position.array;
      arr.set([hand.x, hand.y, hand.z, a.x, a.y, a.z, hand.x, hand.y, hand.z, b.x, b.y, b.z]);
      k.lines.geometry.attributes.position.needsUpdate = true;
    }
  };
}

export function createBlouberg(scene, colliders) {
  const office = officeTextures();
  const flatsMat = new THREE.MeshLambertMaterial({ map: office.map, vertexColors: true, emissiveMap: office.emissive, emissive: 0xffffff, emissiveIntensity: 0 });
  const flats = new MeshBuilder(), walls = new MeshBuilder(), roofs = new MeshBuilder();
  frontage(flats, walls, roofs, colliders);
  const parts = [];
  kiosk(parts, colliders);
  const meshes = [
    [flats.build(), flatsMat],
    [walls.build(), new THREE.MeshLambertMaterial({ map: houseFacadeTexture(), vertexColors: true })],
    [roofs.build(), new THREE.MeshLambertMaterial({ vertexColors: true })],
    [parts[0], new THREE.MeshLambertMaterial({ vertexColors: true })],
  ];
  for (const [geo, mat] of meshes) {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = mesh.receiveShadow = true;
    scene.add(mesh);
  }

  const scrub = scrubSpots();
  const tufts = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0).scale(1, 0.55, 1), new THREE.MeshLambertMaterial({ color: '#7d8a5a', flatShading: true }), scrub.length);
  const m = new THREE.Matrix4(), c = new THREE.Color();
  scrub.forEach(([x, y, z, s], i) => {
    tufts.setMatrixAt(i, m.makeScale(s, s, s).setPosition(x, y, z));
    tufts.setColorAt(i, c.set('#7d8a5a').multiplyScalar(0.8 + rand() * 0.4));
  });
  scene.add(tufts);

  const walkRects = [];
  for (let rx = X0; rx < X1; rx += 40) {
    const x0 = toWorld(rx), x1 = toWorld(rx + 40);
    walkRects.push({ x0, x1, z0: Math.min(inland(x0, 110), inland(x1, 110)), z1: Math.max(inland(x0, 40), inland(x1, 40)) });
  }

  return {
    walkRects,
    update: createKitesurfers(scene),
    setWindowGlow(v) {
      flatsMat.emissiveIntensity = v;
    },
  };
}
