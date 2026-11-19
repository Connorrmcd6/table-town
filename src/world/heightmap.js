const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smoothstep = (a, b, v) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

function hash(x, z) {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function valueNoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z);
  const xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export function fbm(x, z, octaves = 4) {
  let sum = 0, amp = 1, freq = 1, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise(x * freq, z * freq) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return sum / norm;
}

export const CITY = { minX: -470, maxX: 510, minZ: -490, maxZ: 230 };

export function coastDistance(x, z) {
  const bay = z - (-600 + 60 * Math.sin(x * 0.003));
  const atlantic = x - (-1900 + 150 * Math.sin(z * 0.002));
  const quay = Math.min(z + 900, 1200 - x, x - 380);
  return Math.max(Math.min(bay, atlantic), quay);
}

function tableMountain(x, z) {
  const dz = 2500 - z;
  const dx = Math.max(-800 - x, x - 2000, 0);
  const d = Math.max(dz, 0) + dx;
  if (dz < 0 && dx === 0) return 1060;
  if (d < 120) return 1060 - (d / 120) * 350;
  return 710 * Math.pow(clamp(1 - (d - 120) / 1780, 0, 1), 1.8);
}

function lionsHead(x, z) {
  const r = Math.hypot(x + 1500, z - 1100);
  const t = clamp(1 - r / 1000, 0, 1);
  return 380 * Math.pow(t, 1.5) + 290 * Math.pow(clamp(1 - r / 260, 0, 1), 0.7);
}

function signalHill(x, z) {
  const dx = x + 1150, dz = z + 150;
  const u = dx * 0.5 + dz * -0.85;
  const v = dx * 0.85 + dz * 0.5;
  return 340 * Math.exp(-((u / 700) ** 2) - (v / 380) ** 2);
}

function devilsPeak(x, z) {
  const r = Math.hypot(x - 2400, z - 2000);
  return 1000 * Math.pow(clamp(1 - r / 1700, 0, 1), 1.6);
}

function cityFlatness(x, z) {
  const ox = Math.max(CITY.minX - x, x - CITY.maxX, 0);
  const oz = Math.max(CITY.minZ - z, z - CITY.maxZ, 0);
  return 1 - smoothstep(0, 250, Math.hypot(ox, oz));
}

export function heightAt(x, z) {
  const d = coastDistance(x, z);
  let h = d > 0 ? Math.min(d * 0.035, 60) : Math.max(d * 0.08, -25);
  if (d > 0 && x > 380 && x < 1200 && z < -560) h = Math.max(h, 2.5);
  const westRise = clamp((-150 - x) * 0.1, 0, 70) * smoothstep(-700, -400, z);
  const land = smoothstep(-20, 60, d);
  h += westRise * land;
  h += (signalHill(x, z) + lionsHead(x, z) + tableMountain(x, z) + devilsPeak(x, z)) * land;
  const rough = (1 - cityFlatness(x, z)) * land;
  if (rough > 0) {
    const mountain = clamp(h / 300, 0.15, 1);
    h += (fbm(x * 0.004, z * 0.004, 5) - 0.5) * 70 * mountain * rough;
  }
  return h;
}

export const SEA_LEVEL = 0;

export function districtAt(x, z, h) {
  if (h > 900) return 'Table Mountain';
  if (Math.hypot(x + 1500, z - 1100) < 650) return "Lion's Head";
  if (Math.hypot(x + 1150, z + 150) < 700 && h > 120) return 'Signal Hill';
  if (Math.hypot(x + 650, z - 1000) < 300) return 'Kloof Nek';
  if (x > 380 && z < -560) return 'Duncan Dock';
  if (h > 250 && z > 1500) return 'Tafelberg Road';
  if (z < -500 && x >= -470) return 'Foreshore';
  if (x < -100 && x >= -470 && z < 230) return 'Bo-Kaap';
  if (x >= -100 && x <= 510 && z < 230) return 'City Bowl';
  if (z >= 230 && z < 1500 && x < 300) return 'Tamboerskloof';
  if (z >= 230 && z < 1500) return 'Gardens';
  if (x < -1700) return 'Sea Point';
  return 'Table Town';
}
