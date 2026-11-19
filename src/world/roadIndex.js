const CELL = 32;

// Spatial hash of road centre-line segments for fast "how far am I from a road" checks.
export function buildRoadIndex(roads) {
  const cells = new Map();
  const segs = [];
  for (const road of roads) {
    for (let i = 0; i < road.points.length - 1; i++) {
      const [ax, az] = road.points[i], [bx, bz] = road.points[i + 1];
      const seg = { ax, az, bx, bz, half: road.width / 2, road };
      segs.push(seg);
      const pad = seg.half + 2;
      for (let cx = Math.floor((Math.min(ax, bx) - pad) / CELL); cx <= Math.floor((Math.max(ax, bx) + pad) / CELL); cx++) {
        for (let cz = Math.floor((Math.min(az, bz) - pad) / CELL); cz <= Math.floor((Math.max(az, bz) + pad) / CELL); cz++) {
          const k = cx * 100003 + cz;
          if (!cells.has(k)) cells.set(k, []);
          cells.get(k).push(seg);
        }
      }
    }
  }

  const near = (x, z) => cells.get(Math.floor(x / CELL) * 100003 + Math.floor(z / CELL)) || [];

  // Distance from the point to the nearest road edge (negative = on the road), ignoring roads in `skip`.
  function clearance(x, z, skip = null) {
    let best = Infinity;
    for (const s of near(x, z)) {
      if (skip && skip.has(s.road)) continue;
      const dx = s.bx - s.ax, dz = s.bz - s.az;
      const t = Math.max(0, Math.min(1, ((x - s.ax) * dx + (z - s.az) * dz) / (dx * dx + dz * dz || 1)));
      best = Math.min(best, Math.hypot(x - s.ax - dx * t, z - s.az - dz * t) - s.half);
    }
    return best;
  }

  function junctions() {
    const out = [];
    for (const list of cells.values()) {
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const a = list[i], b = list[j];
          if (a.road === b.road) continue;
          const rx = a.bx - a.ax, rz = a.bz - a.az, sx = b.bx - b.ax, sz = b.bz - b.az;
          const den = rx * sz - rz * sx;
          if (Math.abs(den) < 1e-6) continue;
          const qx = b.ax - a.ax, qz = b.az - a.az;
          const t = (qx * sz - qz * sx) / den, u = (qx * rz - qz * rx) / den;
          if (t < -0.001 || t > 1.001 || u < -0.001 || u > 1.001) continue;
          const x = a.ax + rx * t, z = a.az + rz * t;
          if (out.some((p) => Math.abs(p.x - x) < 2 && Math.abs(p.z - z) < 2)) continue;
          out.push({ x, z, size: Math.max(a.half, b.half) * 2, roads: [a.road, b.road] });
        }
      }
    }
    return out;
  }

  return { clearance, junctions, segs };
}
