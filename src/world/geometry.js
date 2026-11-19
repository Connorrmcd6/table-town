import * as THREE from 'three';

const FACES = [
  { n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] },
  { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
  { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
  { n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0] },
  { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1] },
  { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
];

export class MeshBuilder {
  constructor() {
    this.pos = [];
    this.nor = [];
    this.uv = [];
    this.col = [];
    this.idx = [];
  }

  quad(corners, normal, uvs, color) {
    const base = this.pos.length / 3;
    for (let i = 0; i < 4; i++) {
      this.pos.push(...corners[i]);
      this.nor.push(...normal);
      this.uv.push(...uvs[i]);
      this.col.push(color.r, color.g, color.b);
    }
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  // faceUV(faceIndex, width, height) -> [u0, v0, u1, v1] or null for flatUV
  box(cx, y0, cz, w, h, d, color, faceUV, flatUV = [0.02, 0.5]) {
    const half = [w / 2, h / 2, d / 2];
    const center = [cx, y0 + h / 2, cz];
    const size = [w, h, d];
    FACES.forEach((f, fi) => {
      const corners = [];
      const sx = [-1, 1, 1, -1], sy = [-1, -1, 1, 1];
      for (let i = 0; i < 4; i++) {
        const p = [0, 1, 2].map(
          (a) => center[a] + f.n[a] * half[a] + f.u[a] * sx[i] * half[a] + f.v[a] * sy[i] * half[a]
        );
        corners.push(p);
      }
      const fw = Math.abs(f.u[0]) * size[0] + Math.abs(f.u[1]) * size[1] + Math.abs(f.u[2]) * size[2];
      const fh = Math.abs(f.v[0]) * size[0] + Math.abs(f.v[1]) * size[1] + Math.abs(f.v[2]) * size[2];
      const r = faceUV ? faceUV(fi, fw, fh) : null;
      const uvs = r
        ? [[r[0], r[1]], [r[2], r[1]], [r[2], r[3]], [r[0], r[3]]]
        : [flatUV, flatUV, flatUV, flatUV];
      this.quad(corners, f.n, uvs, color);
    });
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    return g;
  }
}

export const FACE = { PX: 0, NX: 1, PZ: 2, NZ: 3, TOP: 4, BOTTOM: 5 };
