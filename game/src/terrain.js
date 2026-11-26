// terrain.js — seeded golden-hour archipelago: island heightmap, water, runway,
// windsock, palms, clouds, sky + sun + fog. heightAt() is the single source
// of truth for ground height (flight, rings and aircraft all use it).
import * as THREE from 'three';
import { CONFIG } from './config.js';

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Smooth 2D value noise from a seeded permutation-free hash.
function hash2(ix, iz, seed) {
  let h = (ix * 374761393 + iz * 668265263 + seed * 974634211) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (((h ^ (h >>> 16)) >>> 0) / 4294967296) * 2 - 1;
}
function smooth(t) { return t * t * (3 - 2 * t); }
function noise2(x, z, seed) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const a = hash2(ix, iz, seed), b = hash2(ix + 1, iz, seed);
  const c = hash2(ix, iz + 1, seed), d = hash2(ix + 1, iz + 1, seed);
  const u = smooth(fx), v = smooth(fz);
  return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v);
}
function bump(x, z, cx, cz, r, h) {
  const dx = (x - cx) / r, dz = (z - cz) / r;
  const d2 = dx * dx + dz * dz;
  if (d2 >= 1) return 0;
  const f = 1 - d2;
  return h * f * f;
}

// Runway strip: along X at z = 120, x in [-170, 170], width 26, height 10.
export const RUNWAY = { x0: -170, x1: 170, z0: 107, z1: 133, y: CONFIG.runwayHeight };
// Beach strip on island two (centred -650, -520): along X, width 20.
export const BEACH = { x0: -720, x1: -580, z0: -530, z1: -510, y: 4 };

function stripBlend(x, z, r, edge) {
  const dx = Math.max(r.x0 - x, 0, x - r.x1);
  const dz = Math.max(r.z0 - z, 0, z - r.z1);
  const d = Math.hypot(dx, dz);
  if (d <= 0) return 1;
  if (d >= edge) return 0;
  return 1 - smooth(d / edge);
}

export function heightAt(x, z) {
  const seed = CONFIG.seed;
  let h = -8; // ocean floor
  // Main island + two smaller islands.
  h += bump(x, z, 0, 0, 720, 46);
  h += bump(x, z, -260, -260, 380, 30);
  h += bump(x, z, 300, -320, 300, 26);
  h += bump(x, z, -650, -520, 280, 22);
  h += bump(x, z, 640, -620, 220, 18);
  // Rolling detail, stronger on land.
  const detail = noise2(x * 0.008, z * 0.008, seed) * 6
    + noise2(x * 0.03, z * 0.03, seed + 7) * 1.6;
  if (h > -2) h += detail * Math.min(1, (h + 2) / 12);
  // Rocky peaks on the main island.
  h += bump(x, z, -420, 260, 130, 26);
  h += bump(x, z, 380, 300, 120, 22);
  // Flatten the runway and beach strips so landings are fair.
  // Approach valley south of the runway so the strip is visible on final.
  const VALLEY = { x0: -100, x1: 220, z0: 100, z1: 560 };
  const vv = stripBlend(x, z, VALLEY, 80);
  if (vv > 0) h = h * (1 - vv) + 12 * vv;
  const rw = stripBlend(x, z, RUNWAY, 40);
  if (rw > 0) h = h * (1 - rw) + RUNWAY.y * rw;
  const bs = stripBlend(x, z, BEACH, 30);
  if (bs > 0) h = h * (1 - bs) + BEACH.y * bs;
  return h;
}

