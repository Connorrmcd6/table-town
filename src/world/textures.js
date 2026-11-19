import * as THREE from 'three';

function canvas(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function speckle(ctx, w, h, count, colors, size = 2) {
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = colors[(Math.random() * colors.length) | 0];
    ctx.fillRect(Math.random() * w, Math.random() * h, size, size);
  }
}

export function asphaltTexture() {
  return canvas(128, 256, (ctx, w, h) => {
    ctx.fillStyle = '#4a4744';
    ctx.fillRect(0, 0, w, h);
    speckle(ctx, w, h, 2500, ['#3e3b39', '#56524e', '#47433f', '#5c5853']);
    ctx.fillStyle = '#d8d2c0';
    ctx.fillRect(w / 2 - 2, 0, 4, h * 0.45);
    ctx.fillStyle = '#c9c3b2';
    ctx.fillRect(6, 0, 3, h);
    ctx.fillRect(w - 9, 0, 3, h);
  });
}

export function plainAsphaltTexture() {
  return canvas(64, 64, (ctx, w, h) => {
    ctx.fillStyle = '#4a4744';
    ctx.fillRect(0, 0, w, h);
    speckle(ctx, w, h, 700, ['#3e3b39', '#56524e', '#47433f', '#5c5853']);
  });
}

export function cobbleTexture() {
  return canvas(128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#5d554c';
    ctx.fillRect(0, 0, w, h);
    const s = 10;
    for (let y = 0; y < h; y += s) {
      const off = ((y / s) % 2) * (s / 2);
      for (let x = -s; x < w; x += s) {
        const v = 110 + Math.random() * 40;
        ctx.fillStyle = `rgb(${v},${v * 0.92},${v * 0.82})`;
        ctx.fillRect(x + off + 1, y + 1, s - 2, s - 2);
      }
    }
  });
}

export function sidewalkTexture() {
  return canvas(64, 64, (ctx, w, h) => {
    ctx.fillStyle = '#a49c90';
    ctx.fillRect(0, 0, w, h);
    speckle(ctx, w, h, 400, ['#9a9286', '#aea699', '#968e82']);
    ctx.strokeStyle = '#8a8276';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
  });
}

export function officeTextures() {
  const lit = [];
  for (let i = 0; i < 16; i++) lit.push(Math.random() < 0.55);
  const draw = (night) => (ctx, w, h) => {
    ctx.fillStyle = night ? '#000' : '#ffffff';
    ctx.fillRect(0, 0, w, h);
    const cell = w / 4;
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        const x = c * cell, y = r * cell;
        if (night) {
          ctx.fillStyle = lit[r * 4 + c] ? '#ffcf7a' : '#000';
        } else {
          const g = 60 + Math.random() * 25;
          ctx.fillStyle = `rgb(${g},${g + 12},${g + 28})`;
        }
        ctx.fillRect(x + cell * 0.12, y + cell * 0.18, cell * 0.76, cell * 0.62);
      }
    }
  };
  const map = canvas(128, 128, draw(false));
  const emissive = canvas(128, 128, draw(true));
  return { map, emissive };
}

export function houseFacadeTexture() {
  return canvas(128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#f2efe8';
    ctx.fillRect(0, h * 0.86, w, h * 0.14);
    ctx.fillStyle = '#6b4424';
    ctx.fillRect(w * 0.14, h * 0.34, w * 0.2, h * 0.52);
    ctx.fillStyle = '#3c2814';
    ctx.fillRect(w * 0.16, h * 0.36, w * 0.16, h * 0.08);
    ctx.fillStyle = '#efeadf';
    ctx.fillRect(w * 0.52, h * 0.3, w * 0.32, h * 0.38);
    ctx.fillStyle = '#556773';
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 2; c++) {
        ctx.fillRect(w * (0.55 + c * 0.145), h * (0.33 + r * 0.115), w * 0.12, h * 0.095);
      }
    }
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h * 0.06);
  });
}

export function plainTexture() {
  return canvas(16, 16, (ctx, w, h) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
  });
}
