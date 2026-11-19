import * as THREE from 'three';
import { heightAt, coastDistance, CITY, DISA_PARK } from './heightmap.js';
import { MeshBuilder, FACE } from './geometry.js';
import { ROADS, buildRoads } from './city.js';
import { addSuburbHouse, fillPerimeter, footprintHeights } from './houses.js';
import { asphaltTexture, officeTextures, houseFacadeTexture } from './textures.js';

const CELL = 100;
const X_LINES = [-1700, 1700];
const Z_LINES = [-680, 2120];
const ROAD_W = 8;
const APARTMENT_COLOURS = ['#efe9dc', '#e2ddd2', '#d6dde2', '#ece4d4', '#cfd6d9', '#f4f1ea'];

let seed = 9001;
function rand() {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
}

function overlapsCity(x0, x1, z0, z1) {
  return x1 > CITY.minX - 5 && x0 < CITY.maxX + 5 && z1 > CITY.minZ - 5 && z0 < CITY.maxZ + 5;
}

function cellValid(x0, z0) {
  const x1 = x0 + CELL, z1 = z0 + CELL;
  const cx = x0 + CELL / 2, cz = z0 + CELL / 2;
  if (overlapsCity(x0, x1, z0, z1)) return false;
  if (cx > 380 && cz < -540) return false;
  if (Math.hypot(cx - DISA_PARK.x, cz - DISA_PARK.z) < 85) return false;
  if (coastDistance(cx, cz) < 50) return false;
  const hs = [heightAt(x0, z0), heightAt(x1, z0), heightAt(x0, z1), heightAt(x1, z1), heightAt(cx, cz)];
  const min = Math.min(...hs), max = Math.max(...hs);
  return min > 5 && max < 270 && max - min < 34;
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
    colliders.push({ minX: bx0, maxX: bx1, minZ: bz0, maxZ: bz1 });
  }
}

export function createSuburbs(scene, colliders) {
  const specialRoads = ROADS.slice();
  const valid = new Set();
  const cells = [];
  for (let x0 = X_LINES[0]; x0 < X_LINES[1]; x0 += CELL) {
    for (let z0 = Z_LINES[0]; z0 < Z_LINES[1]; z0 += CELL) {
      if (cellValid(x0, z0)) {
        valid.add(`${x0},${z0}`);
        cells.push([x0, z0]);
      }
    }
  }

  const edges = new Map();
  const addEdge = (ax, az, bx, bz, lift) => {
    const key = `${ax},${az},${bx},${bz}`;
    if (!edges.has(key)) edges.set(key, { points: [[ax, az], [bx, bz]], width: ROAD_W, surface: 'asphalt', lift });
  };
  for (const [x0, z0] of cells) {
    const x1 = x0 + CELL, z1 = z0 + CELL;
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

  const walls = new MeshBuilder();
  const roofs = new MeshBuilder();
  const flats = new MeshBuilder();
  const trees = [];
  for (const [x0, z0] of cells) {
    const inner = { x0: x0 + ROAD_W / 2 + 2, x1: x0 + CELL - ROAD_W / 2 - 2, z0: z0 + ROAD_W / 2 + 2, z1: z0 + CELL - ROAD_W / 2 - 2 };
    const cx = x0 + CELL / 2, cz = z0 + CELL / 2;
    const h = heightAt(cx, cz);
    const seaPoint = cx < -1300;
    const apartments = h < 80 && rand() < (seaPoint ? 0.6 : 0.12);
    if (apartments && distToSegments(cx, cz, specialRoads) > 50) {
      addApartments(flats, colliders, inner);
      continue;
    }
    fillPerimeter(inner, rand, (hx, hz, w, d, facing) => {
      if (distToSegments(hx, hz, specialRoads) < 10) return;
      addSuburbHouse(walls, roofs, colliders, rand, hx, hz, w, d, facing);
    });
    for (let k = 0; k < 2; k++) {
      const tx = cx + (rand() - 0.5) * 40, tz = cz + (rand() - 0.5) * 40;
      if (distToSegments(tx, tz, specialRoads) > 8) trees.push([tx, heightAt(tx, tz), tz, 0.6 + rand() * 0.5]);
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
    isSuburb(x, z) {
      const x0 = X_LINES[0] + Math.floor((x - X_LINES[0]) / CELL) * CELL;
      const z0 = Z_LINES[0] + Math.floor((z - Z_LINES[0]) / CELL) * CELL;
      return valid.has(`${x0},${z0}`);
    },
    setWindowGlow(v) {
      flatsMat.emissiveIntensity = v;
    },
  };
}
