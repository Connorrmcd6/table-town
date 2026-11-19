import * as THREE from 'three';
import { heightAt, atlanticLine, bloubergZ, w as toWorld, WORLD_SCALE } from './heightmap.js';
import { MeshBuilder, FACE } from './geometry.js';
import { addSuburbHouse, fillPerimeter } from './houses.js';
import { boundaryWalls, planters, clearOf } from './lowwalls.js';

const inset = (r, d) => ({ x0: r.x0 + d, x1: r.x1 - d, z0: r.z0 + d, z1: r.z1 - d });
import {
  asphaltTexture, cobbleTexture, sidewalkTexture, officeTextures, houseFacadeTexture, plainAsphaltTexture,
} from './textures.js';

export const GRID_X = [-460, -390, -320, -250, -180, -100, 0, 100, 200, 300, 400, 500].map(toWorld);
export const GRID_Z = [-480, -380, -280, -180, -80, 20, 120, 220].map(toWorld);
const BOKAAP_EDGE = toWorld(-100);
const CBD_ROAD_W = 14;
const BOKAAP_ROAD_W = 10;

const BOKAAP_COLOURS = [
  '#ef7fa0', '#3fc1b8', '#f4d03f', '#8fd14f', '#a875d1', '#f39c4a', '#5aa9e6', '#e8577a', '#7fe0c4', '#f7e27e',
];
const OFFICE_COLOURS = ['#d9cfbf', '#c9c4bb', '#e6e0d4', '#9fb4c8', '#b8a58a', '#f0ece4', '#8fa3b5', '#d4b896'];

let seed = 1337;
function rand() {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
}
const pick = (arr) => arr[Math.floor(rand() * arr.length)];

function roadWidthAtX(x) {
  return x < BOKAAP_EDGE ? BOKAAP_ROAD_W : CBD_ROAD_W;
}

export const ROADS = [];

function addRoad(points, width, surface, lift, name, route = false) {
  ROADS.push({ points, width, surface, lift, name, route });
}

const scaleKeys = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [toWorld(Number(k)), v]));
const scalePts = (pts) => pts.map(([x, z]) => [toWorld(x), toWorld(z)]);

const STREET_X = scaleKeys({
  [-250]: 'Chiappini St', [-180]: 'Rose St', [-100]: 'Buitengracht St', 0: 'Bree St', 100: 'Loop St',
  200: 'Long St', 300: 'Burg St', 400: 'Adderley St', 500: 'Plein St',
});
const STREET_Z = scaleKeys({
  [-480]: 'Strand St', [-380]: 'Waterkant St', [-280]: 'Shortmarket St', [-180]: 'Longmarket St',
  [-80]: 'Wale St', 20: 'Dorp St', 120: 'Hope St', 220: 'Orange St',
});

export const BOKAAP = { minX: toWorld(-250), maxX: toWorld(-100), minZ: toWorld(-280), maxZ: toWorld(20) };
const inBoKaap = (x, z) => x >= BOKAAP.minX && x <= BOKAAP.maxX && z >= BOKAAP.minZ && z <= BOKAAP.maxZ;

