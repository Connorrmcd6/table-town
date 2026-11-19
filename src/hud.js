import { ROADS } from './world/city.js';
import { w as toWorld } from './world/heightmap.js';

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const money = $('money'), clock = $('clock'), speedo = $('speed'), district = $('district'), notice = $('notice'), subtitle = $('subtitle');
  const radar = $('radar');
  const street = $('street');
  const healthFill = $('healthfill'), wanted = $('wanted'), promptEl = $('prompt'), big = $('bigtext');
  const stars = [...wanted.children];
  let lastStars = -1, lastPrompt = null;
  const rctx = radar.getContext('2d');
  let districtTimer = 0, noticeTimer = 0, subtitleTimer = 0, lastDistrict = '';

  function update(dt, { cash, minutes, kmh, area, road }) {
    if (street.textContent !== road) street.textContent = road;
    money.textContent = `R${String(Math.floor(cash)).padStart(8, '0')}`;
    const h = Math.floor(minutes / 60) % 24, m = Math.floor(minutes % 60);
    clock.textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    speedo.textContent = kmh === null ? '' : `${Math.round(kmh)} km/h`;
    if (area !== lastDistrict) {
      lastDistrict = area;
      district.textContent = area;
      district.classList.add('show');
      districtTimer = 3.5;
    }
    districtTimer -= dt;
    if (districtTimer <= 0) district.classList.remove('show');
    noticeTimer -= dt;
    if (noticeTimer <= 0) notice.classList.remove('show');
    subtitleTimer -= dt;
    if (subtitleTimer <= 0) subtitle.classList.remove('show');
  }

  function notify(text, seconds = 3) {
    notice.textContent = text;
    notice.classList.add('show');
    noticeTimer = seconds;
  }

  function say(text, seconds = 2.5) {
    subtitle.textContent = text;
    subtitle.classList.add('show');
    subtitleTimer = seconds;
  }

  function status({ health, stars: n, seen }) {
    healthFill.style.width = `${Math.max(0, health)}%`;
    if (n !== lastStars) {
      stars.forEach((s, i) => s.classList.toggle('on', i < n));
      lastStars = n;
    }
    wanted.classList.toggle('flash', n > 0 && !seen);
  }

  function prompt(text) {
    if (text === lastPrompt) return;
    lastPrompt = text;
    promptEl.textContent = text || '';
    promptEl.classList.toggle('show', !!text);
  }

  function bigText(text, color) {
    big.textContent = text || '';
    big.style.color = color || '#fff';
    big.classList.toggle('show', !!text);
  }

  function drawRadar(player, cars, cops = []) {
    const W = radar.width, R = W / 2, scale = 0.6;
    rctx.save();
    rctx.clearRect(0, 0, W, W);
    rctx.beginPath();
    rctx.arc(R, R, R - 2, 0, Math.PI * 2);
    rctx.fillStyle = 'rgba(40, 60, 50, 0.78)';
    rctx.fill();
    rctx.clip();
    rctx.translate(R, R);
    rctx.rotate(player.heading - Math.PI);
    rctx.scale(scale, scale);
    rctx.translate(-player.pos.x, -player.pos.z);
    rctx.fillStyle = '#4a90e2';
    rctx.fillRect(-4000, toWorld(-600) - 4000, 8000, 4000);
    rctx.lineCap = 'round';
    for (const road of ROADS) {
      if (!road.bbox) {
        const xs = road.points.map((p) => p[0]), zs = road.points.map((p) => p[1]);
        road.bbox = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
      }
      const [bx0, bx1, bz0, bz1] = road.bbox;
      if (bx1 < player.pos.x - 300 || bx0 > player.pos.x + 300 || bz1 < player.pos.z - 300 || bz0 > player.pos.z + 300) continue;
      rctx.strokeStyle = road.surface === 'cobble' ? '#c9b48a' : '#d6d6d6';
      rctx.lineWidth = road.width;
      rctx.beginPath();
      road.points.forEach(([x, z], i) => (i ? rctx.lineTo(x, z) : rctx.moveTo(x, z)));
      rctx.stroke();
    }
    for (const c of cars) {
      rctx.fillStyle = c.model.type === 'police' ? '#3060ff' : '#e0c050';
      rctx.fillRect(c.pos.x - 3, c.pos.z - 3, 6, 6);
    }
    const blink = Math.floor(performance.now() / 250) % 2;
    for (const c of cops) {
      rctx.fillStyle = blink ? '#ff3030' : '#3060ff';
      rctx.fillRect(c.pos.x - 5, c.pos.z - 5, 10, 10);
    }
    rctx.restore();
    rctx.fillStyle = '#fff';
    rctx.beginPath();
    rctx.moveTo(R, R - 8);
    rctx.lineTo(R - 6, R + 7);
    rctx.lineTo(R + 6, R + 7);
    rctx.closePath();
    rctx.fill();
    rctx.fillStyle = '#fff';
    rctx.font = 'bold 13px sans-serif';
    rctx.textAlign = 'center';
    rctx.fillText('N', R - Math.sin(player.heading) * (R - 12), R + Math.cos(player.heading) * (R - 12) + 4);
    rctx.lineWidth = 3;
    rctx.strokeStyle = '#111';
    rctx.beginPath();
    rctx.arc(R, R, R - 2, 0, Math.PI * 2);
    rctx.stroke();
  }

  return { update, notify, say, drawRadar, status, prompt, bigText };
}

const NAMED = () => ROADS.filter((r) => r.name);
let named = null;

export function streetAt(x, z) {
  named = named || NAMED();
  let best = null, bestD = Infinity;
  for (const r of named) {
    for (let i = 0; i < r.points.length - 1; i++) {
      const [ax, az] = r.points[i], [bx, bz] = r.points[i + 1];
      const dx = bx - ax, dz = bz - az;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
      const d = Math.hypot(x - ax - dx * t, z - az - dz * t) - r.width / 2;
      if (d < bestD) { bestD = d; best = r.name; }
    }
  }
  return bestD < 3 ? best : '';
}
