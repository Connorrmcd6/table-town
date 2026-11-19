import * as THREE from 'three';
import { heightAt } from './heightmap.js';
import { FACE } from './geometry.js';

const WALLS = ['#efe9dc', '#e8dcc4', '#d9d4c7', '#f2efe6', '#cfc3ad', '#e6d3b3', '#c9d3d6', '#e9e0cf', '#d8c9b0'];
const ROOFS = ['#a5512f', '#8a4a32', '#9c5a3c', '#4a4d52', '#6b6f73', '#5d6b74'];
const FRONT_FACE = { '+x': FACE.PX, '-x': FACE.NX, '+z': FACE.PZ, '-z': FACE.NZ };

export function footprintHeights(x0, x1, z0, z1) {
  const hs = [heightAt(x0, z0), heightAt(x1, z0), heightAt(x0, z1), heightAt(x1, z1), heightAt((x0 + x1) / 2, (z0 + z1) / 2)];
  return { min: Math.min(...hs), max: Math.max(...hs) };
}

function face(builder, pts, hint, color) {
  const [a, b, c] = pts.map((p) => new THREE.Vector3(...p));
  const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
  if (n.dot(hint) < 0) {
    pts = [pts[0], pts[3], pts[2], pts[1]];
    n.negate();
  }
  const uv = [0.02, 0.5];
  builder.quad(pts, [n.x, n.y, n.z], [uv, uv, uv, uv], color);
}

function gableRoof(builder, x0, x1, z0, z1, y, rise, ridgeAlongX, color) {
  const o = 0.35;
  x0 -= o; x1 += o; z0 -= o; z1 += o;
  const top = y + rise;
  if (ridgeAlongX) {
    const zm = (z0 + z1) / 2;
    face(builder, [[x0, y, z0], [x1, y, z0], [x1, top, zm], [x0, top, zm]], new THREE.Vector3(0, 1, -1), color);
    face(builder, [[x0, y, z1], [x1, y, z1], [x1, top, zm], [x0, top, zm]], new THREE.Vector3(0, 1, 1), color);
    face(builder, [[x0, y, z0], [x0, y, z1], [x0, top, zm], [x0, top, zm]], new THREE.Vector3(-1, 0, 0), color);
    face(builder, [[x1, y, z0], [x1, y, z1], [x1, top, zm], [x1, top, zm]], new THREE.Vector3(1, 0, 0), color);
  } else {
    const xm = (x0 + x1) / 2;
    face(builder, [[x0, y, z0], [x0, y, z1], [xm, top, z1], [xm, top, z0]], new THREE.Vector3(-1, 1, 0), color);
    face(builder, [[x1, y, z0], [x1, y, z1], [xm, top, z1], [xm, top, z0]], new THREE.Vector3(1, 1, 0), color);
    face(builder, [[x0, y, z0], [x1, y, z0], [xm, top, z0], [xm, top, z0]], new THREE.Vector3(0, 0, -1), color);
    face(builder, [[x0, y, z1], [x1, y, z1], [xm, top, z1], [xm, top, z1]], new THREE.Vector3(0, 0, 1), color);
  }
}

// A detached suburban house facing a street; front gets the door/window facade.
export function addSuburbHouse(walls, roofs, colliders, rand, cx, cz, w, d, facing) {
  const alongX = facing === '+z' || facing === '-z';
  const sx = alongX ? w : d, sz = alongX ? d : w;
  const x0 = cx - sx / 2, x1 = cx + sx / 2, z0 = cz - sz / 2, z1 = cz + sz / 2;
  const { min, max } = footprintHeights(x0, x1, z0, z1);
  const height = rand() < 0.25 ? 6 + rand() * 1.5 : 3.4 + rand() * 0.8;
  const top = max + height;
  const base = min - 1;
  const color = new THREE.Color(WALLS[Math.floor(rand() * WALLS.length)]);
  const front = FRONT_FACE[facing];
  walls.box(cx, base, cz, sx, top - base, sz, color, (fi) => (fi === front ? [0, (base - max) / height, 1, 1] : null));
  const roof = new THREE.Color(ROOFS[Math.floor(rand() * ROOFS.length)]);
  gableRoof(roofs, x0, x1, z0, z1, top, 1.6 + rand() * 1.2, alongX, roof);
  colliders.push({ minX: x0, maxX: x1, minZ: z0, maxZ: z1 });
}

// Detached houses with garden gaps around the perimeter of a rectangle, fronts facing out.
export function fillPerimeter(rect, rand, place) {
  const depth = 10;
  const { x0, x1, z0, z1 } = rect;
  const row = (start, end, put) => {
    let p = start + rand() * 3;
    while (end - p > 8) {
      const w = Math.min(end - p, 8 + rand() * 5);
      put(p + w / 2, w);
      p += w + 2 + rand() * 4;
    }
  };
  row(z0, z1, (c, w) => place(x0 + depth / 2, c, w, depth, '-x'));
  row(z0, z1, (c, w) => place(x1 - depth / 2, c, w, depth, '+x'));
  row(x0 + depth + 1, x1 - depth - 1, (c, w) => place(c, z0 + depth / 2, w, depth, '-z'));
  row(x0 + depth + 1, x1 - depth - 1, (c, w) => place(c, z1 - depth / 2, w, depth, '+z'));
}