for (const x of GRID_X) {
  const zMin = [0, 200, 400].map(toWorld).includes(x) ? toWorld(-560) : GRID_Z[0];
  const zMax = GRID_Z[GRID_Z.length - 1];
  const w = roadWidthAtX(x);
  const n = STREET_X[x];
  if (x >= BOKAAP.minX && x < BOKAAP.maxX) {
    addRoad([[x, zMin], [x, BOKAAP.minZ]], w, 'asphalt', 0.15, n);
    addRoad([[x, BOKAAP.minZ], [x, BOKAAP.maxZ]], w, 'cobble', 0.15, n);
    addRoad([[x, BOKAAP.maxZ], [x, zMax]], w, 'asphalt', 0.15, n);
  } else addRoad([[x, zMin], [x, zMax]], w, 'asphalt', 0.15, n);
}
for (const z of GRID_Z) {
  const n = STREET_Z[z];
  if (z >= BOKAAP.minZ && z <= BOKAAP.maxZ) {
    addRoad([[GRID_X[0], z], [BOKAAP.minX, z]], BOKAAP_ROAD_W, 'asphalt', 0.17, n);
    addRoad([[BOKAAP.minX, z], [BOKAAP_EDGE, z]], BOKAAP_ROAD_W, 'cobble', 0.17, n);
  } else addRoad([[GRID_X[0], z], [BOKAAP_EDGE, z]], BOKAAP_ROAD_W, 'asphalt', 0.17, n);
  addRoad([[BOKAAP_EDGE, z], [GRID_X[GRID_X.length - 1], z]], CBD_ROAD_W, 'asphalt', 0.17, n);
}
addRoad(scalePts([[-700, -560], [-300, -575], [200, -560], [700, -575], [1250, -560]]), 18, 'asphalt', 0.32, 'Helen Suzman Blvd', true);
addRoad(scalePts([[200, 220], [130, 400], [20, 580], [-150, 740], [-350, 860]]), 12, 'asphalt', 0.32, 'Kloof Street', true);
addRoad(scalePts([[-350, 860], [-500, 940], [-650, 1000]]), 10, 'asphalt', 0.32, 'Kloof Nek Road', true);
addRoad(scalePts([[-650, 1000], [-400, 1250], [-100, 1550], [150, 1800], [300, 1950]]), 9, 'asphalt', 0.32, 'Tafelberg Road', true);
// The Atlantic seaboard road, offset inland from the shore: low along Sea Point, up on the slope above Clifton's coves,
// and back far enough at Camps Bay to leave room for the beach and promenade.
const seaboardOffset = (z) => (z < 1250 ? 95 : z < 1350 ? 95 + (z - 1250) * 0.3 : z < 1550 ? 125 : z < 1750 ? 125 + (z - 1550) * 0.325 : 190);
export const seaboardPoint = (z) => [atlanticLine(toWorld(z)) + toWorld(seaboardOffset(z)), toWorld(z)];
const SEABOARD_ZS = Array.from({ length: 35 }, (_, i) => -300 + i * 75);
const CLIFTON_JOIN = seaboardPoint(1425), CAMPS_BAY_JOIN = seaboardPoint(1725);
addRoad(
  [...scalePts([[-700, -560], [-1100, -545], [-1450, -480], [-1700, -380]]), ...SEABOARD_ZS.filter((z) => z <= 900).map(seaboardPoint)],
  10, 'asphalt', 0.32, 'Beach Road', true
);
addRoad(SEABOARD_ZS.filter((z) => z >= 900).map(seaboardPoint), 10, 'asphalt', 0.32, 'Victoria Road', true);
// Camps Bay Drive drops from Kloof Nek; Kloof Road forks off it below the nek and contours round to Clifton.
addRoad([...scalePts([[-650, 1000], [-850, 1250], [-1100, 1480], [-1350, 1660]]), CAMPS_BAY_JOIN], 10, 'asphalt', 0.32, 'Camps Bay Drive', true);
addRoad([...scalePts([[-850, 1250], [-1100, 1300], [-1400, 1520]]), CLIFTON_JOIN], 10, 'asphalt', 0.32, 'Kloof Road', true);

// Into the V&A Waterfront off Helen Suzman Blvd, round the basin to the Clock Tower quay.
export const DOCK_ROAD = [[-300, -575], [-300, -700], [-200, -805], [40, -805]];
addRoad(scalePts(DOCK_ROAD), 10, 'asphalt', 0.32, 'Dock Road', true);

// Round Table Bay to Bloubergstrand: Marine Drive up the east shore, then Beach Boulevard behind the dunes.
export const BLOUBERG_ROAD_OFFSET = 180;
const BLOUBERG_XS = Array.from({ length: 13 }, (_, i) => 925 - i * 125);
const MARINE_END = [1050, -2626];
addRoad(
  scalePts([[1250, -560], [1700, -560], [2050, -620], [1950, -850], [1850, -1100], [1740, -1400], [1620, -1700], [1500, -2000], [1360, -2300], [1175, -2469], MARINE_END]),
  12, 'asphalt', 0.32, 'Marine Drive', true
);
addRoad(scalePts([MARINE_END, ...BLOUBERG_XS.map((x) => [x, Math.round(bloubergZ(x) - BLOUBERG_ROAD_OFFSET)])]), 10, 'asphalt', 0.32, 'Beach Boulevard', true);
addRoad(
  scalePts([[-650, 1000], [-900, 820], [-1150, 700], [-1300, 450], [-1300, 200], [-1220, 0], [-1150, -150]]),
  9, 'asphalt', 0.32, 'Signal Hill Road', true
);

