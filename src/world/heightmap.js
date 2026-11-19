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

// Map is authored in "map metres" and condensed by WORLD_SCALE; vehicles and buildings stay real size.
export const WORLD_SCALE = 0.65;
const S = WORLD_SCALE;
export const w = (v) => v * S;
const scalePoint = (p) => ({ x: w(p.x), z: w(p.z) });

const RAW_CITY = { minX: -470, maxX: 510, minZ: -490, maxZ: 230 };
const RAW_LIONS_HEAD = { x: -1500, z: 1100 };
const RAW_KLOOF_NEK = { x: -650, z: 1000 };
const RAW_DISA_PARK = { x: 760, z: 950 };
export const CITY = { minX: w(RAW_CITY.minX), maxX: w(RAW_CITY.maxX), minZ: w(RAW_CITY.minZ), maxZ: w(RAW_CITY.maxZ) };
export const LIONS_HEAD = scalePoint(RAW_LIONS_HEAD);
export const KLOOF_NEK = scalePoint(RAW_KLOOF_NEK);
export const DISA_PARK = scalePoint(RAW_DISA_PARK);

export function coastDistance(x, z) {
  return rawCoast(x / S, z / S) * S;
}

export function heightAt(x, z) {
  return rawHeight(x / S, z / S) * S;
}

export function districtAt(x, z, h) {
  return rawDistrict(x / S, z / S, h / S);
}

function rawCoast(x, z) {
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

// Rocky dome head on a shoulder, with the body ridge running north-east to Signal Hill.
function lionsHead(x, z) {
  const dx = x - RAW_LIONS_HEAD.x, dz = z - RAW_LIONS_HEAD.z;
  const r = Math.hypot(dx, dz);
  const u = dx * 0.27 - dz * 0.96;
  const v = dx * 0.96 + dz * 0.27;
  const along = u > 0 ? u / 700 : u / 380;
  const body = 170 * Math.exp(-(along ** 2) - (v / 300) ** 2);
  const base = 130 * Math.pow(clamp(1 - r / 1000, 0, 1), 1.4);
  const hr = Math.hypot(dx + 35, dz - 25);
  const dome = 260 * Math.pow(clamp(1 - (hr / 250) ** 2, 0, 1), 0.85);
  return base + body + dome;
}

function signalHill(x, z) {
  const dx = x + 1150, dz = z + 150;
  const u = dx * 0.5 + dz * -0.85;
  const v = dx * 0.85 + dz * 0.5;
  return 270 * Math.exp(-((u / 700) ** 2) - (v / 380) ** 2);
}

function kloofNek(x, z) {
  return 120 * Math.exp(-(((x - RAW_KLOOF_NEK.x) / 380) ** 2) - ((z - RAW_KLOOF_NEK.z) / 260) ** 2);
}

function devilsPeak(x, z) {
  const r = Math.hypot(x - 2400, z - 2000);
  return 1000 * Math.pow(clamp(1 - r / 1700, 0, 1), 1.6);
}

function cityFlatness(x, z) {
  const ox = Math.max(RAW_CITY.minX - x, x - RAW_CITY.maxX, 0);
  const oz = Math.max(RAW_CITY.minZ - z, z - RAW_CITY.maxZ, 0);
  return 1 - smoothstep(0, 250, Math.hypot(ox, oz));
}

function rawHeight(x, z) {
  const d = rawCoast(x, z);
  let h = d > 0 ? Math.min(d * 0.035, 60) : Math.max(d * 0.08, -25);
  if (d > 0 && x > 380 && x < 1200 && z < -560) h = Math.max(h, 2.5);
  const westRise = clamp((-150 - x) * 0.1, 0, 70) * smoothstep(-700, -400, z);
  const land = smoothstep(-20, 60, d);
  h += westRise * land;
  h += (signalHill(x, z) + lionsHead(x, z) + kloofNek(x, z) + tableMountain(x, z) + devilsPeak(x, z)) * land;
  const rough = (1 - cityFlatness(x, z)) * land;
  if (rough > 0) {
    const mountain = clamp((h - 150) / 400, 0.08, 1);
    h += (fbm(x * 0.004, z * 0.004, 5) - 0.5) * 50 * mountain * rough;
    h += (fbm(x * 0.03, z * 0.03, 2) - 0.5) * 14 * mountain * mountain * rough;
  }
  return h;
}

export const SEA_LEVEL = 0;

function rawDistrict(x, z, h) {
  if (h > 900) return 'Table Mountain';
  if (Math.hypot(x + 1500, z - 1100) < 650) return "Lion's Head";
  if (Math.hypot(x + 1150, z + 150) < 700 && h > 120) return 'Signal Hill';
  if (Math.hypot(x + 650, z - 1000) < 300) return 'Kloof Nek';
  if (Math.hypot(x - RAW_DISA_PARK.x, z - RAW_DISA_PARK.z) < 140) return 'Disa Park';
  if (x > 380 && x < 1200 && z < -560) return 'Duncan Dock';
  if (h > 250 && z > 1500) return 'Tafelberg Road';
  if (z < -500 && x >= -470 && x < 1200) return 'Foreshore';
  if (x >= -260 && x <= -95 && z >= -290 && z <= 30) return 'Bo-Kaap';
  if (x >= -470 && x < -95 && z < -290) return 'De Waterkant';
  if (x >= -470 && x < -95 && z < 230) return 'Schotsche Kloof';
  if (x >= -100 && x <= 510 && z < 230) return 'City Bowl';
  if (x < -1300) return 'Sea Point';
  if (x < -470 && z < 300) return 'Green Point';
  if (x > 510 && z < 400) return 'Woodstock';
  if (x > 500) return 'Vredehoek';
  if (x < -100) return 'Tamboerskloof';
  if (x < 250) return 'Gardens';
  return 'Oranjezicht';
}
