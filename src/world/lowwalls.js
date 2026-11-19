import * as THREE from 'three';
import { heightAt } from './heightmap.js';

const WALL_COLOURS = ['#efe9dc', '#e6dcc4', '#b5653f', '#a35a3a', '#c9c3b6', '#9a9a92', '#e8d8b0'];
const PLANTER = '#b9b3a6', HEDGE = '#3f6a2c';
const THICK = 0.25, SEGMENT = 3, GATE = 2.4;

// One straight piece of wall from (ax, az) to (bx, bz): follows the ground at its middle, collider top for climbing.
function wallPiece(builder, colliders, ax, az, bx, bz, height, thick, color) {
  const cx = (ax + bx) / 2, cz = (az + bz) / 2;
  const len = Math.hypot(bx - ax, bz - az);
  const alongX = Math.abs(bx - ax) > Math.abs(bz - az);
  const ground = heightAt(cx, cz);
  const base = Math.min(heightAt(ax, az), heightAt(bx, bz), ground) - 0.4;
  const top = ground + height;
  const w = alongX ? len : thick, d = alongX ? thick : len;
  builder.box(cx, base, cz, w, top - base, d, color, null);
  builder.box(cx, top, cz, w + 0.06, 0.08, d + 0.06, color.clone().multiplyScalar(0.82), null);
  colliders.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2, top: top + 0.08 });
}

// Garden walls around a rectangle, split into terrain-following pieces with gate gaps.
export function boundaryWalls(builder, colliders, rand, rect, { isClear = () => true, low = false } = {}) {
  const height = low ? 0.55 + rand() * 0.2 : 1.0 + rand() * 0.75;
  const color = new THREE.Color(WALL_COLOURS[Math.floor(rand() * WALL_COLOURS.length)]);
  const { x0, x1, z0, z1 } = rect;
  const edges = [[x0, z0, x1, z0], [x1, z0, x1, z1], [x1, z1, x0, z1], [x0, z1, x0, z0]];
  for (const [ax, az, bx, bz] of edges) {
    const len = Math.hypot(bx - ax, bz - az);
    const dx = (bx - ax) / len, dz = (bz - az) / len;
    let t = 0, sinceGate = 0;
    const gateEvery = 2 + Math.floor(rand() * 2);
    while (t < len - 0.5) {
      if (sinceGate >= gateEvery && t > 3 && t < len - 3) {
        t += GATE;
        sinceGate = 0;
        continue;
      }
      const end = Math.min(len, t + SEGMENT);
      const pax = ax + dx * t, paz = az + dz * t, pbx = ax + dx * end, pbz = az + dz * end;
      if (isClear(pax, paz) && isClear(pbx, pbz)) wallPiece(builder, colliders, pax, paz, pbx, pbz, height, THICK, color);
      t = end;
      sinceGate++;
    }
  }
}

// True when (x, z) is clear of every footprint (expanded by pad), so walls fill the gaps between houses, not their fronts.
export function clearOf(footprints, pad) {
  return (x, z) => !footprints.some((f) => x > f.x0 - pad && x < f.x1 + pad && z > f.z0 - pad && z < f.z1 + pad);
}

// Concrete planters with a hedge, and the odd low wall, along the inside of a pavement strip.
export function planters(builder, colliders, rand, rect, inset) {
  const box = new THREE.Color(PLANTER), hedge = new THREE.Color(HEDGE);
  const { x0, x1, z0, z1 } = rect;
  const sides = [
    [x0 + 5, z0 + inset, x1 - 5, z0 + inset], [x0 + 5, z1 - inset, x1 - 5, z1 - inset],
    [x0 + inset, z0 + 5, x0 + inset, z1 - 5], [x1 - inset, z0 + 5, x1 - inset, z1 - 5],
  ];
  for (const [ax, az, bx, bz] of sides) {
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 4) continue;
    const dx = (bx - ax) / len, dz = (bz - az) / len;
    for (let t = 2 + rand() * 6; t < len - 2; t += 10 + rand() * 6) {
      const cx = ax + dx * t, cz = az + dz * t;
      const alongX = Math.abs(dx) > 0.5;
      if (rand() < 0.3) {
        const half = 2;
        wallPiece(builder, colliders, cx - dx * half, cz - dz * half, cx + dx * half, cz + dz * half, 1.15 + rand() * 0.4, 0.35, box);
        continue;
      }
      const ground = heightAt(cx, cz);
      const w = alongX ? 2.6 : 0.9, d = alongX ? 0.9 : 2.6;
      builder.box(cx, ground - 0.3, cz, w, 0.95, d, box, null);
      builder.box(cx, ground + 0.65, cz, w - 0.2, 0.2, d - 0.2, hedge, null);
      colliders.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2, top: ground + 0.85 });
    }
  }
}