export const CBD_EDGE = BOKAAP_EDGE;

export function cityEdges() {
  const edges = [];
  for (const x of GRID_X) {
    for (let j = 0; j < GRID_Z.length - 1; j++) edges.push({ a: [x, GRID_Z[j]], b: [x, GRID_Z[j + 1]], width: roadWidthAtX(x) });
  }
  for (const z of GRID_Z) {
    for (let i = 0; i < GRID_X.length - 1; i++) {
      const width = GRID_X[i] < BOKAAP_EDGE ? BOKAAP_ROAD_W : CBD_ROAD_W;
      edges.push({ a: [GRID_X[i], z], b: [GRID_X[i + 1], z], width });
    }
  }
  return edges;
}

const FORESHORE_LINKS = [0, 200, 400].map(toWorld);

// Main roads as traffic edges; the Foreshore gets nodes where the CBD streets run down to meet it.
export function routeEdges() {
  const edges = [];
  for (const r of ROADS.filter((road) => road.route)) {
    let pts = r.points;
    if (r.name === 'Helen Suzman Blvd') {
      pts = [...pts];
      for (const x of FORESHORE_LINKS) {
        const i = pts.findIndex((p, k) => k > 0 && p[0] >= x);
        const [ax, az] = pts[i - 1], [bx, bz] = pts[i];
        const z = Math.abs(bx - x) < 0.01 ? bz : az + ((bz - az) * (x - ax)) / (bx - ax);
        if (Math.abs(bx - x) >= 0.01) pts.splice(i, 0, [x, z]);
        edges.push({ a: [x, GRID_Z[0]], b: [x, z], width: CBD_ROAD_W });
      }
    }
    for (let i = 0; i < pts.length - 1; i++) edges.push({ a: pts[i], b: pts[i + 1], width: r.width });
  }
  return edges;
}

const PARK_BLOCKS = new Set(['6,5']);

export function blockRects() {
  const rects = [];
  for (let i = 0; i < GRID_X.length - 1; i++) {
    for (let j = 0; j < GRID_Z.length - 1; j++) {
      const x0 = GRID_X[i] + roadWidthAtX(GRID_X[i]) / 2;
      const x1 = GRID_X[i + 1] - roadWidthAtX(GRID_X[i + 1]) / 2;
      const zw = GRID_X[i] < BOKAAP_EDGE ? BOKAAP_ROAD_W : CBD_ROAD_W;
      const z0 = GRID_Z[j] + zw / 2;
      const z1 = GRID_Z[j + 1] - zw / 2;
      const west = GRID_X[i] < BOKAAP_EDGE;
      const bokaap = west && inBoKaap((x0 + x1) / 2, (z0 + z1) / 2);
      rects.push({ x0, x1, z0, z1, bokaap, suburb: west && !bokaap, park: PARK_BLOCKS.has(`${i},${j}`), i, j });
    }
  }
  return rects;
}

