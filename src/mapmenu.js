import * as THREE from 'three';
import { heightAt, isBeach, w as toWorld } from './world/heightmap.js';

export const BOUNDS = { x0: toWorld(-2500), x1: toWorld(2400), z0: toWorld(-2950), z1: toWorld(2750) };
const TERRAIN_RES = 5;
const ARRIVE = 22;

const KINDS = {
  hospital: { color: '#e23b3b', glyph: '+' },
  police: { color: '#2f6bff', glyph: 'P' },
  cable: { color: '#c0392b', glyph: 'C' },
  beach: { color: '#f2c230', glyph: 'B' },
  view: { color: '#27ae60', glyph: 'V' },
  place: { color: '#9b59b6', glyph: '•' },
  shop: { color: '#e67e22', glyph: '$' },
  pin: { color: '#ffd84a', glyph: '' },
};

// Shaded relief of the whole map, drawn once into an offscreen canvas the first time the map opens.
function terrainImage() {
  const w = Math.round((BOUNDS.x1 - BOUNDS.x0) / TERRAIN_RES), h = Math.round((BOUNDS.z1 - BOUNDS.z0) / TERRAIN_RES);
  const heights = new Float32Array(w * h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) heights[j * w + i] = heightAt(BOUNDS.x0 + i * TERRAIN_RES, BOUNDS.z0 + j * TERRAIN_RES);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  const sea = [44, 104, 128], deep = [30, 78, 104], sand = [222, 199, 146], grass = [148, 165, 92], fynbos = [140, 140, 98], rock = [176, 156, 128];
  const mix = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const x = BOUNDS.x0 + i * TERRAIN_RES, z = BOUNDS.z0 + j * TERRAIN_RES;
      const y = heights[j * w + i];
      let col;
      if (y < 0) col = mix(sea, deep, Math.min(1, -y / 12));
      else if (y < 3.5 || (y < 4.5 && isBeach(x, z))) col = sand;
      else {
        col = mix(grass, fynbos, Math.min(1, y / 260));
        if (y > 300) col = mix(col, rock, Math.min(1, (y - 300) / 250));
        const shade = (heights[Math.max(0, j - 1) * w + Math.max(0, i - 1)] - y) / TERRAIN_RES;
        col = col.map((v) => v * (1 + Math.max(-0.35, Math.min(0.35, shade * 0.5))));
      }
      const k = (j * w + i) * 4;
      img.data[k] = col[0];
      img.data[k + 1] = col[1];
      img.data[k + 2] = col[2];
      img.data[k + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function beacon(scene) {
  const g = new THREE.Group();
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(1.4, 1.4, 260, 12, 1, true).translate(0, 130, 0),
    new THREE.MeshBasicMaterial({ color: '#ffd84a', transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
  );
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(4, 5.2, 32).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: '#ffd84a', transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide }),
  );
  ring.position.y = 0.4;
  g.add(beam, ring);
  g.visible = false;
  scene.add(g);
  return g;
}

