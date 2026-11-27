// rings.js — the ring course: glowing torus gates, numbered, next one pulses
// bright, others dim. Fly through the centre to score.
// v5 (W4): brighter next-ring halo, larger next-ring label, chevrons before the
// next ring, dotted glow path to the following ring, FUEL icon on the refuel
// ring, and a world distance label above the final ring.
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

// West threshold of runway 27 (matches RUNWAY in terrain.js).
const RWY_THRESHOLD = { x: -170, y: 10, z: 120 };

// Cached radial-gradient glow texture (shared by halos + path dots).
let glowTex = null;
function getGlowTexture() {
  if (glowTex) return glowTex;
  const cv = document.createElement('canvas');
  cv.width = 128; cv.height = 128;
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  glowTex = new THREE.CanvasTexture(cv);
  return glowTex;
}

// Bold text sprite (e.g. 'FUEL', 'RWY 27 · 0.13 NM') on a dark pill.
function makeTextSprite(text, fg) {
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = 128;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath(); ctx.roundRect(6, 14, 500, 100, 50); ctx.fill();
  ctx.strokeStyle = fg; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.roundRect(6, 14, 500, 100, 50); ctx.stroke();
  ctx.fillStyle = fg;
  ctx.font = 'bold 62px sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 66);
  const tex = new THREE.CanvasTexture(cv);
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  spr.scale.set(44, 11, 1);
  return spr;
}

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
    // Large halo sprite around the ring (bright on the next ring).
    const haloMat = new THREE.SpriteMaterial({
      map: getGlowTexture(), color, transparent: true, opacity: 0.08, depthWrite: false });
    const halo = new THREE.Sprite(haloMat);
    halo.scale.set(110, 110, 1);
    halo.position.copy(torus.position);
    scene.add(halo);
    // Chevrons: 3 glowing arrowheads floating just before this ring,
    // pointing through it (approach side = toward the previous ring).
    const dir = new THREE.Vector3(prev.x - def.x, prev.y - def.y, prev.z - def.z).normalize();
    const chevrons = new THREE.Group();
    const chevBase = [];
    const chevMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 });
    const chevGeo = new THREE.ConeGeometry(1.2, 3.2, 4);
    for (let k = 0; k < 3; k++) {
      const c = new THREE.Mesh(chevGeo, chevMat);
      c.quaternion.copy(torus.quaternion);
      c.rotateX(-Math.PI / 2); // cone tip points through the ring (-Z local)
      const p = new THREE.Vector3(def.x, def.y, def.z).addScaledVector(dir, 12 + k * 8);
      c.position.copy(p);
      chevBase.push(p);
      chevrons.add(c);
    }
    chevrons.visible = false;
    scene.add(chevrons);
    // Dotted glowing path line: small glow sprites along the leg from this
    // ring to the next one (final ring: leg to the runway threshold).
    const target = (i + 1 < count) ? COURSE[i + 1] : RWY_THRESHOLD;
    const pathMat = new THREE.SpriteMaterial({
      map: getGlowTexture(), color, transparent: true, opacity: 0, depthWrite: false });
    const pathSprites = [];
    for (let k = 0; k < 8; k++) {
      const f = 0.12 + (0.76 * k) / 7;
      const s = new THREE.Sprite(pathMat);
      s.scale.set(5, 5, 1);
      s.position.set(
        def.x + (target.x - def.x) * f,
        def.y + (target.y - def.y) * f,
        def.z + (target.z - def.z) * f);
      scene.add(s);
      pathSprites.push(s);
    }
    // Fuel icon above the gold refuel ring.
    let fuelIcon = null;
    if (isRefuel) {
      fuelIcon = makeTextSprite('FUEL', '#ffd94a');
      fuelIcon.position.set(def.x, def.y + CONFIG.ringRadius + 26, def.z);
      scene.add(fuelIcon);
    }
    // World distance label above the final ring: distance to runway 27.
    let distLabel = null;
    if (i === count - 1) {
      const d = Math.hypot(
        def.x - RWY_THRESHOLD.x, def.y - RWY_THRESHOLD.y, def.z - RWY_THRESHOLD.z);
      distLabel = makeTextSprite(`RWY 27 · ${(d / 1852).toFixed(2)} NM`, '#ffffff');
      distLabel.position.set(def.x, def.y + CONFIG.ringRadius + 26, def.z);
      scene.add(distLabel);
    }
    rings.push({
      index: i, def, mesh: torus, label, glow, material: mat,
      isRefuel, passed: false, baseColor: color,
      halo, haloMat, chevrons, chevBase, chevDir: dir,
      pathSprites, pathMat, fuelIcon, distLabel,
    });
  }
  const course = { rings, nextIndex: 0, reset() { for (const r of rings) r.passed = false; this.nextIndex = 0; setRingStates(rings, 0); } };
  setRingStates(rings, 0);
  return course;
}

// Next ring pulses bright, passed rings go dim green, future rings dim.
// Added elements follow the same logic: halo/label bright on next,
// chevrons + path line visible only on the next ring.
export function setRingStates(rings, nextIndex) {
  rings.forEach((r, i) => {
    if (r.passed) {
      r.material.color.setHex(0x2aff66);
      r.material.opacity = 0.3;
      r.glow.material.opacity = 0.02;
      r.haloMat.opacity = 0;
      r.label.scale.set(16, 16, 1);
      r.label.material.opacity = 0.6;
      r.chevrons.visible = false;
      r.pathMat.opacity = 0;
      if (r.fuelIcon) r.fuelIcon.material.opacity = 0.5;
    } else if (i === nextIndex) {
      r.material.color.setHex(r.baseColor);
      r.material.opacity = 1.0;
      r.glow.material.opacity = 0.22;
      r.haloMat.opacity = 0.45;
      r.label.scale.set(26, 26, 1);
      r.label.material.opacity = 1.0;
      r.chevrons.visible = true;
      r.pathMat.opacity = 0.6;
      if (r.fuelIcon) r.fuelIcon.material.opacity = 1.0;
    } else {
      r.material.color.setHex(r.baseColor);
      r.material.opacity = 0.4;
      r.glow.material.opacity = 0.04;
      r.haloMat.opacity = 0.08;
      r.label.scale.set(16, 16, 1);
      r.label.material.opacity = 0.85;
      r.chevrons.visible = false;
      r.pathMat.opacity = 0;
      if (r.fuelIcon) r.fuelIcon.material.opacity = 0.85;
    }
    // RWY distance label: show only while the final ring is still ahead
    // (not the next ring, not passed) so it never overlaps the HUD on final.
    if (r.distLabel) r.distLabel.visible = !r.passed && i !== nextIndex;
  });
}

// Per-frame animation for the next ring only (cheap: a few sprites/meshes).
// Called by main.js each rendered frame when present. No-op when done.
export function updateRings(rings, t) {
  const next = rings.find((r) => !r.passed);
  if (!next) return;
  const pulse = 0.5 + 0.5 * Math.sin(t * 3);
  next.haloMat.opacity = 0.35 + 0.25 * pulse;
  next.chevrons.children.forEach((c, k) => {
    const bob = Math.sin(t * 2.5 - k * 0.9) * 1.5;
    c.position.copy(next.chevBase[k]).addScaledVector(next.chevDir, bob);
    c.scale.setScalar(1 + 0.12 * Math.sin(t * 3 - k * 0.9));
  });
  next.pathSprites.forEach((s, k) => {
    const tw = 0.75 + 0.25 * Math.sin(t * 4 - k * 0.8);
    s.scale.set(5 * tw, 5 * tw, 1);
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