export function buildRoads(builder, road) {
  const step = 4;
  const samples = [];
  const pts = road.points;
  for (let s = 0; s < pts.length - 1; s++) {
    const [ax, az] = pts[s], [bx, bz] = pts[s + 1];
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.ceil(len / step));
    for (let k = 0; k < n; k++) samples.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n]);
  }
  samples.push(pts[pts.length - 1]);
  const half = road.width / 2;
  const vScale = road.surface === 'cobble' ? 1 / 3 : 1 / (road.width * 1.6);
  const uMax = road.surface === 'cobble' ? road.width / 3 : 1;
  let dist = 0;
  const white = new THREE.Color(1, 1, 1);
  const edge = (i) => {
    const prev = samples[Math.max(0, i - 1)], next = samples[Math.min(samples.length - 1, i + 1)];
    let dx = next[0] - prev[0], dz = next[1] - prev[1];
    const l = Math.hypot(dx, dz) || 1;
    dx /= l; dz /= l;
    const [x, z] = samples[i];
    const lx = x + dz * half, lz = z - dx * half;
    const rx = x - dz * half, rz = z + dx * half;
    return [[lx, heightAt(lx, lz) + road.lift, lz], [rx, heightAt(rx, rz) + road.lift, rz]];
  };
  let prevEdge = edge(0);
  for (let i = 1; i < samples.length; i++) {
    const cur = edge(i);
    const segLen = Math.hypot(samples[i][0] - samples[i - 1][0], samples[i][1] - samples[i - 1][1]);
    const v0 = dist * vScale, v1 = (dist + segLen) * vScale;
    dist += segLen;
    builder.quad(
      [prevEdge[0], prevEdge[1], cur[1], cur[0]],
      [0, 1, 0],
      [[0, v0], [uMax, v0], [uMax, v1], [0, v1]],
      white
    );
    prevEdge = cur;
  }
}

function buildSidewalk(builder, r) {
  const lift = 0.3;
  const white = new THREE.Color(1, 1, 1);
  const nx = Math.max(1, Math.ceil((r.x1 - r.x0) / 6));
  const nz = Math.max(1, Math.ceil((r.z1 - r.z0) / 6));
  const P = (x, z) => [x, heightAt(x, z) + lift, z];
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      const xa = r.x0 + ((r.x1 - r.x0) * i) / nx, xb = r.x0 + ((r.x1 - r.x0) * (i + 1)) / nx;
      const za = r.z0 + ((r.z1 - r.z0) * j) / nz, zb = r.z0 + ((r.z1 - r.z0) * (j + 1)) / nz;
      builder.quad(
        [P(xa, zb), P(xb, zb), P(xb, za), P(xa, za)],
        [0, 1, 0],
        [[xa / 3, zb / 3], [xb / 3, zb / 3], [xb / 3, za / 3], [xa / 3, za / 3]],
        white
      );
    }
  }
  const curb = (ax, az, bx, bz, nxv, nzv) => {
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 6));
    for (let k = 0; k < n; k++) {
      const x0 = ax + ((bx - ax) * k) / n, z0 = az + ((bz - az) * k) / n;
      const x1 = ax + ((bx - ax) * (k + 1)) / n, z1 = az + ((bz - az) * (k + 1)) / n;
      const h0 = heightAt(x0, z0), h1 = heightAt(x1, z1);
      builder.quad(
        [[x0, h0, z0], [x1, h1, z1], [x1, h1 + lift, z1], [x0, h0 + lift, z0]],
        [nxv, 0, nzv],
        [[0, 0], [1, 0], [1, 0.1], [0, 0.1]],
        white
      );
    }
  };
  curb(r.x1, r.z0, r.x0, r.z0, 0, -1);
  curb(r.x0, r.z1, r.x1, r.z1, 0, 1);
  curb(r.x0, r.z0, r.x0, r.z1, -1, 0);
  curb(r.x1, r.z1, r.x1, r.z0, 1, 0);
}

function footprintHeights(x0, x1, z0, z1) {
  const hs = [heightAt(x0, z0), heightAt(x1, z0), heightAt(x0, z1), heightAt(x1, z1), heightAt((x0 + x1) / 2, (z0 + z1) / 2)];
  return { min: Math.min(...hs), max: Math.max(...hs) };
}

const FRONT_FACE = { '+x': FACE.PX, '-x': FACE.NX, '+z': FACE.PZ, '-z': FACE.NZ };