export function buildTerrain(scene, seed) {
  const rng = mulberry32(seed || CONFIG.seed);

  // Sky: warm gradient dome + low sun + distance fog (one golden-hour style).
  const skyGeo = new THREE.SphereGeometry(4200, 24, 16);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      top: { value: new THREE.Color(0x2e4d7a) },
      mid: { value: new THREE.Color(0xf2a65a) },
      low: { value: new THREE.Color(0xffd9a0) },
      sunDir: { value: new THREE.Vector3(-0.72, 0.32, -0.42).normalize() },
    },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `varying vec3 vP; uniform vec3 top, mid, low, sunDir;
      void main(){ vec3 d = normalize(vP); float h = clamp(d.y, -0.05, 1.0);
      vec3 c = mix(low, mid, smoothstep(0.0, 0.22, h));
      c = mix(c, top, smoothstep(0.18, 0.65, h));
      float s = max(dot(d, sunDir), 0.0);
      c += vec3(1.0, 0.75, 0.4) * pow(s, 90.0) * 1.4 + vec3(1.0, 0.55, 0.25) * pow(s, 6.0) * 0.35;
      gl_FragColor = vec4(c, 1.0); }`,
  });
  scene.add(new THREE.Mesh(skyGeo, skyMat));
  scene.fog = new THREE.Fog(0xf0b070, CONFIG.fogNear, CONFIG.fogFar);

  const sun = new THREE.DirectionalLight(0xffc27a, 2.4);
  sun.position.set(-720, 320, -420);
  scene.add(sun);
  scene.add(new THREE.AmbientLight(0xffe0b8, 0.85));
  const hemi = new THREE.HemisphereLight(0x8fb4d8, 0x5a7a4a, 0.7);
  scene.add(hemi);

  // Sun disc sprite so the low sun reads in screenshots.
  const sunTex = makeGlowTexture();
  const sunSpr = new THREE.Sprite(new THREE.SpriteMaterial({
    map: sunTex, color: 0xffd9a0, transparent: true, depthWrite: false, fog: false,
  }));
  sunSpr.position.set(-2900, 950, -1700);
  sunSpr.scale.set(900, 900, 1);
  scene.add(sunSpr);

  // Island mesh: vertex-coloured by height (sand / grass / rock / peak).
  const SIZE = 2200, SEG = 150;
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const sand = new THREE.Color(0xe8cf96), grass = new THREE.Color(0x6fa055),
    darkGrass = new THREE.Color(0x4d7d43), rock = new THREE.Color(0x8a7a6a),
    peak = new THREE.Color(0xb9b2a4);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = heightAt(x, z);
    pos.setY(i, h);
    if (h < 3.5) c.copy(sand);
    else if (h < 14) c.copy(sand).lerp(grass, smooth((h - 3.5) / 10));
    else if (h < 30) c.copy(grass).lerp(darkGrass, smooth((h - 14) / 16));
    else if (h < 44) c.copy(darkGrass).lerp(rock, smooth((h - 30) / 14));
    else c.copy(rock).lerp(peak, smooth((h - 44) / 12));
    // Slight noise variation so the ground is not flat-shaded.
    const v = 0.92 + 0.08 * noise2(x * 0.05, z * 0.05, seed + 3);
    colors[i * 3] = c.r * v; colors[i * 3 + 1] = c.g * v; colors[i * 3 + 2] = c.b * v;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const ground = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  scene.add(ground);

  // Animated water plane.
  const waterGeo = new THREE.PlaneGeometry(5200, 5200, 1, 1);
  waterGeo.rotateX(-Math.PI / 2);
  const waterMat = new THREE.MeshPhongMaterial({
    color: 0x2e7f9e, transparent: true, opacity: 0.88,
    shininess: 120, specular: 0xffc27a,
  });
  const water = new THREE.Mesh(waterGeo, waterMat);
  water.position.y = 0;
  scene.add(water);

  // Runway: dark strip + white centre line + threshold marks.
  const runway = new THREE.Group();
  const strip = new THREE.Mesh(
    new THREE.PlaneGeometry(RUNWAY.x1 - RUNWAY.x0, RUNWAY.z1 - RUNWAY.z0),
    new THREE.MeshLambertMaterial({ color: 0x2e2e33 }));
  strip.rotation.x = -Math.PI / 2;
  strip.position.set(0, RUNWAY.y + 0.15, 120);
  runway.add(strip);
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  for (let x = -150; x <= 150; x += 30) {
    const dash = new THREE.Mesh(new THREE.PlaneGeometry(14, 1.6), lineMat);
    dash.rotation.x = -Math.PI / 2;
    dash.position.set(x, RUNWAY.y + 0.3, 120);
    runway.add(dash);
  }
  for (const x of [-164, 164]) {
    for (let k = -2; k <= 2; k++) {
      const bar = new THREE.Mesh(new THREE.PlaneGeometry(8, 1.8), lineMat);
      bar.rotation.x = -Math.PI / 2;
      bar.position.set(x, RUNWAY.y + 0.3, 120 + k * 4.5);
      runway.add(bar);
    }
  }
  scene.add(runway);

  // Beach strip markers (two white posts + a windsock) on island two.
  const beach = new THREE.Group();
  const beachStrip = new THREE.Mesh(
    new THREE.PlaneGeometry(BEACH.x1 - BEACH.x0, BEACH.z1 - BEACH.z0),
    new THREE.MeshLambertMaterial({ color: 0xe8cf96 }));
  beachStrip.rotation.x = -Math.PI / 2;
  beachStrip.position.set(-650, BEACH.y + 0.15, -520);
  beach.add(beachStrip);
  scene.add(beach);

  // Windsock at the runway edge (orange cone, gently waving).
  const sock = new THREE.Group();
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.25, 0.25, 9, 6),
    new THREE.MeshLambertMaterial({ color: 0xdddddd }));
  pole.position.y = 4.5;
  sock.add(pole);
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(1.1, 5.5, 10, 1, true),
    new THREE.MeshLambertMaterial({ color: 0xff7a2a, side: THREE.DoubleSide }));
  cone.rotation.z = Math.PI / 2 - 0.25;
  cone.position.set(2.6, 8.6, 0);
  sock.add(cone);
  sock.position.set(-40, RUNWAY.y, 96);
  scene.add(sock);

  // Palm trees: instanced trunks + instanced frond cones, seeded placement on land.
  const palmSpots = [];
  let guard = 0;
  while (palmSpots.length < 240 && guard++ < 4000) {
    const x = (rng() * 2 - 1) * 950, z = (rng() * 2 - 1) * 950;
    const h = heightAt(x, z);
    if (h < 4 || h > 26) continue;
    if (x > RUNWAY.x0 - 20 && x < RUNWAY.x1 + 20 && z > RUNWAY.z0 - 20 && z < RUNWAY.z1 + 20) continue;
    if (x > BEACH.x0 - 15 && x < BEACH.x1 + 15 && z > BEACH.z0 - 15 && z < BEACH.z1 + 15) continue;
    palmSpots.push({ x, z, h, s: 0.8 + rng() * 0.7, r: rng() * Math.PI * 2 });
  }
  const trunkGeo = new THREE.CylinderGeometry(0.35, 0.6, 7, 6);
  trunkGeo.translate(0, 3.5, 0);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6a4a });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, palmSpots.length);
  const frondGeo = new THREE.ConeGeometry(3.2, 4.5, 7);
  frondGeo.translate(0, 8.2, 0);
  const frondMat = new THREE.MeshLambertMaterial({ color: 0x3f8f4f });
  const fronds = new THREE.InstancedMesh(frondGeo, frondMat, palmSpots.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(),
    eu = new THREE.Euler(), pv = new THREE.Vector3();
  palmSpots.forEach((p, i) => {
    eu.set(0, p.r, 0); q.setFromEuler(eu); sc.set(p.s, p.s, p.s); pv.set(p.x, p.h - 0.3, p.z);
    m4.compose(pv, q, sc);
    trunks.setMatrixAt(i, m4); fronds.setMatrixAt(i, m4);
  });
  scene.add(trunks); scene.add(fronds);

  // Soft clouds: glowing sprite blobs drifting slowly.
  const cloudTex = makeGlowTexture();
  const clouds = [];
  for (let i = 0; i < 26; i++) {
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({
      map: cloudTex, color: 0xffe8c8, transparent: true, opacity: 0.55, depthWrite: false,
    }));
    const a = rng() * Math.PI * 2, r = 300 + rng() * 1400;
    spr.position.set(Math.cos(a) * r, 180 + rng() * 160, Math.sin(a) * r);
    const s = 140 + rng() * 220;
    spr.scale.set(s, s * 0.42, 1);
    spr.userData.drift = 1.5 + rng() * 2;
    scene.add(spr); clouds.push(spr);
  }

  function isRunway(x, z) { return x >= RUNWAY.x0 && x <= RUNWAY.x1 && z >= RUNWAY.z0 && z <= RUNWAY.z1; }
  function isBeach(x, z) { return x >= BEACH.x0 && x <= BEACH.x1 && z >= BEACH.z0 && z <= BEACH.z1; }

  return {
    heightAt,
    runway: RUNWAY,
    beachStrip: BEACH,
    isRunway,
    isBeach,
    trees: palmSpots.length,
    update(dt, t) {
      water.position.y = Math.sin(t * 0.5) * 0.25;
      waterMat.opacity = 0.86 + Math.sin(t * 0.4) * 0.02;
      for (const cl of clouds) {
        cl.position.x += cl.userData.drift * dt;
        if (cl.position.x > 1800) cl.position.x = -1800;
      }
      cone.rotation.z = Math.PI / 2 - 0.25 + Math.sin(t * 1.7) * 0.08;
    },
  };
}

function makeGlowTexture() {
  const cv = document.createElement('canvas');
  cv.width = 128; cv.height = 128;
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 2, 64, 64, 62);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(cv);
  return tex;
}
