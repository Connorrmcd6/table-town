import * as THREE from 'three';
import { heightAt } from './heightmap.js';
import { ROADS } from './city.js';
import { glowMaterial } from '../vehicles/traffic.js';

const POLE_H = 7;

export function createStreetlights(scene, colliders, roads) {
  const spots = [];
  for (const r of ROADS) {
    const spacing = r.width >= 12 ? 26 : 36;
    let side = 1;
    for (let i = 0; i < r.points.length - 1; i++) {
      const [ax, az] = r.points[i], [bx, bz] = r.points[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      const dx = (bx - ax) / len, dz = (bz - az) / len;
      for (let d = spacing / 2; d < len; d += spacing) {
        side = -side;
        const off = r.width / 2 + 0.9;
        const x = ax + dx * d + dz * off * side, z = az + dz * d - dx * off * side;
        if (roads.clearance(x, z, new Set([r])) < 2.5) continue;
        spots.push({ x, z, toRoadX: -dz * side, toRoadZ: dx * side });
      }
    }
  }

  const poleGeo = new THREE.CylinderGeometry(0.09, 0.13, POLE_H, 6).translate(0, POLE_H / 2, 0);
  const armGeo = new THREE.BoxGeometry(0.1, 0.1, 1.8).translate(0, POLE_H - 0.1, 0.9);
  const headGeo = new THREE.BoxGeometry(0.4, 0.14, 0.7).translate(0, POLE_H - 0.2, 1.7);
  const poles = new THREE.InstancedMesh(poleGeo, new THREE.MeshLambertMaterial({ color: '#5a5f63' }), spots.length);
  const arms = new THREE.InstancedMesh(armGeo, poles.material, spots.length);
  const headMat = new THREE.MeshBasicMaterial({ color: '#8a8a84' });
  const heads = new THREE.InstancedMesh(headGeo, headMat, spots.length);
  const pools = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), glowMaterial('#ffc878'), spots.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), scale = new THREE.Vector3(1, 1, 1);
  const up = new THREE.Vector3(0, 0, 1), normal = new THREE.Vector3(), poolScale = new THREE.Vector3(18, 18, 1);
  spots.forEach((s, i) => {
    const y = heightAt(s.x, s.z);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(s.toRoadX, s.toRoadZ));
    m.compose(pos.set(s.x, y, s.z), q, scale);
    poles.setMatrixAt(i, m);
    arms.setMatrixAt(i, m);
    heads.setMatrixAt(i, m);
    const px = s.x + s.toRoadX * 1.7, pz = s.z + s.toRoadZ * 1.7;
    const py = heightAt(px, pz);
    normal.set(py - heightAt(px + 1, pz), 1, py - heightAt(px, pz + 1)).normalize();
    q.setFromUnitVectors(up, normal);
    pools.setMatrixAt(i, m.compose(pos.set(px, py + 0.32, pz), q, poolScale));
    colliders.push({ minX: s.x - 0.2, maxX: s.x + 0.2, minZ: s.z - 0.2, maxZ: s.z + 0.2 });
  });
  poles.castShadow = arms.castShadow = true;
  scene.add(poles, arms, heads, pools);

  const DAY = new THREE.Color('#8a8a84'), NIGHT = new THREE.Color('#ffd890');
  return {
    count: spots.length,
    setLevel(level) {
      headMat.color.copy(DAY).lerp(NIGHT, level);
      pools.material.opacity = level * 0.95;
      pools.visible = level > 0.01;
    },
  };
}
