import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const base = import.meta.env.BASE_URL;

// Credits: Hiace by ROH3D, Golf GTI Mk1 by Ddiaz Design, Sixty60 bike by Caitlin Pillay, Ranger Raptor by TSB3DMODELS (all on Sketchfab).
// Untextured or near-solid materials are baked to vertex colours so each vehicle is only a handful of draw calls.
const CONFIGS = {
  hiace: {
    url: `${base}models/hiace.glb`,
    length: 5.3,
    rotateY: -Math.PI / 2,
    skip: ['lp', 'logo'],
    keepMaps: ['paint', 'parts', 'lights', 'wheel'],
    glass: ['glass'],
    colours: { glass2: '#0b0d10' },
    isWheel: (o) => o.material.name === 'wheel',
  },
  golf: {
    url: `${base}models/golf.glb`,
    length: 3.82,
    skip: ['vM_Engine_Max1', 'vM_LightGlassNormal_Clear_Low1', 'vM_Badge_Max1'],
    keepMaps: [],
    glass: ['vM_Glass_WindowFront_Low1'],
    paint: ['vM_CarPaint_Max1'],
    brake: ['vM_LightGlassNormal_OuterRed_Low1'],
    isWheel: (o) => ['tire', 'disk', 'vM_Rim_Main_Max1', 'vM_Rim_Secondary_Max1'].includes(o.material.name),
  },
  sixty60: {
    url: `${base}models/sixty60.glb`,
    length: 1.95,
    rotateY: -Math.PI / 2,
    bike: true,
    skip: [],
    keepMaps: ['Shiny_Blue'],
    glass: [],
    brake: ['Red_Light'],
    seat: 'Seat',
    isWheel: (o) => /Rim|Tyre/.test(o.name + o.parent?.name),
  },
  ranger: {
    url: `${base}models/ranger.glb`,
    length: 5.38,
    skip: [],
    keepMaps: ['Scene_-_Root'],
    glass: [],
    isWheel: () => false,
    wheelbase: 3.27,
    radius: 0.42,
  },
};

const templates = new Map();
const FLAT = new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 60, specular: 0x444444 });
const GLASS = new THREE.MeshPhongMaterial({ color: '#141a20', transparent: true, opacity: 0.55, shininess: 110, specular: 0x9aa4b0, depthWrite: false });

export const gltfReady = (name) => templates.has(name);

function averageColour(map) {
  const c = document.createElement('canvas');
  c.width = c.height = 8;
  const ctx = c.getContext('2d');
  ctx.drawImage(map.image, 0, 0, 8, 8);
  const d = ctx.getImageData(0, 0, 8, 8).data;
  const sum = [0, 0, 0];
  for (let i = 0; i < d.length; i += 4) for (let k = 0; k < 3; k++) sum[k] += d[i + k];
  return new THREE.Color().setRGB(sum[0] / 16320, sum[1] / 16320, sum[2] / 16320, THREE.SRGBColorSpace);
}

function flatColour(material, cfg, cache) {
  const name = material.name;
  if (cfg.colours?.[name]) return new THREE.Color(cfg.colours[name]);
  if (!cache.has(name)) cache.set(name, material.map ? averageColour(material.map).multiply(material.color) : material.color.clone());
  return cache.get(name);
}

function bake(mesh, toLocal, attrs, colour) {
  const src = mesh.geometry;
  const g = new THREE.BufferGeometry();
  for (const a of attrs) g.setAttribute(a, src.getAttribute(a));
  g.setIndex(src.index ?? [...Array(src.getAttribute('position').count).keys()]);
  // toNonIndexed copies into fresh arrays, so shared or interleaved source buffers are never mutated.
  const out = g.toNonIndexed();
  out.applyMatrix4(new THREE.Matrix4().multiplyMatrices(toLocal, mesh.matrixWorld));
  if (colour) {
    const n = out.getAttribute('position').count;
    const c = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) colour.toArray(c, i * 3);
    out.setAttribute('color', new THREE.BufferAttribute(c, 3));
  }
  return out;
}

