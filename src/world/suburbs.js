import * as THREE from 'three';
import { heightAt, coastDistance, DISA_PARK, w as toWorld, WORLD_SCALE as S } from './heightmap.js';
import { MeshBuilder, FACE } from './geometry.js';
import { ROADS, buildRoads, GRID_X, GRID_Z } from './city.js';
import { buildRoadIndex } from './roadIndex.js';
import { addSuburbHouse, fillPerimeter, footprintHeights } from './houses.js';
import { asphaltTexture, officeTextures, houseFacadeTexture } from './textures.js';

const CELL = toWorld(100);
const CITY_X0 = GRID_X[0], CITY_X1 = GRID_X[GRID_X.length - 1];
const CITY_Z0 = GRID_Z[0], CITY_Z1 = GRID_Z[GRID_Z.length - 1];

// Continue the city's own street lines outward so suburbs butt straight onto the grid.
function lines(cityLines, min, max) {
  const out = new Set(cityLines);
  for (let v = cityLines[0] - CELL; v >= min; v -= CELL) out.add(v);
  for (let v = cityLines[cityLines.length - 1] + CELL; v <= max; v += CELL) out.add(v);
  return [...out].sort((a, b) => a - b);
}
const XS = lines(GRID_X, toWorld(-1800), toWorld(1750));
const ZS = lines(GRID_Z, toWorld(-700), toWorld(2150));

function lineIndex(arr, v) {
  let lo = 0, hi = arr.length - 2;
  if (v < arr[0] || v >= arr[arr.length - 1]) return -1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (arr[mid] <= v) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

const insideCityX = (a, b) => a >= CITY_X0 && b <= CITY_X1;
const insideCityZ = (a, b) => a >= CITY_Z0 && b <= CITY_Z1;
const ROAD_W = 8;
const APARTMENT_COLOURS = ['#efe9dc', '#e2ddd2', '#d6dde2', '#ece4d4', '#cfd6d9', '#f4f1ea'];

let seed = 9001;
function rand() {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
}

function cellValid(x0, x1, z0, z1) {
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  if (insideCityX(x0, x1) && insideCityZ(z0, z1)) return false;
  if (cx > toWorld(380) && cz < toWorld(-540)) return false;
  if (Math.hypot(cx - DISA_PARK.x, cz - DISA_PARK.z) < 85) return false;
  if (coastDistance(cx, cz) < toWorld(50)) return false;
  const hs = [heightAt(x0, z0), heightAt(x1, z0), heightAt(x0, z1), heightAt(x1, z1), heightAt(cx, cz)];
  const min = Math.min(...hs), max = Math.max(...hs);
  return min > 5 * S && max < 270 * S && max - min < 34 * S;
}

function distToSegments(x, z, roads) {
  let best = Infinity;
  for (const r of roads) {
    for (let i = 0; i < r.points.length - 1; i++) {
      const [ax, az] = r.points[i], [bx, bz] = r.points[i + 1];
      const dx = bx - ax, dz = bz - az;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
      best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t) - r.width / 2);
    }
  }
  return best;
}

function addApartments(builder, colliders, rect) {
  const { x0, x1, z0, z1 } = rect;
  const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
  const lots = [[x0, mx - 3, z0, mz - 3], [mx + 3, x1, z0, mz - 3], [x0, mx - 3, mz + 3, z1], [mx + 3, x1, mz + 3, z1]];
  for (const [a, b, c, d] of lots) {
    if (rand() < 0.2) continue;
    const ix = 2 + rand() * 4, iz = 2 + rand() * 4;
    const bx0 = a + ix, bx1 = b - ix, bz0 = c + iz, bz1 = d - iz;
    const { min, max } = footprintHeights(bx0, bx1, bz0, bz1);
    const height = 10 + rand() * 22;
    const base = min - 1, top = max + height;
    const bay = 14;
    const ground = (max - base) / bay;
    const color = new THREE.Color(APARTMENT_COLOURS[Math.floor(rand() * APARTMENT_COLOURS.length)]);
    builder.box((bx0 + bx1) / 2, base, (bz0 + bz1) / 2, bx1 - bx0, top - base, bz1 - bz0, color,
      (fi, fw, fh) => (fi === FACE.TOP || fi === FACE.BOTTOM ? null : [0, -ground, fw / bay, fh / bay - ground]),
      [0.01, 0.99]);
    colliders.push({ minX: bx0, maxX: bx1, minZ: bz0, maxZ: bz1, top });
  }
}