// Pause menu with a full map (click a place, or anywhere, to set a waypoint) and the controls list.
export function createMapMenu({ scene, getPlayer, getCops, getRoads, pois, onOpen, onClose }) {
  const root = document.getElementById('menu');
  const canvas = document.getElementById('mapcanvas');
  const ctx = canvas.getContext('2d');
  const tabs = [...root.querySelectorAll('[data-tab]')];
  const panes = { map: document.getElementById('mappane'), controls: document.getElementById('controlspane') };
  const info = document.getElementById('mapinfo');
  const list = document.getElementById('poilist');
  const beam = beacon(scene);
  const terrain = terrainImage();
  let open = false, tab = 'map';
  const view = { cx: 0, cz: 0, scale: 0.4 };
  let drag = null, hover = null;
  let waypoint = null;

  for (const p of pois) {
    const li = document.createElement('li');
    li.innerHTML = `<i style="background:${KINDS[p.kind].color}">${KINDS[p.kind].glyph}</i>${p.name}`;
    li.addEventListener('click', () => {
      setWaypoint(p);
      view.cx = p.x;
      view.cz = p.z;
    });
    p.li = li;
    list.appendChild(li);
  }

  const toScreen = (x, z) => [(x - view.cx) * view.scale + canvas.width / 2, (z - view.cz) * view.scale + canvas.height / 2];
  const toWorldPt = (sx, sy) => [(sx - canvas.width / 2) / view.scale + view.cx, (sy - canvas.height / 2) / view.scale + view.cz];

  function setWaypoint(p) {
    if (waypoint && p && Math.hypot(waypoint.x - p.x, waypoint.z - p.z) < 1) p = null;
    waypoint = p ? { x: p.x, z: p.z, name: p.name } : null;
    beam.visible = !!waypoint;
    if (waypoint) beam.position.set(waypoint.x, heightAt(waypoint.x, waypoint.z), waypoint.z);
    for (const q of pois) q.li.classList.toggle('on', !!waypoint && q.x === waypoint.x && q.z === waypoint.z);
  }

  function poiAt(sx, sy) {
    let best = null, bestD = 16;
    for (const p of pois) {
      const [px, py] = toScreen(p.x, p.z);
      const d = Math.hypot(px - sx, py - sy);
      if (d < bestD) { bestD = d; best = p; }
    }
    return best;
  }

  const pos = (e) => {
    const r = canvas.getBoundingClientRect();
    return [(e.clientX - r.left) * (canvas.width / r.width), (e.clientY - r.top) * (canvas.height / r.height)];
  };
  canvas.addEventListener('mousedown', (e) => {
    const [sx, sy] = pos(e);
    drag = { sx, sy, cx: view.cx, cz: view.cz, moved: false, button: e.button };
  });
  window.addEventListener('mousemove', (e) => {
    if (!open) return;
    const [sx, sy] = pos(e);
    if (drag) {
      if (Math.hypot(sx - drag.sx, sy - drag.sy) > 4) drag.moved = true;
      view.cx = drag.cx - (sx - drag.sx) / view.scale;
      view.cz = drag.cz - (sy - drag.sy) / view.scale;
    }
    hover = poiAt(sx, sy);
    canvas.style.cursor = drag?.moved ? 'grabbing' : hover ? 'pointer' : 'crosshair';
  });
  window.addEventListener('mouseup', (e) => {
    if (!open || !drag) return;
    const d = drag;
    drag = null;
    if (d.moved) return;
    if (d.button === 2) {
      setWaypoint(null);
      return;
    }
    const [sx, sy] = pos(e);
    const p = poiAt(sx, sy);
    if (p) setWaypoint(p);
    else {
      const [x, z] = toWorldPt(sx, sy);
      setWaypoint({ x, z, name: 'Waypoint' });
    }
  });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const [sx, sy] = pos(e);
    const [wx, wz] = toWorldPt(sx, sy);
    view.scale = Math.max(0.12, Math.min(3, view.scale * Math.exp(-e.deltaY * 0.0015)));
    view.cx = wx - (sx - canvas.width / 2) / view.scale;
    view.cz = wz - (sy - canvas.height / 2) / view.scale;
  }, { passive: false });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  function showTab(name) {
    tab = name;
    for (const t of tabs) t.classList.toggle('on', t.dataset.tab === name);
    for (const [k, el] of Object.entries(panes)) el.classList.toggle('show', k === name);
  }
  for (const t of tabs) t.addEventListener('click', () => showTab(t.dataset.tab));
  document.getElementById('resume').addEventListener('click', () => close());

  function show(which = 'map') {
    if (open) return;
    open = true;
    const p = getPlayer();
    view.cx = p.pos.x;
    view.cz = p.pos.z;
    root.classList.add('show');
    document.body.classList.add('paused');
    showTab(which);
    onOpen?.();
  }

  function close() {
    if (!open) return;
    open = false;
    drag = null;
    root.classList.remove('show');
    document.body.classList.remove('paused');
    onClose?.();
  }

  function draw() {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(r.width * dpr) || canvas.height !== Math.round(r.height * dpr)) {
      canvas.width = Math.round(r.width * dpr);
      canvas.height = Math.round(r.height * dpr);
    }
    ctx.fillStyle = '#1e4e68';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const [tx, ty] = toScreen(BOUNDS.x0, BOUNDS.z0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(terrain, tx, ty, (BOUNDS.x1 - BOUNDS.x0) * view.scale, (BOUNDS.z1 - BOUNDS.z0) * view.scale);

    ctx.lineCap = 'round';
    for (const pass of [0, 1]) {
      for (const s of getRoads()) {
        const [ax, ay] = toScreen(s.ax, s.az), [bx, by] = toScreen(s.bx, s.bz);
        if (Math.max(ax, bx) < -20 || Math.min(ax, bx) > canvas.width + 20 || Math.max(ay, by) < -20 || Math.min(ay, by) > canvas.height + 20) continue;
        ctx.strokeStyle = pass ? (s.road.route ? '#f6e7b8' : '#e8e8e8') : 'rgba(0,0,0,0.45)';
        ctx.lineWidth = Math.max(pass ? 1.2 : 2.6, s.half * 2 * view.scale + (pass ? 0 : 2));
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.stroke();
      }
    }

    const font = Math.round(12 * Math.min(2, canvas.width / 900 + 0.4));
    ctx.font = `600 ${font}px Oswald, sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    for (const p of pois) {
      const [px, py] = toScreen(p.x, p.z);
      const k = KINDS[p.kind];
      const big = p === hover || (waypoint && waypoint.x === p.x && waypoint.z === p.z);
      ctx.fillStyle = k.color;
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px, py, big ? 11 : 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.fillText(k.glyph, px, py + 1);
      if (view.scale > 0.22 || big) {
        ctx.textAlign = 'left';
        ctx.strokeStyle = 'rgba(0,0,0,0.85)';
        ctx.lineWidth = 3;
        ctx.strokeText(p.name, px + 13, py);
        ctx.fillStyle = '#fff';
        ctx.fillText(p.name, px + 13, py);
      }
    }

    if (waypoint) {
      const [wx, wy] = toScreen(waypoint.x, waypoint.z);
      ctx.fillStyle = '#ffd84a';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(wx, wy);
      ctx.lineTo(wx - 9, wy - 18);
      ctx.lineTo(wx + 9, wy - 18);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    const blink = Math.floor(performance.now() / 300) % 2;
    for (const c of getCops()) {
      const [cx, cy] = toScreen(c.pos.x, c.pos.z);
      ctx.fillStyle = blink ? '#ff3030' : '#3060ff';
      ctx.fillRect(cx - 4, cy - 4, 8, 8);
    }

    const p = getPlayer();
    const [px, py] = toScreen(p.pos.x, p.pos.z);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(Math.PI - p.heading);
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(0, -13);
    ctx.lineTo(-9, 10);
    ctx.lineTo(0, 5);
    ctx.lineTo(9, 10);
    ctx.closePath();
    ctx.stroke();
    ctx.fill();
    ctx.restore();

    const d = waypoint ? Math.hypot(waypoint.x - p.pos.x, waypoint.z - p.pos.z) : 0;
    info.textContent = waypoint
      ? `Waypoint: ${waypoint.name} - ${d > 1000 ? `${(d / 1000).toFixed(1)} km` : `${Math.round(d)} m`}  ·  right-click to clear`
      : 'Click a place or anywhere on the map to set a waypoint';
  }

  // Waypoint upkeep while playing: clears on arrival; returns what the HUD should show.
  function track(pos, dt) {
    if (!waypoint) return null;
    beam.children[1].rotation.y += dt;
    const d = Math.hypot(waypoint.x - pos.x, waypoint.z - pos.z);
    if (d < ARRIVE) {
      const name = waypoint.name;
      setWaypoint(null);
      return { arrived: name };
    }
    return { ...waypoint, dist: d };
  }

  return {
    terrain,
    get isOpen() { return open; },
    get tab() { return tab; },
    get waypoint() { return waypoint; },
    show, close, draw, track,
  };
}
