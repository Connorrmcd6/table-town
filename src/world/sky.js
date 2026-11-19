import * as THREE from 'three';

const NIGHT = {
  zenith: '#060c20', horizon: '#232c4c', sunGlow: '#3a4a70', fog: '#1a2236', fogDensity: 0.0002,
  sun: '#9db2e0', sunIntensity: 0.9, hemiSky: '#5a6aa0', hemiGround: '#2c2c38', hemiIntensity: 2.0,
  windows: 0.5, stars: 1,
};
const DAWN = {
  zenith: '#4a5f8f', horizon: '#f0a07a', sunGlow: '#ff9a6a', fog: '#c99a8a', fogDensity: 0.00018,
  sun: '#ffa27a', sunIntensity: 2.2, hemiSky: '#e8c4b4', hemiGround: '#5a4a44', hemiIntensity: 1.3,
  windows: 0.3, stars: 0,
};
const MORNING = {
  zenith: '#5a8cd0', horizon: '#cfe0ee', sunGlow: '#fff0d0', fog: '#cfdbe6', fogDensity: 0.00013,
  sun: '#fff0dc', sunIntensity: 3.0, hemiSky: '#dfeaff', hemiGround: '#7a6a52', hemiIntensity: 1.3,
  windows: 0, stars: 0,
};
const NOON = {
  zenith: '#3f7fd6', horizon: '#b9d5ee', sunGlow: '#fff4d6', fog: '#c3d6e6', fogDensity: 0.00012,
  sun: '#fff6e8', sunIntensity: 3.0, hemiSky: '#d6e8ff', hemiGround: '#7a6a52', hemiIntensity: 1.2,
  windows: 0, stars: 0,
};
const GOLDEN = {
  zenith: '#6f93c4', horizon: '#f2b56b', sunGlow: '#ffb347', fog: '#e8b07a', fogDensity: 0.00016,
  sun: '#ffb070', sunIntensity: 3.8, hemiSky: '#ffe2bf', hemiGround: '#8a7558', hemiIntensity: 1.9,
  windows: 0.15, stars: 0,
};
const DUSK = {
  zenith: '#2a3260', horizon: '#c86a5a', sunGlow: '#ff7a50', fog: '#7a5a68', fogDensity: 0.00018,
  sun: '#ff8a60', sunIntensity: 1.2, hemiSky: '#8a6a8a', hemiGround: '#2a2228', hemiIntensity: 1.5,
  windows: 0.6, stars: 0.3,
};

const h = (hours) => hours * 60;
const KEYS = [
  [h(0), NIGHT], [h(5.2), NIGHT], [h(6.2), DAWN], [h(7.5), MORNING], [h(12), NOON], [h(15.5), NOON],
  [h(17.5), GOLDEN], [h(18.8), DUSK], [h(19.8), NIGHT], [h(24), NIGHT],
];
const COLOR_KEYS = ['zenith', 'horizon', 'sunGlow', 'fog', 'sun', 'hemiSky', 'hemiGround'];
const NUM_KEYS = ['fogDensity', 'sunIntensity', 'hemiIntensity', 'windows', 'stars'];
const MOON_DIR = new THREE.Vector3(0.4, 0.55, -0.6).normalize();
const SUNRISE = h(6), SUNSET = h(18.6);

const parsed = KEYS.map(([t, p]) => {
  const o = { t };
  for (const k of COLOR_KEYS) o[k] = new THREE.Color(p[k]);
  for (const k of NUM_KEYS) o[k] = p[k];
  return o;
});

// Sun rises in the east (+x), crosses to the north (-z) at noon, sets over the Atlantic (-x).
export function sunDirection(minutes, out = new THREE.Vector3()) {
  const a = ((minutes - SUNRISE) / (SUNSET - SUNRISE)) * Math.PI;
  return out.set(Math.cos(a), Math.sin(a) * 0.85, -0.35 - 0.3 * Math.max(0, Math.sin(a))).normalize();
}

