const CELL = 40;
const STEP = 0.45;

// Height of a collider's walkable top at (x, z); Infinity for poles, trees and anything else you can't stand on.
export function surfaceY(b, x, z) {
  if (b.top === undefined) return Infinity;
  if (!b.gable) return b.top;
  const along = b.gable.alongX;
  const lo = along ? b.minZ : b.minX, hi = along ? b.maxZ : b.maxX, v = along ? z : x;
  const half = (hi - lo) / 2;
  return b.top + b.gable.rise * Math.max(0, 1 - Math.abs(v - (lo + half)) / half);
}

export class ColliderGrid {
  constructor(boxes) {
    this.cells = new Map();
    for (const b of boxes) {
      for (let cx = Math.floor(b.minX / CELL); cx <= Math.floor(b.maxX / CELL); cx++) {
        for (let cz = Math.floor(b.minZ / CELL); cz <= Math.floor(b.maxZ / CELL); cz++) {
          const key = cx * 100003 + cz;
          if (!this.cells.has(key)) this.cells.set(key, []);
          this.cells.get(key).push(b);
        }
      }
    }
  }

  boxesAt(x, z) {
    const list = this.cells.get(Math.floor(x / CELL) * 100003 + Math.floor(z / CELL));
    return list ? list.filter((b) => x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ) : [];
  }

  contains(x, z, y = -Infinity) {
    return this.boxesAt(x, z).some((b) => surfaceY(b, x, z) > y);
  }

  // Highest roof under (x, z) that something at height y can stand on, or -Infinity.
  surfaceAt(x, z, y) {
    let best = -Infinity;
    for (const b of this.boxesAt(x, z)) {
      const s = surfaceY(b, x, z);
      if (s <= y + STEP && s > best) best = s;
    }
    return best;
  }

  // A roof just ahead that is between minRise and maxRise above the feet: where to land after climbing it.
  climbTarget(x, z, fx, fz, feetY, minRise, maxRise) {
    for (const d of [0.5, 0.8, 1.1]) {
      const px = x + fx * d, pz = z + fz * d;
      for (const b of this.boxesAt(px, pz)) {
        const rise = surfaceY(b, px, pz) - feetY;
        if (rise < minRise || rise > maxRise) continue;
        const ix = Math.max(b.minX + 0.3, Math.min(b.maxX - 0.3, px + fx * 0.6));
        const iz = Math.max(b.minZ + 0.3, Math.min(b.maxZ - 0.3, pz + fz * 0.6));
        return { x: ix, z: iz, y: surfaceY(b, ix, iz), rise };
      }
    }
    return null;
  }

  // Pushes a circle out of any boxes taller than y; returns the summed push normal or null.
  resolveCircle(p, r, y = -Infinity) {
    let hit = null;
    const cx0 = Math.floor((p.x - r) / CELL), cx1 = Math.floor((p.x + r) / CELL);
    const cz0 = Math.floor((p.z - r) / CELL), cz1 = Math.floor((p.z + r) / CELL);
    const seen = new Set();
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cz = cz0; cz <= cz1; cz++) {
        const list = this.cells.get(cx * 100003 + cz);
        if (!list) continue;
        for (const b of list) {
          if (seen.has(b)) continue;
          seen.add(b);
          const qx = Math.max(b.minX, Math.min(p.x, b.maxX));
          const qz = Math.max(b.minZ, Math.min(p.z, b.maxZ));
          if (surfaceY(b, qx, qz) <= y + STEP) continue;
          let dx = p.x - qx, dz = p.z - qz;
          let d = Math.hypot(dx, dz);
          if (d >= r) continue;
          if (d < 1e-4) {
            const pen = [p.x - b.minX, b.maxX - p.x, p.z - b.minZ, b.maxZ - p.z];
            const k = pen.indexOf(Math.min(...pen));
            dx = [-1, 1, 0, 0][k];
            dz = [0, 0, -1, 1][k];
            d = 0;
            const push = pen[k] + r;
            p.x += dx * push;
            p.z += dz * push;
          } else {
            dx /= d;
            dz /= d;
            p.x += dx * (r - d);
            p.z += dz * (r - d);
          }
          hit = hit || { x: 0, z: 0 };
          hit.x += dx;
          hit.z += dz;
        }
      }
    }
    if (hit) {
      const l = Math.hypot(hit.x, hit.z) || 1;
      hit.x /= l;
      hit.z /= l;
    }
    return hit;
  }
}
