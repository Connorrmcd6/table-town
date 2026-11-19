// Usage: node scripts/optimize-model.mjs <in.glb> <out.glb> [ratio=0.1] [error=0.02]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { flatten, join, weld, simplify, dedup, prune } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';

const [input, output, ratio = '0.1', error = '0.02'] = process.argv.slice(2);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(input);

// SketchUp-style exports add edge lines, invisible (alpha 0) faces and back-to-back face pairs; drop them all,
// and drop normals so weld can close hard edges and simplify can actually collapse the mesh.
for (const mesh of doc.getRoot().listMeshes()) {
  for (const prim of mesh.listPrimitives()) {
    const material = prim.getMaterial();
    if (prim.getMode() !== 4 || (material && material.getAlphaMode() === 'BLEND' && material.getAlpha() === 0)) {
      mesh.removePrimitive(prim);
      continue;
    }
    prim.setAttribute('NORMAL', null);
    if (!material?.getBaseColorTexture()) prim.setAttribute('TEXCOORD_0', null);
  }
}

await MeshoptSimplifier.ready;
await doc.transform(dedup(), flatten(), join(), weld(), dropBackToBackFaces());
await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio: Number(ratio), error: Number(error) }), prune());
await io.write(output, doc);

function dropBackToBackFaces() {
  return (document) => {
    const seen = new Set();
    let dropped = 0;
    // Decals share triangles with the panel under them, so textured faces claim a triangle first, smallest decal first.
    const textured = (p) => Number(!!p.getMaterial()?.getBaseColorTexture());
    const size = (p) => p.getIndices()?.getCount() ?? 0;
    const prims = document.getRoot().listMeshes().flatMap((m) => m.listPrimitives());
    prims.sort((a, b) => textured(b) - textured(a) || textured(a) * (size(a) - size(b)));
    for (const prim of prims) {
      const pos = prim.getAttribute('POSITION');
      const index = prim.getIndices();
      if (!index) continue;
      const key = (i) => pos.getElement(i, []).map((v) => v.toFixed(4)).join(',');
      const keep = [];
      for (let t = 0; t < index.getCount(); t += 3) {
        const tri = [index.getScalar(t), index.getScalar(t + 1), index.getScalar(t + 2)];
        const id = tri.map(key).sort().join('|');
        if (seen.has(id)) {
          dropped++;
          continue;
        }
        seen.add(id);
        keep.push(...tri);
      }
      index.setArray(new Uint32Array(keep));
    }
    console.log(`dropped ${dropped} back-to-back faces`);
  };
}