// Some models pack all four tyres into one mesh, so assign each triangle to the wheel whose quadrant it sits in.
function splitByWheel(geo, bike, centre) {
  const pos = geo.getAttribute('position');
  const groups = new Map();
  for (let t = 0; t < pos.count; t += 3) {
    const x = pos.getX(t) + pos.getX(t + 1) + pos.getX(t + 2) - 3 * centre.x;
    const z = pos.getZ(t) + pos.getZ(t + 1) + pos.getZ(t + 2) - 3 * centre.z;
    const key = bike ? `${z > 0}` : `${x > 0}${z > 0}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t);
  }
  const out = new Map();
  for (const [key, tris] of groups) {
    const g = new THREE.BufferGeometry();
    for (const [name, attr] of Object.entries(geo.attributes)) {
      const n = attr.itemSize;
      const data = new Float32Array(tris.length * 3 * n);
      tris.forEach((t, i) => data.set(attr.array.subarray(t * n, (t + 3) * n), i * 3 * n));
      g.setAttribute(name, new THREE.BufferAttribute(data, n));
    }
    out.set(key, g);
  }
  return out;
}

class Buckets {
  constructor() { this.map = new Map(); }
  add(key, material, geo) {
    if (!this.map.has(key)) this.map.set(key, { material, geos: [] });
    this.map.get(key).geos.push(geo);
  }
  build() {
    return [...this.map.entries()].map(([key, { material, geos }]) => {
      const geo = mergeGeometries(geos);
      geo.computeBoundingBox();
      return { key, geo, material };
    });
  }
}

async function load(name) {
  const cfg = CONFIGS[name];
  const gltf = await new GLTFLoader().loadAsync(cfg.url);
  const root = gltf.scene;
  root.updateMatrixWorld(true);
  const rot = new THREE.Matrix4().makeRotationY(cfg.rotateY ?? 0);
  const box = new THREE.Box3().setFromObject(root).applyMatrix4(rot);
  const scale = cfg.length / (box.max.z - box.min.z);
  const toLocal = new THREE.Matrix4().makeScale(scale, scale, scale).multiply(rot);
  const centre = box.getCenter(new THREE.Vector3()).multiplyScalar(scale);
  const colours = new Map();
  const textured = new Map();
  const body = new Buckets();
  const wheelParts = new Map();
  let seat = null;
  root.traverse((o) => {
    if (!o.isMesh) return;
    const m = o.material;
    if (cfg.skip.includes(m.name)) return;
    const keepMap = cfg.keepMaps.includes(m.name) && m.map;
    const attrs = keepMap ? ['position', 'normal', 'uv'] : ['position', 'normal'];
    const geo = bake(o, toLocal, attrs, keepMap ? null : flatColour(m, cfg, colours));
    const texturedMaterial = () => {
      if (!textured.has(m.map)) textured.set(m.map, new THREE.MeshPhongMaterial({ map: m.map, shininess: 70, specular: 0x555555 }));
      return textured.get(m.map);
    };
    if (cfg.isWheel(o)) {
      const material = keepMap ? texturedMaterial() : FLAT;
      for (const [key, part] of splitByWheel(geo, cfg.bike, centre)) {
        if (!wheelParts.has(key)) wheelParts.set(key, new Buckets());
        wheelParts.get(key).add(keepMap ? m.map.uuid : 'flat', material, part);
      }
      return;
    }
    if (cfg.seat === m.name) {
      geo.computeBoundingBox();
      seat = geo.boundingBox.clone();
    }
    if (cfg.glass.includes(m.name)) body.add('glass', GLASS, geo);
    else if (cfg.paint?.includes(m.name)) body.add('paint', null, geo);
    else if (cfg.brake?.includes(m.name)) body.add('brake', null, geo);
    else if (keepMap) body.add(m.map.uuid, texturedMaterial(), geo);
    else body.add('flat', FLAT, geo);
  });
  const parts = body.build();
  const wheels = [...wheelParts.values()].map((b) => {
    const meshes = b.build();
    const bounds = new THREE.Box3();
    for (const p of meshes) bounds.union(p.geo.boundingBox);
    const center = bounds.getCenter(new THREE.Vector3());
    for (const p of meshes) p.geo.translate(-center.x, -center.y, -center.z);
    return { meshes, center, radius: (bounds.max.y - bounds.min.y) / 2 };
  });
  const axles = wheels.length ? wheels.map((w) => w.center.z) : [centre.z];
  const mid = (Math.max(...axles) + Math.min(...axles)) / 2;
  const radius = wheels.length ? Math.max(...wheels.map((w) => w.radius)) : cfg.radius;
  const ground = Math.min(...parts.map((p) => p.geo.boundingBox.min.y), ...wheels.map((w) => w.center.y - radius));
  const shift = new THREE.Vector3(0, -ground, -mid);
  for (const p of parts) p.geo.translate(shift.x, shift.y, shift.z);
  for (const w of wheels) {
    w.center.add(shift);
    w.front = w.center.z > 0;
  }
  if (seat) seat.translate(shift);
  templates.set(name, {
    parts,
    wheels,
    radius,
    wheelbase: cfg.wheelbase ?? Math.max(...axles) - Math.min(...axles),
    seat: seat && { y: seat.max.y, z: (seat.min.z + seat.max.z) / 2 },
  });
}

export function loadVehicleModels() {
  return Promise.all(Object.keys(CONFIGS).map((name) => load(name).catch((e) => console.warn(`${name} model failed to load, using fallback`, e))));
}

// Adds the model's meshes to `group`; `paint` and `brake` are per-vehicle materials.
export function gltfBody(name, group, { paint, brake } = {}) {
  const t = templates.get(name);
  for (const { key, geo, material } of t.parts) {
    const m = new THREE.Mesh(geo, key === 'paint' ? paint : key === 'brake' ? brake : material);
    m.castShadow = key !== 'glass';
    group.add(m);
  }
  const out = { front: [], all: [] };
  for (const { meshes, center, front } of t.wheels) {
    const pivot = new THREE.Group();
    pivot.position.copy(center);
    const tyre = new THREE.Group();
    for (const { geo, material } of meshes) {
      const m = new THREE.Mesh(geo, material);
      m.castShadow = true;
      tyre.add(m);
    }
    pivot.add(tyre);
    group.add(pivot);
    out.all.push(tyre);
    if (front) out.front.push(pivot);
  }
  return { wheels: out, radius: t.radius, wheelbase: t.wheelbase, seat: t.seat };
}
