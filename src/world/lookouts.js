import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { heightAt, w as toWorld } from './heightmap.js';
import { ROADS } from './city.js';

function part(geo, color, x, y, z, ry = 0) {
  const g = geo.clone().rotateY(ry).translate(x, y, z);
  const flat = g.index ? g.toNonIndexed() : g;
  const n = flat.getAttribute('position').count, c = new Float32Array(n * 3), col = new THREE.Color(color);
  for (let i = 0; i < n; i++) col.toArray(c, i * 3);
  flat.setAttribute('color', new THREE.BufferAttribute(c, 3));
  if (flat.getAttribute('uv')) flat.deleteAttribute('uv');
  return flat;
}
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0);
const ground = (x, z) => heightAt(x, z);

// A flat disc of tar for parking, draped on the slope.
function pad(parts, x, z, r, color = '#4a4a4c') {
  const segs = 20, geo = new THREE.BufferGeometry(), pos = [];
  for (let i = 0; i < segs; i++) {
    const a = (i / segs) * Math.PI * 2, b = ((i + 1) / segs) * Math.PI * 2;
    const pa = [x + Math.cos(a) * r, z + Math.sin(a) * r], pb = [x + Math.cos(b) * r, z + Math.sin(b) * r];
    pos.push(x, ground(x, z) + 0.25, z, pb[0], ground(...pb) + 0.25, pb[1], pa[0], ground(...pa) + 0.25, pa[1]);
  }
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  parts.push(part(geo, color, 0, 0, 0));
}

// A dirt footpath draped on the hill along a list of world points.
function trail(parts, pts, width) {
  const pos = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const len = Math.hypot(bx - ax, bz - az) || 1, nx = (bz - az) / len * width / 2, nz = -(bx - ax) / len * width / 2;
    const q = [[ax - nx, az - nz], [ax + nx, az + nz], [bx + nx, bz + nz], [bx - nx, bz - nz]].map(([x, z]) => [x, ground(x, z) + 0.12, z]);
    pos.push(...q[0], ...q[2], ...q[1], ...q[0], ...q[3], ...q[2]);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  parts.push(part(geo, '#b59a6a', 0, 0, 0));
}

function bench(parts, x, z, ry) {
  const y = ground(x, z);
  parts.push(part(box(1.8, 0.12, 0.5), '#7a5a3a', x, y + 0.45, z, ry));
  parts.push(part(box(1.8, 0.45, 0.1).translate(0, 0.5, -0.22), '#7a5a3a', x, y, z, ry));
  for (const s of [-0.75, 0.75]) parts.push(part(box(0.1, 0.45, 0.4).translate(s, 0, 0), '#333', x, y, z, ry));
}

// A coin-op viewer on a post, pointed at the view.
function viewer(parts, colliders, x, z, ry) {
  const y = ground(x, z);
  parts.push(part(new THREE.CylinderGeometry(0.08, 0.12, 1.25, 6).translate(0, 0.62, 0), '#2a5d3a', x, y, z));
  parts.push(part(box(0.38, 0.32, 0.55).translate(0, 1.2, 0), '#2a5d3a', x, y, z, ry));
  for (const s of [-0.09, 0.09]) parts.push(part(new THREE.CylinderGeometry(0.06, 0.06, 0.2, 8).rotateX(Math.PI / 2).translate(s, 1.4, 0.32), '#111', x, y, z, ry));
  colliders.push({ minX: x - 0.25, maxX: x + 0.25, minZ: z - 0.25, maxZ: z + 0.25, top: y + 1.5 });
}

// Railing along a polyline of world points, posts every couple of metres.
function railing(parts, pts) {
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const len = Math.hypot(bx - ax, bz - az), ry = Math.atan2(bx - ax, bz - az);
    const mx = (ax + bx) / 2, mz = (az + bz) / 2;
    parts.push(part(box(0.08, 0.08, len), '#6b6f73', mx, Math.max(ground(ax, az), ground(bx, bz)) + 1.0, mz, ry));
    for (let d = 0; d <= len; d += 2) {
      const x = ax + ((bx - ax) * d) / len, z = az + ((bz - az) * d) / len;
      parts.push(part(box(0.08, 1.05, 0.08), '#6b6f73', x, ground(x, z), z));
    }
  }
}