function addHouse(builder, colliders, cx, cz, w, d, facing) {
  const alongX = facing === '+z' || facing === '-z';
  const sx = alongX ? w : d, sz = alongX ? d : w;
  const x0 = cx - sx / 2, x1 = cx + sx / 2, z0 = cz - sz / 2, z1 = cz + sz / 2;
  const { min, max } = footprintHeights(x0, x1, z0, z1);
  const height = 5 + rand() * 2;
  const top = max + height;
  const base = min - 1;
  const color = new THREE.Color(pick(BOKAAP_COLOURS));
  const front = FRONT_FACE[facing];
  builder.box(cx, base, cz, sx, top - base, sz, color, (fi) => (fi === front ? [0, (base - max) / height, 1, 1] : null));
  const trim = color.clone().lerp(new THREE.Color('#ffffff'), 0.35);
  const sign = facing[0] === '+' ? 1 : -1;
  const px = alongX ? cx : cx + sign * (sx / 2 - 0.25);
  const pz = alongX ? cz + sign * (sz / 2 - 0.25) : cz;
  builder.box(px, top, pz, alongX ? w : 0.5, 0.9, alongX ? 0.5 : w, trim, null);
  if (rand() < 0.7) builder.box(px, top + 0.9, pz, alongX ? w * 0.4 : 0.5, 0.9, alongX ? 0.5 : w * 0.4, trim, null);
  colliders.push({ minX: x0, maxX: x1, minZ: z0, maxZ: z1, top });
}

function addBoKaapBlock(builder, colliders, r) {
  const inset = 1.5, depth = 11;
  const xa = r.x0 + inset, xb = r.x1 - inset, za = r.z0 + inset, zb = r.z1 - inset;
  const row = (start, end, place) => {
    let p = start;
    while (end - p > 4) {
      const w = Math.min(end - p, 6 + rand() * 2.5);
      place(p + w / 2, w);
      p += w;
    }
  };
  row(za, zb, (c, w) => addHouse(builder, colliders, xa + depth / 2, c, w, depth, '-x'));
  row(za, zb, (c, w) => addHouse(builder, colliders, xb - depth / 2, c, w, depth, '+x'));
  row(xa + depth, xb - depth, (c, w) => addHouse(builder, colliders, c, za + depth / 2, w, depth, '-z'));
  row(xa + depth, xb - depth, (c, w) => addHouse(builder, colliders, c, zb - depth / 2, w, depth, '+z'));
}

function addOffice(builder, colliders, x0, x1, z0, z1, height) {
  const { min, max } = footprintHeights(x0, x1, z0, z1);
  const base = min - 1;
  const top = max + height;
  const color = new THREE.Color(pick(OFFICE_COLOURS));
  const bay = 14;
  const groundOffset = (max - base) / bay;
  builder.box((x0 + x1) / 2, base, (z0 + z1) / 2, x1 - x0, top - base, z1 - z0, color,
    (fi, fw, fh) => (fi === FACE.TOP || fi === FACE.BOTTOM ? null : [0, -groundOffset, fw / bay, fh / bay - groundOffset]),
    [0.01, 0.99]);
  if (height > 25) {
    const w = (x1 - x0) * 0.4, d = (z1 - z0) * 0.4;
    builder.box((x0 + x1) / 2, top, (z0 + z1) / 2, w, 3 + rand() * 4, d, color.clone().multiplyScalar(0.8), null, [0.01, 0.99]);
  }
  colliders.push({ minX: x0, maxX: x1, minZ: z0, maxZ: z1, top });
}

function addCbdBlock(builder, colliders, r) {
  const inset = 3;
  const xa = r.x0 + inset, xb = r.x1 - inset, za = r.z0 + inset, zb = r.z1 - inset;
  const towerZone = r.x0 > 0 && r.z1 < toWorld(-200);
  const tall = () => (towerZone ? 35 + rand() * 95 : 10 + rand() * 30);
  if (towerZone && rand() < 0.35) {
    addOffice(builder, colliders, xa + 6, xb - 6, za + 6, zb - 6, 80 + rand() * 60);
    return;
  }
  const mx = (xa + xb) / 2 + (rand() - 0.5) * 16 * WORLD_SCALE;
  const mz = (za + zb) / 2 + (rand() - 0.5) * 16 * WORLD_SCALE;
  const gap = 1;
  addOffice(builder, colliders, xa, mx - gap, za, mz - gap, tall());
  addOffice(builder, colliders, mx + gap, xb, za, mz - gap, tall());
  addOffice(builder, colliders, xa, mx - gap, mz + gap, zb, tall());
  addOffice(builder, colliders, mx + gap, xb, mz + gap, zb, tall());
}

