import * as THREE from 'three';

const PRESETS = {
  golden: {
    sunDir: [-0.92, 0.12, -0.36],
    zenith: '#6f93c4',
    horizon: '#f2b56b',
    sunGlow: '#ffb347',
    fog: '#e8b07a',
    fogDensity: 0.00016,
    sun: '#ffb070',
    sunIntensity: 3.8,
    hemiSky: '#ffe2bf',
    hemiGround: '#8a7558',
    hemiIntensity: 1.9,
    windows: 0.15,
  },
  noon: {
    sunDir: [-0.3, 0.85, 0.35],
    zenith: '#3f7fd6',
    horizon: '#b9d5ee',
    sunGlow: '#fff4d6',
    fog: '#c3d6e6',
    fogDensity: 0.00012,
    sun: '#fff6e8',
    sunIntensity: 3.0,
    hemiSky: '#d6e8ff',
    hemiGround: '#7a6a52',
    hemiIntensity: 1.2,
    windows: 0,
  },
  night: {
    sunDir: [0.4, 0.55, -0.6],
    zenith: '#050a1a',
    horizon: '#1c2440',
    sunGlow: '#3a4a70',
    fog: '#141a2c',
    fogDensity: 0.0002,
    sun: '#8fa6d8',
    sunIntensity: 0.35,
    hemiSky: '#38466e',
    hemiGround: '#141418',
    hemiIntensity: 0.8,
    windows: 0.75,
  },
};

export const TIME_ORDER = ['golden', 'noon', 'night'];

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

  const state = { preset: 'golden', sunDir: new THREE.Vector3(), windows: 0, loadshedding: false };

  function apply(name) {
    const p = PRESETS[name];
    state.preset = name;
    state.sunDir.set(...p.sunDir).normalize();
    uniforms.zenith.value.set(p.zenith);
    uniforms.horizon.value.set(p.horizon);
    uniforms.sunGlow.value.set(p.sunGlow);
    uniforms.sunDir.value.copy(state.sunDir);
    uniforms.stars.value = name === 'night' ? 1 : 0;
    scene.fog.color.set(p.fog);
    scene.fog.density = p.fogDensity;
    sun.color.set(p.sun);
    sun.intensity = p.sunIntensity;
    hemi.color.set(p.hemiSky);
    hemi.groundColor.set(p.hemiGround);
    hemi.intensity = p.hemiIntensity;
    state.windows = p.windows;
  }
  apply('golden');

  function follow(target) {
    sky.position.copy(target);
    sun.target.position.copy(target);
    sun.position.copy(target).addScaledVector(state.sunDir, 700);
    sun.target.updateMatrixWorld();
  }

  return { state, apply, follow, sun, uniforms };
}