// Signal Hill: a car park at the top of the road and a railed deck looking over the city and harbour.
function signalHill(parts, colliders) {
  const road = ROADS.find((r) => r.name === 'Signal Hill Road');
  const [sx, sz] = road.points[road.points.length - 1];
  pad(parts, sx, sz, 13);
  const dx = sx + 22, dz = sz - 6, w = 14, d = 9;
  const y = Math.max(ground(dx - w / 2, dz - d / 2), ground(dx + w / 2, dz - d / 2), ground(dx - w / 2, dz + d / 2), ground(dx + w / 2, dz + d / 2));
  const low = Math.min(ground(dx - w / 2, dz - d / 2), ground(dx + w / 2, dz + d / 2), ground(dx, dz));
  parts.push(part(box(w, y - low + 0.35, d), '#8a6a48', dx, low, dz));
  const top = y + 0.35;
  for (const [ax, az, bx, bz] of [[dx - w / 2, dz - d / 2, dx + w / 2, dz - d / 2], [dx + w / 2, dz - d / 2, dx + w / 2, dz + d / 2]]) {
    const len = Math.hypot(bx - ax, bz - az), ry = Math.atan2(bx - ax, bz - az);
    parts.push(part(box(0.08, 0.08, len), '#6b6f73', (ax + bx) / 2, top + 1, (az + bz) / 2, ry));
    for (let k = 0; k <= len; k += 2) parts.push(part(box(0.08, 1.05, 0.08), '#6b6f73', ax + ((bx - ax) * k) / len, top, az + ((bz - az) * k) / len));
  }
  colliders.push({ minX: dx - w / 2, maxX: dx + w / 2, minZ: dz - d / 2, maxZ: dz + d / 2, top });
  colliders.push({ minX: dx - w / 2, maxX: dx + w / 2, minZ: dz - d / 2 - 0.3, maxZ: dz - d / 2, top: top + 1.1 });
  colliders.push({ minX: dx + w / 2, maxX: dx + w / 2 + 0.3, minZ: dz - d / 2, maxZ: dz + d / 2, top: top + 1.1 });
  for (const [ox, oz] of [[-3.5, -3.2], [3.5, -3.2]]) {
    const x = dx + ox, z = dz + oz;
    parts.push(part(new THREE.CylinderGeometry(0.08, 0.12, 1.25, 6).translate(0, 0.62, 0), '#2a5d3a', x, top, z));
    parts.push(part(box(0.38, 0.32, 0.55).translate(0, 1.2, 0), '#2a5d3a', x, top, z, Math.PI * 0.85));
  }
  bench(parts, dx - 2, dz + 2.5, Math.PI);
  bench(parts, dx + 2, dz + 2.5, Math.PI);
  return { name: 'Signal Hill lookout', x: dx, z: dz, pad: { x: sx, z: sz }, walk: { x0: dx - w / 2 + 1, x1: dx + w / 2 - 1, z0: dz - d / 2 + 1, z1: dz + d / 2 - 1 } };
}

// Lion's Head: a trailhead car park off Kloof Road and a path spiralling up round the dome to a railed summit.
function lionsHead(parts, colliders) {
  const road = ROADS.find((r) => r.name === 'Kloof Road');
  const [rx, rz] = road.points[1];
  const cx = toWorld(-1460), cz = toWorld(1045);
  const toTop = Math.hypot(cx - rx, cz - rz);
  const head = { x: rx + ((cx - rx) / toTop) * 16, z: rz + ((cz - rz) / toTop) * 16 };
  pad(parts, head.x, head.z, 10, '#8a7a5c');
  const signY = ground(head.x + 6, head.z);
  parts.push(part(box(0.15, 2.2, 0.15), '#5a4030', head.x + 6, signY, head.z));
  parts.push(part(box(1.6, 0.7, 0.1).translate(0, 1.8, 0), '#2a5d3a', head.x + 6, signY, head.z, Math.atan2(cx - head.x, cz - head.z)));

  // One and a quarter turns round the summit, closing in as it climbs.
  const r0 = Math.hypot(head.x - cx, head.z - cz), a0 = Math.atan2(head.z - cz, head.x - cx);
  const pts = [];
  const steps = 90;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, r = Math.max(5, r0 * (1 - t) ** 0.85), a = a0 - t * Math.PI * 2.5;
    pts.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]);
  }
  trail(parts, pts, 2.4);

  const top = ground(cx, cz);
  parts.push(part(box(1, 1.3, 1), '#f2efe6', cx, top - 0.2, cz));
  parts.push(part(new THREE.CylinderGeometry(0.05, 0.05, 6, 5).translate(0, 3, 0), '#cfcfcf', cx + 2.5, top, cz));
  parts.push(part(box(0.05, 0.9, 1.4).translate(0, 5.2, 0.7), '#e67e22', cx + 2.5, top, cz));
  colliders.push({ minX: cx - 0.5, maxX: cx + 0.5, minZ: cz - 0.5, maxZ: cz + 0.5, top: top + 1.1 });
  const ring = [];
  for (let i = 0; i <= 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    if (Math.abs(Math.atan2(Math.sin(a - a0 - Math.PI * 2.5), Math.cos(a - a0 - Math.PI * 2.5))) < 0.35) {
      if (ring.length > 1) railing(parts, ring.splice(0));
      ring.length = 0;
      continue;
    }
    ring.push([cx + Math.cos(a) * 9, cz + Math.sin(a) * 9]);
  }
  if (ring.length > 1) railing(parts, ring);
  bench(parts, cx - 3, cz + 3, Math.PI * 0.25);
  bench(parts, cx + 3, cz - 3, Math.PI * 1.25);
  viewer(parts, colliders, cx - 4, cz - 4, Math.PI * 1.75);
  return {
    trailhead: { name: "Lion's Head trailhead", x: head.x, z: head.z },
    summit: { name: "Lion's Head summit", x: cx, z: cz },
    path: pts,
    walk: { x0: cx - 6, x1: cx + 6, z0: cz - 6, z1: cz + 6 },
  };
}

export function createLookouts(scene, colliders) {
  const parts = [];
  const signal = signalHill(parts, colliders);
  const lion = lionsHead(parts, colliders);
  const mesh = new THREE.Mesh(mergeGeometries(parts), new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  mesh.castShadow = mesh.receiveShadow = true;
  scene.add(mesh);
  // Ground kept free of trees: the car parks, the deck, the summit and the length of the trail.
  const spots = [[signal.pad, 15], [{ x: signal.x, z: signal.z }, 12], [lion.trailhead, 12], [lion.summit, 13]];
  const keepClear = (x, z) => spots.some(([p, r]) => Math.hypot(x - p.x, z - p.z) < r)
    || lion.path.some(([px, pz]) => Math.abs(x - px) < 5 && Math.abs(z - pz) < 5);
  return { signal, lion, keepClear, walkRects: [signal.walk, lion.walk] };
}