export function createSky(scene) {
  const uniforms = {
    zenith: { value: new THREE.Color() },
    horizon: { value: new THREE.Color() },
    sunGlow: { value: new THREE.Color() },
    sunDir: { value: new THREE.Vector3() },
    stars: { value: 0 },
  };
  const skyMat = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: `
      uniform vec3 zenith, horizon, sunGlow, sunDir;
      uniform float stars;
      varying vec3 vDir;
      float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453); }
      void main() {
        vec3 d = normalize(vDir);
        float h = max(d.y, 0.0);
        vec3 col = mix(horizon, zenith, pow(h, 0.55));
        float s = max(dot(d, normalize(sunDir)), 0.0);
        col += sunGlow * pow(s, 6.0) * 0.55;
        col += sunGlow * pow(s, 64.0) * 0.6;
        col += vec3(1.0, 0.95, 0.85) * smoothstep(0.9993, 0.9997, s) * 2.0;
        if (d.y < 0.0) col = mix(horizon, horizon * 0.8, min(-d.y * 4.0, 1.0));
        if (stars > 0.0 && d.y > 0.05) {
          vec3 cell = floor(d * 300.0);
          float st = step(0.997, hash(cell));
          col += vec3(st) * stars * smoothstep(0.05, 0.3, d.y);
        }
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), skyMat);
  sky.scale.setScalar(20000);
  sky.frustumCulled = false;
  sky.renderOrder = -1;
  scene.add(sky);

  const hemi = new THREE.HemisphereLight();
  scene.add(hemi);
  const sun = new THREE.DirectionalLight();
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -160; sc.right = 160; sc.top = 160; sc.bottom = -160;
  sc.near = 10; sc.far = 1500;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.6;
  scene.add(sun);
  scene.add(sun.target);
  scene.fog = new THREE.FogExp2(0xffffff, 0.0002);

  const state = { minutes: 0, lightDir: new THREE.Vector3(), windows: 0, night: 0, lights: 0 };
  const sunDir = new THREE.Vector3();

  function setTime(minutes) {
    const t = ((minutes % 1440) + 1440) % 1440;
    state.minutes = t;
    let i = 0;
    while (i < parsed.length - 2 && parsed[i + 1].t <= t) i++;
    const a = parsed[i], b = parsed[i + 1];
    const k = (t - a.t) / (b.t - a.t);
    const lerpC = (key, target) => target.copy(a[key]).lerp(b[key], k);
    const lerpN = (key) => a[key] + (b[key] - a[key]) * k;

    lerpC('zenith', uniforms.zenith.value);
    lerpC('horizon', uniforms.horizon.value);
    lerpC('sunGlow', uniforms.sunGlow.value);
    lerpC('fog', scene.fog.color);
    lerpC('sun', sun.color);
    lerpC('hemiSky', hemi.color);
    lerpC('hemiGround', hemi.groundColor);
    scene.fog.density = lerpN('fogDensity');
    sun.intensity = lerpN('sunIntensity');
    hemi.intensity = lerpN('hemiIntensity');
    uniforms.stars.value = lerpN('stars');
    state.windows = lerpN('windows');

    sunDirection(t, sunDir);
    uniforms.sunDir.value.copy(sunDir);
    const day = THREE.MathUtils.smoothstep(sunDir.y, -0.08, 0.06);
    state.night = 1 - day;
    state.lights = 1 - THREE.MathUtils.smoothstep(sunDir.y, 0.0, 0.16);
    state.lightDir.copy(MOON_DIR).lerp(sunDir, day).normalize();
  }
  setTime(h(17.5));

  function follow(target) {
    sky.position.copy(target);
    sun.target.position.copy(target);
    sun.position.copy(target).addScaledVector(state.lightDir, 700);
    sun.target.updateMatrixWorld();
  }

  return { state, setTime, follow, sun, uniforms };
}
