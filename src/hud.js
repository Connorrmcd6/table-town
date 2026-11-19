import { ROADS } from './world/city.js';

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const money = $('money'), clock = $('clock'), speedo = $('speed'), district = $('district'), notice = $('notice'), subtitle = $('subtitle');
  const radar = $('radar');
  const rctx = radar.getContext('2d');
  let districtTimer = 0, noticeTimer = 0, subtitleTimer = 0, lastDistrict = '';

  function update(dt, { cash, minutes, kmh, area }) {
    money.textContent = `R${String(Math.floor(cash)).padStart(8, '0')}`;
    const h = Math.floor(minutes / 60) % 24, m = Math.floor(minutes % 60);
    clock.textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    speedo.textContent = `${Math.round(kmh)} km/h`;
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

  function drawRadar(player, cars) {
    const W = radar.width, R = W / 2, scale = 0.45;
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
    rctx.fillRect(-4000, -4600, 8000, 4000);
    rctx.lineCap = 'round';
    for (const road of ROADS) {
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

  return { update, notify, say, drawRadar };
}
