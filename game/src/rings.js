// rings.js — the ring course: glowing torus gates, numbered, next one pulses
// bright, others dim. Fly through the centre to score.
import * as THREE from 'three';
import { CONFIG } from './config.js';

// Fixed course: 8 rings looping over the archipelago, altitudes 55–120 m.
// Ring 4 (index 3) is the gold refuel ring on Ring Run.
const COURSE = [
  { x: 260, y: 75, z: -40 },
  { x: 480, y: 95, z: -380 },
  { x: 120, y: 110, z: -620 },
  { x: -380, y: 85, z: -560 }, // refuel ring (gold)
  { x: -650, y: 60, z: -300 },
  { x: -480, y: 90, z: 180 },
  { x: -120, y: 70, z: 420 },
  { x: 60, y: 60, z: 200 },    // final ring, on the runway approach
];

function makeLabelSprite(text) {
  const cv = document.createElement('canvas');
  cv.width = 128; cv.height = 128;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath(); ctx.arc(64, 64, 52, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.arc(64, 64, 52, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 64px sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, 64, 68);
  const tex = new THREE.CanvasTexture(cv);
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  spr.scale.set(16, 16, 1);
  return spr;
}

export function buildRingCourse(scene, mission) {
  const rings = [];
  const count = mission.rings || 0;
  for (let i = 0; i < count; i++) {
    const def = COURSE[i % COURSE.length];
    const isRefuel = mission.refuel && i === 3;
    const color = isRefuel ? 0xffc21a : 0x22e6ff;
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55 });
    const torus = new THREE.Mesh(new THREE.TorusGeometry(CONFIG.ringRadius, 1.1, 12, 40), mat);
    torus.position.set(def.x, def.y, def.z);
    // Face the ring toward the previous ring (course direction).
    const prev = COURSE[(i + COURSE.length - 1) % COURSE.length];
    torus.lookAt(prev.x, prev.y, prev.z);
    scene.add(torus);
    const label = makeLabelSprite(String(i + 1));
    label.position.set(def.x, def.y + CONFIG.ringRadius + 12, def.z);
    scene.add(label);
    // Inner glow disc so the gate reads from far away.
    const glow = new THREE.Mesh(
      new THREE.CircleGeometry(CONFIG.ringRadius * 0.92, 32),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.07, side: THREE.DoubleSide, depthWrite: false }));
    glow.position.copy(torus.position);
    glow.quaternion.copy(torus.quaternion);
    scene.add(glow);
    rings.push({
      index: i, def, mesh: torus, label, glow, material: mat,
      isRefuel, passed: false, baseColor: color,
    });
  }
  const course = { rings, nextIndex: 0, reset() { for (const r of rings) r.passed = false; this.nextIndex = 0; setRingStates(rings, 0); } };
  setRingStates(rings, 0);
  return course;
}

// Next ring pulses bright, passed rings go dim green, future rings dim.
export function setRingStates(rings, nextIndex) {
  rings.forEach((r, i) => {
    if (r.passed) {
      r.material.color.setHex(0x2aff66);
      r.material.opacity = 0.3;
      r.glow.material.opacity = 0.02;
    } else if (i === nextIndex) {
      r.material.color.setHex(r.baseColor);
      r.material.opacity = 1.0;
      r.glow.material.opacity = 0.14;
    } else {
      r.material.color.setHex(r.baseColor);
      r.material.opacity = 0.4;
      r.glow.material.opacity = 0.04;
    }
  });
}

// Pass detection: plane crossed the ring plane within the torus radius.
// Returns the ring index, or -1. Only the next ring counts.
export function checkRingPass(rings, planePos, prevPos) {
  const next = rings.find((r) => !r.passed);
  if (!next) return -1;
  const c = next.def;
  // Ring plane normal: from the ring toward the previous ring (course direction).
  const prev = COURSE[(next.index + COURSE.length - 1) % COURSE.length];
  const nx = prev.x - c.x, ny = prev.y - c.y, nz = prev.z - c.z;
  const nl = Math.hypot(nx, ny, nz) || 1;
  const ux = nx / nl, uy = ny / nl, uz = nz / nl;
  const dPrev = (prevPos.x - c.x) * ux + (prevPos.y - c.y) * uy + (prevPos.z - c.z) * uz;
  const dNow = (planePos.x - c.x) * ux + (planePos.y - c.y) * uy + (planePos.z - c.z) * uz;
  if (dPrev === 0 || dNow === 0) return -1;
  if (Math.sign(dPrev) === Math.sign(dNow)) return -1; // did not cross the plane
  // Distance from the ring centre at the crossing point (linear interpolation).
  const t = dPrev / (dPrev - dNow);
  const cx = prevPos.x + (planePos.x - prevPos.x) * t;
  const cy = prevPos.y + (planePos.y - prevPos.y) * t;
  const cz = prevPos.z + (planePos.z - prevPos.z) * t;
  const radial = Math.hypot(cx - c.x, cy - c.y, cz - c.z);
  if (radial <= CONFIG.ringRadius) {
    next.passed = true;
    return next.index;
  }
  return -1;
}
