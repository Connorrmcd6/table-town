const CELL = 40;

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

  // Pushes a circle out of any boxes; returns the summed push normal or null.
  resolveCircle(p, r) {
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
