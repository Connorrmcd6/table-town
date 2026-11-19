import * as THREE from 'three';
import { heightAt, fbm, isBeach, atlanticShore, w as toWorld, WORLD_SCALE as S } from './heightmap.js';

function axisLines(min, max, denseMin, denseMax, denseStep, sparseStep) {
  const lines = [];
  for (let v = min; v < denseMin; v += sparseStep) lines.push(v);
  for (let v = denseMin; v < denseMax; v += denseStep) lines.push(v);
  for (let v = denseMax; v <= max; v += sparseStep) lines.push(v);
  return lines;
}

const SAND = new THREE.Color('#d9c08c');
const GRASS = new THREE.Color('#93a356');
const FYNBOS = new THREE.Color('#8f9462');
const ROCK = new THREE.Color('#a8957c');
const CLIFF = new THREE.Color('#b8a088');
const SEABED = new THREE.Color('#6f7f6a');

export function createTerrain() {
  const xs = axisLines(-9000, 9000, toWorld(-2150), toWorld(1700), 6, 150);
  const zs = axisLines(-9000, 9000, toWorld(-950), toWorld(2700), 6, 150);
  const nx = xs.length, nz = zs.length;
  const pos = new Float32Array(nx * nz * 3);
  const col = new Float32Array(nx * nz * 3);
  const heights = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      const h = heightAt(xs[i], zs[j]);
      heights[k] = h;
      pos[k * 3] = xs[i];
      pos[k * 3 + 1] = h;
      pos[k * 3 + 2] = zs[j];
    }
  }
  const idx = new Uint32Array((nx - 1) * (nz - 1) * 6);
  let p = 0;
  for (let j = 0; j < nz - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
      idx[p++] = a; idx[p++] = c; idx[p++] = b;
      idx[p++] = b; idx[p++] = c; idx[p++] = d;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();
  const nor = geo.getAttribute('normal');
  const c = new THREE.Color();
  for (let k = 0; k < nx * nz; k++) {
    const h = heights[k];
    const slope = 1 - nor.getY(k);
    const x = pos[k * 3], z = pos[k * 3 + 2];
    const n = fbm(x * 0.02, z * 0.02, 3);
    const beach = isBeach(x, z);
    const seaboard = !beach && z > toWorld(-450) && x < atlanticShore(z) + toWorld(450);
    if (h < 0) c.copy(SEABED);
    else if (seaboard && h < 1.6) c.copy(ROCK).multiplyScalar(0.8);
    else if (h < (beach ? 4.5 : seaboard ? 0 : 3.5)) c.copy(SAND);
    else {
      c.copy(GRASS).lerp(FYNBOS, Math.min(1, h / (400 * S) + n * 0.5));
      if (slope > 0.25) c.lerp(ROCK, Math.min(1, (slope - 0.25) * 3));
      if (h > 650 * S && slope > 0.35) c.lerp(CLIFF, 0.8);
    }
    c.multiplyScalar(0.88 + n * 0.24);
    col[k * 3] = c.r;
    col[k * 3 + 1] = c.g;
    col[k * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  return mesh;
}