export function createCity(scene) {
  const asphalt = new MeshBuilder();
  const cobble = new MeshBuilder();
  const sidewalk = new MeshBuilder();
  const park = new MeshBuilder();
  const houses = new MeshBuilder();
  const roofs = new MeshBuilder();
  const offices = new MeshBuilder();
  const colliders = [];

  for (const road of ROADS) buildRoads(road.surface === 'cobble' ? cobble : asphalt, road);
  const blocks = blockRects();
  for (const r of blocks) {
    buildSidewalk(r.park ? park : sidewalk, r);
    if (r.park) {
      boundaryWalls(roofs, colliders, rand, inset(r, 2), { low: true });
      continue;
    }
    if (r.bokaap) addBoKaapBlock(houses, colliders, r);
    else if (r.suburb) {
      const homes = [];
      fillPerimeter(inset(r, 2), rand, (cx, cz, w, d, f) => homes.push(addSuburbHouse(houses, roofs, colliders, rand, cx, cz, w, d, f)));
      boundaryWalls(roofs, colliders, rand, inset(r, 1.75), { isClear: clearOf(homes, 0.6) });
    } else {
      addCbdBlock(offices, colliders, r);
      planters(roofs, colliders, rand, r, 2.3);
    }
  }

  const office = officeTextures();
  const mats = {
    asphalt: new THREE.MeshLambertMaterial({ map: asphaltTexture() }),
    cobble: new THREE.MeshLambertMaterial({ map: cobbleTexture() }),
    sidewalk: new THREE.MeshLambertMaterial({ map: sidewalkTexture() }),
    park: new THREE.MeshLambertMaterial({ color: '#6f8f3a' }),
    houses: new THREE.MeshLambertMaterial({ map: houseFacadeTexture(), vertexColors: true }),
    offices: new THREE.MeshLambertMaterial({
      map: office.map, vertexColors: true, emissiveMap: office.emissive, emissive: 0xffffff, emissiveIntensity: 0,
    }),
  };
  const add = (builder, mat, shadow) => {
    const mesh = new THREE.Mesh(builder.build(), mat);
    mesh.receiveShadow = true;
    mesh.castShadow = shadow;
    scene.add(mesh);
    return mesh;
  };
  add(asphalt, mats.asphalt, false);
  add(cobble, mats.cobble, false);
  add(sidewalk, mats.sidewalk, false);
  add(park, mats.park, false);
  add(houses, mats.houses, true);
  add(roofs, new THREE.MeshLambertMaterial({ vertexColors: true }), true);
  add(offices, mats.offices, true);

  return {
    colliders,
    blocks,
    setWindowGlow(v) {
      mats.offices.emissiveIntensity = v;
    },
  };
}

// Plain asphalt squares over every crossing so lane markings don't run through junctions.
export function createJunctions(scene, roadIndex) {
  const b = new MeshBuilder();
  const white = new THREE.Color(1, 1, 1);
  for (const j of roadIndex.junctions()) {
    if (j.roads.every((r) => r.surface === 'cobble')) continue;
    const lift = Math.max(...j.roads.map((r) => r.lift)) + 0.04;
    const half = j.size * 0.55 + 0.5;
    const n = 3;
    const P = (x, z) => [x, heightAt(x, z) + lift, z];
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < n; k++) {
        const xa = j.x - half + (2 * half * i) / n, xb = j.x - half + (2 * half * (i + 1)) / n;
        const za = j.z - half + (2 * half * k) / n, zb = j.z - half + (2 * half * (k + 1)) / n;
        b.quad([P(xa, zb), P(xb, zb), P(xb, za), P(xa, za)], [0, 1, 0],
          [[xa / 6, zb / 6], [xb / 6, zb / 6], [xb / 6, za / 6], [xa / 6, za / 6]], white);
      }
    }
  }
  const mesh = new THREE.Mesh(b.build(), new THREE.MeshLambertMaterial({ map: plainAsphaltTexture() }));
  mesh.receiveShadow = true;
  scene.add(mesh);
}