export function createSuburbs(scene, colliders) {
  const specialRoads = ROADS.slice();
  const valid = new Set();
  const cells = [];
  for (let i = 0; i < XS.length - 1; i++) {
    for (let j = 0; j < ZS.length - 1; j++) {
      const [x0, x1, z0, z1] = [XS[i], XS[i + 1], ZS[j], ZS[j + 1]];
      if (cellValid(x0, x1, z0, z1)) {
        valid.add(`${i},${j}`);
        cells.push([x0, x1, z0, z1]);
      }
    }
  }

  const edges = new Map();
  const addEdge = (ax, az, bx, bz, lift) => {
    const onCityRoad = ax === bx
      ? GRID_X.includes(ax) && insideCityZ(Math.min(az, bz), Math.max(az, bz))
      : GRID_Z.includes(az) && insideCityX(Math.min(ax, bx), Math.max(ax, bx));
    if (onCityRoad) return;
    const key = `${ax},${az},${bx},${bz}`;
    if (!edges.has(key)) edges.set(key, { points: [[ax, az], [bx, bz]], width: ROAD_W, surface: 'asphalt', lift });
  };
  for (const [x0, x1, z0, z1] of cells) {
    addEdge(x0, z0, x1, z0, 0.17);
    addEdge(x0, z1, x1, z1, 0.17);
    addEdge(x0, z0, x0, z1, 0.15);
    addEdge(x1, z0, x1, z1, 0.15);
  }

  const asphalt = new MeshBuilder();
  for (const road of edges.values()) {
    buildRoads(asphalt, road);
    ROADS.push(road);
  }
  const roadIndex = buildRoadIndex(ROADS);
  const footprintClear = (hx, hz, w, d, facing) => {
    const alongX = facing === '+z' || facing === '-z';
    const hw = (alongX ? w : d) / 2, hd = (alongX ? d : w) / 2;
    return [[0, 0], [-hw, -hd], [hw, -hd], [-hw, hd], [hw, hd]].every(([ox, oz]) => roadIndex.clearance(hx + ox, hz + oz) > 0.5);
  };

  const walls = new MeshBuilder();
  const roofs = new MeshBuilder();
  const flats = new MeshBuilder();
  const trees = [];
  const walkRects = [];
  for (const [x0, x1, z0, z1] of cells) {
    const pad = (cityLine) => (cityLine ? 9 : ROAD_W / 2 + 2);
    const inner = {
      x0: x0 + pad(GRID_X.includes(x0)), x1: x1 - pad(GRID_X.includes(x1)),
      z0: z0 + pad(GRID_Z.includes(z0)), z1: z1 - pad(GRID_Z.includes(z1)),
    };
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    walkRects.push({ x0: inner.x0 - 1.2, x1: inner.x1 + 1.2, z0: inner.z0 - 1.2, z1: inner.z1 + 1.2 });
    const h = heightAt(cx, cz);
    const seaPoint = cx < toWorld(-1300);
    const apartments = h < 80 * S && rand() < (seaPoint ? 0.6 : 0.12);
    if (apartments && distToSegments(cx, cz, specialRoads) > 50) {
      addApartments(flats, colliders, inner);
      continue;
    }
    fillPerimeter(inner, rand, (hx, hz, w, d, facing) => {
      if (distToSegments(hx, hz, specialRoads) < 10 || !footprintClear(hx, hz, w, d, facing)) return;
      addSuburbHouse(walls, roofs, colliders, rand, hx, hz, w, d, facing);
    });
    for (let k = 0; k < 2; k++) {
      const tx = inner.x0 + 12 + rand() * Math.max(0, inner.x1 - inner.x0 - 24);
      const tz = inner.z0 + 12 + rand() * Math.max(0, inner.z1 - inner.z0 - 24);
      if (roadIndex.clearance(tx, tz) > 4) trees.push([tx, heightAt(tx, tz), tz, 0.6 + rand() * 0.5]);
    }
  }

  const office = officeTextures();
  const flatsMat = new THREE.MeshLambertMaterial({
    map: office.map, vertexColors: true, emissiveMap: office.emissive, emissive: 0xffffff, emissiveIntensity: 0,
  });
  const meshes = [
    [asphalt, new THREE.MeshLambertMaterial({ map: asphaltTexture() }), false],
    [walls, new THREE.MeshLambertMaterial({ map: houseFacadeTexture(), vertexColors: true }), true],
    [roofs, new THREE.MeshLambertMaterial({ vertexColors: true }), true],
    [flats, flatsMat, true],
  ];
  for (const [builder, mat, shadow] of meshes) {
    const mesh = new THREE.Mesh(builder.build(), mat);
    mesh.receiveShadow = true;
    mesh.castShadow = shadow;
    scene.add(mesh);
  }

  const trunkGeo = new THREE.CylinderGeometry(0.3, 0.45, 6, 6);
  trunkGeo.translate(0, 3, 0);
  const canopyGeo = new THREE.IcosahedronGeometry(3.6, 0);
  canopyGeo.translate(0, 7, 0);
  const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshLambertMaterial({ color: '#5a4030' }), trees.length);
  const canopies = new THREE.InstancedMesh(canopyGeo, new THREE.MeshLambertMaterial({ color: '#5d7f3a' }), trees.length);
  const m = new THREE.Matrix4();
  trees.forEach(([x, y, z, s], i) => {
    m.makeScale(s, s, s).setPosition(x, y - 0.3, z);
    trunks.setMatrixAt(i, m);
    canopies.setMatrixAt(i, m);
    colliders.push({ minX: x - 0.5, maxX: x + 0.5, minZ: z - 0.5, maxZ: z + 0.5 });
  });
  trunks.castShadow = canopies.castShadow = true;
  scene.add(trunks, canopies);

  return {
    walkRects,
    edges: [...edges.values()].map((r) => ({ a: r.points[0], b: r.points[1], width: r.width })),
    isSuburb(x, z) {
      return valid.has(`${lineIndex(XS, x)},${lineIndex(ZS, z)}`);
    },
    setWindowGlow(v) {
      flatsMat.emissiveIntensity = v;
    },
  };
}
