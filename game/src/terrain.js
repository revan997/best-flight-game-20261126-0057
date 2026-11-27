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
      top: { value: new THREE.Color(0x0d2c60) },
      mid: { value: new THREE.Color(0xef8a3e) },
      low: { value: new THREE.Color(0xffc27a) },
      haze: { value: new THREE.Color(0xffc98a) },
      sunDir: { value: new THREE.Vector3(-0.72, 0.32, -0.42).normalize() },
    },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `varying vec3 vP; uniform vec3 top, mid, low, haze, sunDir;
      void main(){ vec3 d = normalize(vP); float h = clamp(d.y, -0.05, 1.0);
      vec3 c = mix(low, mid, smoothstep(0.0, 0.22, h));
      c = mix(c, top, smoothstep(0.10, 0.42, h));
      float band = exp(-abs(h - 0.06) * 22.0);
      c = mix(c, haze, band * 0.55);
      float s = max(dot(d, sunDir), 0.0);
      c += vec3(1.0, 0.75, 0.4) * pow(s, 90.0) * 1.4 + vec3(1.0, 0.55, 0.25) * pow(s, 6.0) * 0.35;
      c += vec3(1.0, 0.8, 0.55) * pow(s, 18.0) * 0.45 + vec3(1.0, 0.6, 0.3) * pow(s, 2.0) * 0.10;
      gl_FragColor = vec4(c, 1.0); }`,
  });
  scene.add(new THREE.Mesh(skyGeo, skyMat));
  scene.fog = new THREE.Fog(0xdfa67e, CONFIG.fogNear, CONFIG.fogFar);

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
  sunSpr.scale.set(1350, 1350, 1);
  scene.add(sunSpr);

  // Subtle lens flare: a few small glow sprites in a line from the sun
  // toward the scene centre (sun at (-2900,950,-1700), fractions of the
  // sun->origin line), with one cool ghost for contrast.
  const flare = [];
  for (const [fx, fy, fz, fs, fcol, fop] of [
    [-2610, 855, -1530, 320, 0xffd9a0, 0.32],
    [-2378, 779, -1394, 150, 0xffb27a, 0.28],
    [-2117, 694, -1241, 90, 0xffe9c0, 0.34],
    [-1798, 589, -1054, 210, 0xffc98a, 0.20],
    [-1450, 475, -850, 70, 0x9fd0ff, 0.30],
  ]) {
    const fSpr = new THREE.Sprite(new THREE.SpriteMaterial({
      map: sunTex, color: fcol, transparent: true, opacity: fop, depthWrite: false, fog: false,
    }));
    fSpr.position.set(fx, fy, fz);
    fSpr.scale.set(fs, fs, 1);
    scene.add(fSpr);
    flare.push({ spr: fSpr, base: fop, phase: rng() * Math.PI * 2 });
  }

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
  const patchA = new THREE.Color(0x7fb35e), patchB = new THREE.Color(0x5d8a3e);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = heightAt(x, z);
    pos.setY(i, h);
    // Slope from finite differences: steep ground reads as rock/cliff.
    const slope = Math.hypot(heightAt(x + 14, z) - h, heightAt(x, z + 14) - h) / 14;
    const rockiness = smooth(Math.min(1, Math.max(0, (slope - 0.35) / 0.45)));
    if (h < 3.5) c.copy(sand);
    else if (h < 14) c.copy(sand).lerp(grass, smooth((h - 3.5) / 10));
    else if (h < 30) c.copy(grass).lerp(darkGrass, smooth((h - 14) / 16));
    else if (h < 44) c.copy(darkGrass).lerp(rock, smooth((h - 30) / 14));
    else c.copy(rock).lerp(peak, smooth((h - 44) / 12));
    // Patchy grass: two blotch scales blended into the grass band only.
    const patch = noise2(x * 0.012 + 40, z * 0.012, seed + 11) * 0.5 + 0.5;
    if (h >= 3.5 && h < 30) c.lerp(patch > 0.55 ? patchA : patchB, Math.abs(patch - 0.5) * 0.7);
    if (rockiness > 0) c.lerp(rock, rockiness * 0.85);
    // Stronger patchy brightness noise so grass/sand are not flat bands.
    const v = 0.86 + 0.14 * noise2(x * 0.05, z * 0.05, seed + 3)
      + 0.07 * noise2(x * 0.15 + 9, z * 0.15, seed + 5);
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

  // Turquoise shallows: semi-transparent discs just above the water plane
  // under each island's shore. Where terrain is above the water they are
  // hidden; where it is shallow water they tint it turquoise, fading to
  // deep blue offshore (the disc edge is well inside open water).
  const shallowMat = new THREE.MeshBasicMaterial({
    color: 0x2fd4c0, transparent: true, opacity: 0.30, depthWrite: false,
  });
  for (const [sx, sz, sr] of [[0, 0, 680], [-650, -520, 260], [300, -320, 270], [640, -620, 210]]) {
    const discGeo = new THREE.CircleGeometry(sr, 48);
    discGeo.rotateX(-Math.PI / 2);
    const disc = new THREE.Mesh(discGeo, shallowMat);
    disc.position.set(sx, 0.35, sz);
    disc.renderOrder = 1;
    scene.add(disc);
  }

  // Animated foam rings at the waterline around the main island (shore
  // points verified against heightAt: each sits where h crosses ~0).
  const foamRings = [];
  const foamMat = new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide,
  });
  for (const [fx, fz] of [
    [550, 0], [400, 400], [0, 620], [-407, 407],
    [-550, 0], [-450, -450], [0, -550], [420, -470],
  ]) {
    const ringGeo = new THREE.RingGeometry(16, 25, 36);
    ringGeo.rotateX(-Math.PI / 2);
    const fr = new THREE.Mesh(ringGeo, foamMat.clone());
    fr.position.set(fx, 0.4, fz);
    fr.renderOrder = 2;
    scene.add(fr);
    foamRings.push({ mesh: fr, base: 0.35 + rng() * 0.2, phase: rng() * Math.PI * 2 });
  }

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
    const dash = new THREE.Mesh(new THREE.PlaneGeometry(16, 2.0), lineMat);
    dash.rotation.x = -Math.PI / 2;
    dash.position.set(x, RUNWAY.y + 0.3, 120);
    runway.add(dash);
  }
  // Threshold piano keys: wider + brighter than before (5 bars per end).
  for (const x of [-164, 164]) {
    for (let k = -2; k <= 2; k++) {
      const bar = new THREE.Mesh(new THREE.PlaneGeometry(12, 2.4), lineMat);
      bar.rotation.x = -Math.PI / 2;
      bar.position.set(x, RUNWAY.y + 0.3, 120 + k * 4.5);
      runway.add(bar);
    }
  }
  // Touchdown zone markings: pairs of white bars either side of centreline.
  for (const x of [-120, -80, 80, 120]) {
    for (const dz of [-6.5, 6.5]) {
      const tz = new THREE.Mesh(new THREE.PlaneGeometry(10, 2.2), lineMat);
      tz.rotation.x = -Math.PI / 2;
      tz.position.set(x, RUNWAY.y + 0.3, 120 + dz);
      runway.add(tz);
    }
  }
  // Painted runway number '27' at the west threshold, readable from the air
  // on approach (texture top points east, digits run north-to-south).
  {
    const cv = document.createElement('canvas');
    cv.width = 256; cv.height = 256;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 150px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('27', 128, 134);
    const tex = new THREE.CanvasTexture(cv);
    const num = new THREE.Mesh(
      new THREE.PlaneGeometry(16, 16),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
    num.rotation.set(-Math.PI / 2, 0, -Math.PI / 2);
    num.position.set(-140, RUNWAY.y + 0.35, 120);
    runway.add(num);
  }
  // Runway edge lights: small emissive amber-white spheres, ~25 m spacing.
  {
    const edgeGeo = new THREE.SphereGeometry(0.55, 8, 6);
    const edgeMat = new THREE.MeshBasicMaterial({ color: 0xffe6a0 });
    for (let x = -165; x <= 165; x += 27.5) {
      for (const z of [108.5, 131.5]) {
        const l = new THREE.Mesh(edgeGeo, edgeMat);
        l.position.set(x, RUNWAY.y + 0.6, z);
        runway.add(l);
      }
    }
  }
  // Approach-light row: glowing white lights extending west from threshold.
  {
    const appGeo = new THREE.SphereGeometry(0.9, 8, 6);
    const appMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    for (const x of [-180, -194, -208, -222, -236]) {
      const l = new THREE.Mesh(appGeo, appMat);
      l.position.set(x, RUNWAY.y + 0.7, 120);
      runway.add(l);
    }
    // Crossbar at the middle approach light.
    for (const z of [112, 128]) {
      const l = new THREE.Mesh(appGeo, appMat);
      l.position.set(-208, RUNWAY.y + 0.7, z);
      runway.add(l);
    }
  }
  // PAPI lights: 4 small boxes beside the threshold (2 white, 2 red).
  {
    const papiGeo = new THREE.BoxGeometry(1.4, 1.0, 1.0);
    const whiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const redMat = new THREE.MeshBasicMaterial({ color: 0xff2222 });
    const papiCols = [whiteMat, whiteMat, redMat, redMat];
    for (let k = 0; k < 4; k++) {
      const p = new THREE.Mesh(papiGeo, papiCols[k]);
      p.position.set(-150, RUNWAY.y + 0.8, 139.5 + k * 2);
      runway.add(p);
    }
  }
  // Hangar beside the strip (north side, clear of the landing path).
  {
    const hangarMat = new THREE.MeshLambertMaterial({ color: 0x8a97a3 });
    const walls = new THREE.Mesh(new THREE.BoxGeometry(26, 7, 15), hangarMat);
    walls.position.set(70, RUNWAY.y + 3.5, 86);
    runway.add(walls);
    const roofMat = new THREE.MeshLambertMaterial({ color: 0x5d6b78 });
    for (const s of [-1, 1]) {
      const slab = new THREE.Mesh(new THREE.BoxGeometry(26, 0.6, 8.6), roofMat);
      slab.rotation.x = s * 0.55;
      slab.position.set(70, RUNWAY.y + 7.9, 86 + s * 3.6);
      runway.add(slab);
    }
    const door = new THREE.Mesh(
      new THREE.PlaneGeometry(16, 5.5),
      new THREE.MeshLambertMaterial({ color: 0x2e3438 }));
    door.position.set(70, RUNWAY.y + 2.75, 86 + 7.6);
    runway.add(door);
  }
  // Fuel truck parked near the hangar (north side, clear of the strip).
  {
    const truck = new THREE.Group();
    const chassis = new THREE.Mesh(
      new THREE.BoxGeometry(7, 1.2, 2.6),
      new THREE.MeshLambertMaterial({ color: 0x333333 }));
    chassis.position.y = 0.9;
    truck.add(chassis);
    const tank = new THREE.Mesh(
      new THREE.CylinderGeometry(1.3, 1.3, 5, 12),
      new THREE.MeshLambertMaterial({ color: 0xd8d8d8 }));
    tank.rotation.z = Math.PI / 2;
    tank.position.set(-0.6, 2.6, 0);
    truck.add(tank);
    const cab = new THREE.Mesh(
      new THREE.BoxGeometry(2.2, 2.0, 2.4),
      new THREE.MeshLambertMaterial({ color: 0xff7a2a }));
    cab.position.set(4.0, 1.8, 0);
    truck.add(cab);
    const wheelGeo = new THREE.CylinderGeometry(0.6, 0.6, 0.5, 10);
    const wheelMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
    for (const [wx, wz] of [[-2.5, 1.3], [-2.5, -1.3], [2.5, 1.3], [3.2, -1.3]]) {
      const w = new THREE.Mesh(wheelGeo, wheelMat);
      w.rotation.x = Math.PI / 2;
      w.position.set(wx, 0.6, wz);
      truck.add(w);
    }
    truck.position.set(28, RUNWAY.y, 92);
    runway.add(truck);
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
  while (palmSpots.length < 420 && guard++ < 8000) {
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

  // Bushes + boulders: instanced low scrub and grey rock scattered on land.
  const bushSpots = [];
  let bguard = 0;
  while (bushSpots.length < 170 && bguard++ < 5000) {
    const x = (rng() * 2 - 1) * 950, z = (rng() * 2 - 1) * 950;
    const h = heightAt(x, z);
    if (h < 4 || h > 34) continue;
    if (x > RUNWAY.x0 - 20 && x < RUNWAY.x1 + 20 && z > RUNWAY.z0 - 20 && z < RUNWAY.z1 + 20) continue;
    bushSpots.push({ x, z, h, s: 0.7 + rng() * 1.1, r: rng() * Math.PI * 2 });
  }
  const bushGeo = new THREE.SphereGeometry(1.6, 7, 5);
  bushGeo.scale(1, 0.65, 1); bushGeo.translate(0, 0.8, 0);
  const bushes = new THREE.InstancedMesh(bushGeo, new THREE.MeshLambertMaterial({ color: 0x4a7d38 }), bushSpots.length);
  const rockSpots = [];
  let rguard = 0;
  while (rockSpots.length < 90 && rguard++ < 5000) {
    const x = (rng() * 2 - 1) * 950, z = (rng() * 2 - 1) * 950;
    const h = heightAt(x, z);
    if (h < 3 || h > 48) continue;
    if (x > RUNWAY.x0 - 20 && x < RUNWAY.x1 + 20 && z > RUNWAY.z0 - 20 && z < RUNWAY.z1 + 20) continue;
    rockSpots.push({ x, z, h, s: 0.8 + rng() * 1.6, r: rng() * Math.PI * 2 });
  }
  const boulderGeo = new THREE.IcosahedronGeometry(1.5, 0);
  const boulders = new THREE.InstancedMesh(boulderGeo, new THREE.MeshLambertMaterial({ color: 0x8d8378 }), rockSpots.length);
  [ [bushes, bushSpots], [boulders, rockSpots] ].forEach(([mesh, spots]) => {
    spots.forEach((p, i) => {
      eu.set(0, p.r, 0); q.setFromEuler(eu); sc.set(p.s, p.s, p.s); pv.set(p.x, p.h - 0.2, p.z);
      m4.compose(pv, q, sc); mesh.setMatrixAt(i, m4);
    });
    scene.add(mesh);
  });

  // Landmarks near the runway: a striped lighthouse east of the strip and
  // three thatched huts south of it, so the cover frame has recognisable depth.
  const lighthouse = new THREE.Group();
  const lhY = heightAt(212, 82);
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 3.0, 16, 10),
    new THREE.MeshLambertMaterial({ color: 0xf5f2ea }));
  tower.position.y = 8; lighthouse.add(tower);
  const stripeMat = new THREE.MeshLambertMaterial({ color: 0xd23c2a });
  for (const sy of [4.5, 10.5]) {
    const band = new THREE.Mesh(new THREE.CylinderGeometry(2.45, 2.65, 2.2, 10), stripeMat);
    band.position.y = sy; lighthouse.add(band);
  }
  const lampRoom = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 1.9, 2.4, 10),
    new THREE.MeshLambertMaterial({ color: 0x222226 }));
  lampRoom.position.y = 17; lighthouse.add(lampRoom);
  const lampGlow = new THREE.Mesh(new THREE.SphereGeometry(1.1, 10, 8),
    new THREE.MeshBasicMaterial({ color: 0xffe9a8 }));
  lampGlow.position.y = 17; lighthouse.add(lampGlow);
  const lhCap = new THREE.Mesh(new THREE.ConeGeometry(2.4, 2.2, 10), stripeMat);
  lhCap.position.y = 19.4; lighthouse.add(lhCap);
  lighthouse.position.set(212, lhY, 82);
  scene.add(lighthouse);
  const hutWall = new THREE.MeshLambertMaterial({ color: 0xc9a06a });
  const hutRoof = new THREE.MeshLambertMaterial({ color: 0x8a5a30 });
  for (const [hx, hz, hr] of [[-150, 158, 0.3], [-122, 166, -0.5], [186, 162, 0.9]]) {
    const hut = new THREE.Group();
    const hy = heightAt(hx, hz);
    const walls = new THREE.Mesh(new THREE.BoxGeometry(7, 3.4, 6), hutWall);
    walls.position.y = 1.7; hut.add(walls);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(5.6, 3.2, 4), hutRoof);
    roof.position.y = 5.0; roof.rotation.y = Math.PI / 4; hut.add(roof);
    hut.position.set(hx, hy, hz); hut.rotation.y = hr;
    scene.add(hut);
  }

  // VILLAGE — 9 small houses with coloured roofs east of the runway, plus a
  // road strip. All spots verified against heightAt (h 13–19 m, land),
  // clear of the runway (x > 190), the beach strip and the ring course
  // (nearest ring, ring 8 at (60, 200), is ~180 m away).
  const houseWalls = [0xf5ead0, 0xffffff, 0xf0d8b0, 0xdfe8f0].map(
    (col) => new THREE.MeshLambertMaterial({ color: col }));
  const houseRoofs = [0xd23c2a, 0x2a6db0, 0x3f8f4f, 0xe8a13c].map(
    (col) => new THREE.MeshLambertMaterial({ color: col }));
  const villageSpots = [
    [240, 180], [268, 205], [292, 178], [248, 232], [286, 238],
    [312, 202], [238, 152], [318, 168], [262, 262],
  ];
  villageSpots.forEach(([hx, hz], vi) => {
    const house = new THREE.Group();
    const hy = heightAt(hx, hz);
    const hs = 0.9 + rng() * 0.35;
    const walls = new THREE.Mesh(new THREE.BoxGeometry(7, 3.2, 6), houseWalls[vi % houseWalls.length]);
    walls.position.y = 1.6; house.add(walls);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(5.4, 3.0, 4), houseRoofs[vi % houseRoofs.length]);
    roof.position.y = 4.7; roof.rotation.y = Math.PI / 4; house.add(roof);
    house.position.set(hx, hy, hz);
    house.rotation.y = rng() * Math.PI * 2;
    house.scale.set(hs, hs, hs);
    scene.add(house);
  });
  // Road strip through the village: 3 short segments, each seated on the
  // local terrain height so it never floats or clips.
  const roadMat = new THREE.MeshLambertMaterial({ color: 0x6a6a66 });
  for (const [rx, rz] of [[245, 173], [276, 185], [308, 197]]) {
    const segGeo = new THREE.PlaneGeometry(34, 4.5);
    segGeo.rotateX(-Math.PI / 2);
    const seg = new THREE.Mesh(segGeo, roadMat);
    seg.position.set(rx, heightAt(rx, rz) + 0.25, rz);
    seg.rotation.y = -0.33;
    scene.add(seg);
  }

  // HARBOUR — a small wooden pier on the east shore plus 3 boats anchored
  // in the bay. Boat spots verified water (heightAt -2.6 / -3.9 / -5.6),
  // clear of the runway, beach strip and ring course.
  const pier = new THREE.Group();
  const pierDeck = new THREE.Mesh(new THREE.BoxGeometry(16, 0.7, 3),
    new THREE.MeshLambertMaterial({ color: 0x8a6a4a }));
  pierDeck.position.y = 0.9; pier.add(pierDeck);
  const pierPostMat = new THREE.MeshLambertMaterial({ color: 0x5a4028 });
  for (const [px, pz] of [[-7, -1.2], [7, -1.2], [-7, 1.2], [7, 1.2]]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 1.6, 6), pierPostMat);
    post.position.set(px, 0.1, pz); pier.add(post);
  }
  pier.position.set(495, 0, 305);
  pier.rotation.y = 0.3;
  scene.add(pier);
  const boats = [];
  const sailShape = new THREE.Shape();
  sailShape.moveTo(0, 0); sailShape.lineTo(0, 3.6); sailShape.lineTo(2.4, 0.4); sailShape.lineTo(0, 0);
  const sailGeo = new THREE.ShapeGeometry(sailShape);
  const sailMat = new THREE.MeshBasicMaterial({ color: 0xf5f2ea, side: THREE.DoubleSide });
  const hullMat = new THREE.MeshLambertMaterial({ color: 0x7a4a28 });
  const hullMat2 = new THREE.MeshLambertMaterial({ color: 0x4a6a8a });
  for (let bi = 0; bi < 3; bi++) {
    const [bx, bz] = [[520, 300], [540, 270], [520, 360]][bi];
    const hdg = [-0.6, 0.4, 1.2][bi];
    const boat = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(7, 1.4, 2.6), bi === 1 ? hullMat2 : hullMat);
    hull.position.y = 0.6; boat.add(hull);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 5.5, 6),
      new THREE.MeshLambertMaterial({ color: 0x6a4a30 }));
    mast.position.set(0.8, 4.0, 0); boat.add(mast);
    const sail = new THREE.Mesh(sailGeo, sailMat);
    sail.position.set(0.9, 1.6, 0.05); boat.add(sail);
    boat.position.set(bx, 0.55, bz);
    boat.rotation.y = hdg;
    scene.add(boat);
    // Faint white wake strip trailing behind the boat.
    const wakeGeo = new THREE.PlaneGeometry(20, 2.2);
    wakeGeo.rotateX(-Math.PI / 2);
    const wakeMat = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.28, depthWrite: false,
    });
    const wake = new THREE.Mesh(wakeGeo, wakeMat);
    wake.position.set(bx - Math.cos(hdg) * 12, 0.45, bz + Math.sin(hdg) * 12);
    wake.rotation.y = hdg;
    wake.renderOrder = 2;
    scene.add(wake);
    boats.push({ group: boat, wakeMat, phase: rng() * Math.PI * 2, baseY: 0.55 });
  }

  // MOUNT EMBER — the archipelago's volcano, on the far north-east island.
  // Pure scenery: a separate decorative mesh, NOT part of heightAt(), so it
  // cannot change the flight model, the autopilot, or any landing.
  const EMBER_X = 640, EMBER_Z = -620;
  const emberBase = heightAt(EMBER_X, EMBER_Z) - 2;
  const EMBER_H = 85, EMBER_R = 110;
  const emberRock = new THREE.MeshLambertMaterial({ color: 0x4a3a32 });
  const emberCone = new THREE.Mesh(new THREE.ConeGeometry(EMBER_R, EMBER_H, 24), emberRock);
  emberCone.position.set(EMBER_X, emberBase + EMBER_H / 2, EMBER_Z);
  scene.add(emberCone);
  // Dark lava streaks running down the cone flanks; 3 of the 5 glow orange
  // with pulsing emissive (stored in lavaGlowMats, animated in update).
  const emberLavaDark = new THREE.MeshLambertMaterial({ color: 0x6e2a12 });
  const lavaGlowMats = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.4;
    let mat = emberLavaDark;
    if (i % 2 === 0) {
      mat = new THREE.MeshLambertMaterial({ color: 0x4a1a08, emissive: 0xff5a00, emissiveIntensity: 1.2 });
      lavaGlowMats.push(mat);
    }
    const streak = new THREE.Mesh(new THREE.ConeGeometry(7, EMBER_H * 0.72, 6), mat);
    const sr = EMBER_R * 0.52;
    streak.position.set(EMBER_X + Math.cos(a) * sr, emberBase + EMBER_H * 0.36, EMBER_Z + Math.sin(a) * sr);
    streak.rotation.z = Math.cos(a) * 0.35;
    streak.rotation.x = -Math.sin(a) * 0.35;
    scene.add(streak);
  }
  // Glowing crater: emissive orange disc + a large soft warm glow sprite.
  const craterY = emberBase + EMBER_H - 1;
  const crater = new THREE.Mesh(new THREE.CircleGeometry(30, 24),
    new THREE.MeshBasicMaterial({ color: 0xff6a1a, fog: false }));
  crater.rotation.x = -Math.PI / 2;
  crater.position.set(EMBER_X, craterY, EMBER_Z);
  scene.add(crater);
  const craterInner = new THREE.Mesh(new THREE.CircleGeometry(15, 20),
    new THREE.MeshBasicMaterial({ color: 0xffd23c, fog: false }));
  craterInner.rotation.x = -Math.PI / 2;
  craterInner.position.set(EMBER_X, craterY + 0.6, EMBER_Z);
  scene.add(craterInner);
  const emberGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeGlowTexture(), color: 0xff7a26, transparent: true, opacity: 0.85, depthWrite: false, fog: false,
  }));
  emberGlow.position.set(EMBER_X, craterY + 6, EMBER_Z);
  emberGlow.scale.set(300, 210, 1);
  scene.add(emberGlow);
  // Smoke column: taller plume (to ~300 m above the crater), more sprites,
  // drifting with the wind, looping back to the crater when they get high.
  // Low sprites catch warm orange light on the sun side; high ones are grey.
  const smokeTex = makeGlowTexture();
  const smoke = [];
  for (let i = 0; i < 12; i++) {
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({
      map: smokeTex, color: i < 4 ? 0x7a5240 : 0x3a3632, transparent: true, opacity: 0.5, depthWrite: false, fog: false,
    }));
    const f = i / 12;
    spr.position.set(EMBER_X + f * 55, craterY + 8 + f * 290, EMBER_Z - f * 18);
    const s = 46 + f * 95;
    spr.scale.set(s, s * 0.8, 1);
    spr.userData.rise = 7 + rng() * 5;
    spr.userData.top = craterY + 300;
    scene.add(spr); smoke.push(spr);
  }
  // Ember particles: ~90 tiny glowing dots rising out of the crater.
  const EMBER_N = 90;
  const emberPos = new Float32Array(EMBER_N * 3);
  const emberSeed = [];
  for (let i = 0; i < EMBER_N; i++) {
    emberSeed.push({ r: rng() * 22, a: rng() * Math.PI * 2, y: rng() * 55, v: 9 + rng() * 14 });
    emberPos[i * 3] = EMBER_X + Math.cos(emberSeed[i].a) * emberSeed[i].r;
    emberPos[i * 3 + 1] = craterY + emberSeed[i].y;
    emberPos[i * 3 + 2] = EMBER_Z + Math.sin(emberSeed[i].a) * emberSeed[i].r;
  }
  const emberGeo = new THREE.BufferGeometry();
  emberGeo.setAttribute('position', new THREE.BufferAttribute(emberPos, 3));
  const emberPts = new THREE.Points(emberGeo, new THREE.PointsMaterial({
    color: 0xffb03a, size: 4.4, transparent: true, opacity: 0.95, depthWrite: false, fog: false,
  }));
  scene.add(emberPts);

  // EAGLE'S NEST — watchtower on the NW ridge at (-300, -200).
  // Pure scenery: a separate decorative mesh, NOT part of heightAt(), so it
  // cannot change the flight model, the autopilot, or any landing.
  // Pale stone shaft + red conical roof, distinct from the striped
  // lighthouse at (212, 82) and from Mount Ember far to the NE. Base sits
  // on the ridge (heightAt ~43.6 m); total height ~32 m, so the roof reads
  // in the cover frame's left third (camera at ~(60, 45, 350) looking north).
  const NEST_X = -300, NEST_Z = -200;
  const nestBase = heightAt(NEST_X, NEST_Z);
  const nest = new THREE.Group();
  const nestStone = new THREE.MeshLambertMaterial({ color: 0xd8cdb8 });
  const nestStoneDark = new THREE.MeshLambertMaterial({ color: 0xb5a98d });
  const nestRed = new THREE.MeshLambertMaterial({ color: 0xb03a24 });
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(4.4, 5.0, 2.5, 10), nestStoneDark);
  plinth.position.y = 1.25; nest.add(plinth);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 3.6, 24, 10), nestStone);
  shaft.position.y = 2.5 + 12; nest.add(shaft);
  const gallery = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 3.0, 2.2, 10), nestStoneDark);
  gallery.position.y = 25.6; nest.add(gallery);
  const nestRoof = new THREE.Mesh(new THREE.ConeGeometry(4.0, 5.0, 10), nestRed);
  nestRoof.position.y = 26.7 + 2.5; nest.add(nestRoof);
  const nestFinial = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 6),
    new THREE.MeshLambertMaterial({ color: 0x8a2a18 }));
  nestFinial.position.y = 31.9; nest.add(nestFinial);
  // Small warm glowing window on the south face (toward the cover camera).
  const nestWindow = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.9),
    new THREE.MeshBasicMaterial({ color: 0xffc36a, fog: false }));
  nestWindow.position.set(0, 18, 3.15); nest.add(nestWindow);
  const nestWindowGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeGlowTexture(), color: 0xffb45e, transparent: true, opacity: 0.65, depthWrite: false, fog: false,
  }));
  nestWindowGlow.position.set(0, 18, 3.6);
  nestWindowGlow.scale.set(9, 9, 1); nest.add(nestWindowGlow);
  // A second small window on the west face, for the rings/landing views.
  const nestWindowW = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.6),
    new THREE.MeshBasicMaterial({ color: 0xffc36a, fog: false }));
  nestWindowW.position.set(-3.05, 12, 0);
  nestWindowW.rotation.y = -Math.PI / 2; nest.add(nestWindowW);
  nest.position.set(NEST_X, nestBase - 0.4, NEST_Z);
  scene.add(nest);

  // SUN GLITTER — ~20 small warm-white glow sprites on the water plane,
  // scattered along a band toward the low sun (sun direction
  // (-0.72, 0.32, -0.42); sun sprite at (-2900, 950, -1700)). The band runs
  // NW from the island's NW shore into open water (all points verified
  // heightAt < 0), clear of the runway/beach strips and of the ring course
  // (nearest ring at (-650, 60, -300) is skirted by a 100 m exclusion).
  const glitterTex = makeGlowTexture();
  const glitter = [];
  const GLITTER_DIR = { x: -0.864, z: -0.504 }; // sun direction, xz-normalised
  const GLITTER_PERP = { x: 0.504, z: -0.864 };
  const RING_XZ = [[260, -40], [480, -380], [120, -620], [-380, -560], [-650, -300], [-480, 180], [-120, 420], [60, 200]];
  let gGuard = 0;
  while (glitter.length < 20 && gGuard++ < 400) {
    const along = 120 + rng() * 1060;
    const side = (rng() * 2 - 1) * 55;
    const gx = -420 + GLITTER_DIR.x * along + GLITTER_PERP.x * side;
    const gz = -140 + GLITTER_DIR.z * along + GLITTER_PERP.z * side;
    if (heightAt(gx, gz) > -0.5) continue; // must be open water
    if (RING_XZ.some(([rx, rz]) => Math.hypot(gx - rx, gz - rz) < 100)) continue;
    const base = 0.35 + rng() * 0.25;
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glitterTex, color: 0xffe9c0, transparent: true, opacity: base, depthWrite: false,
    }));
    // Draw after the transparent water plane (which is centred near the
    // camera, so depth-sorting would otherwise paint the water over these
    // sprites and hide them); they float just above the surface, so
    // rendering them last is geometrically correct.
    spr.renderOrder = 2;
    const gs = 20 + rng() * 26;
    spr.position.set(gx, 0.5, gz);
    spr.scale.set(gs, gs * 0.55, 1);
    scene.add(spr);
    glitter.push({ spr, base, phase: rng() * Math.PI * 2 });
  }

  // BIRD FLOCK — 12 small dark "V" birds circling the main island at
  // ~85–115 m altitude. Pure scenery; slow orbit + slight bob + wing flap.
  const birdMat = new THREE.MeshBasicMaterial({ color: 0x1e1e24, side: THREE.DoubleSide });
  function birdWingGeo(mirror) {
    const g = new THREE.BufferGeometry();
    const s = mirror ? 1 : -1;
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
      0, 0, 0.9, 0, 0, -0.9, s * 2.4, 0, 0.1,
    ]), 3));
    g.computeVertexNormals();
    return g;
  }
  const birdWingL = birdWingGeo(false), birdWingR = birdWingGeo(true);
  const birds = [];
  for (let i = 0; i < 12; i++) {
    const bird = new THREE.Group();
    const wl = new THREE.Mesh(birdWingL, birdMat);
    const wr = new THREE.Mesh(birdWingR, birdMat);
    bird.add(wl); bird.add(wr);
    scene.add(bird);
    birds.push({
      group: bird, wl, wr,
      radius: 380 + (i % 6) * 26,
      alt: 85 + (i % 4) * 10,
      angle: (i / 12) * Math.PI * 2,
      omega: 0.030 + (i % 3) * 0.006,
      phase: rng() * Math.PI * 2,
      flap: 5.5 + rng() * 1.5,
    });
  }
  const BIRD_C = { x: 0, z: -80 }; // flock circles the main island

  // Soft clouds: glowing sprite blobs drifting slowly.
  const cloudTex = makeGlowTexture();
  const clouds = [];
  for (let i = 0; i < 44; i++) {
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({
      map: cloudTex, color: i % 3 === 0 ? 0xffd9a8 : 0xffe8c8, transparent: true, opacity: 0.5 + rng() * 0.25, depthWrite: false,
    }));
    const a = rng() * Math.PI * 2, r = 250 + rng() * 1500;
    spr.position.set(Math.cos(a) * r, 150 + rng() * 260, Math.sin(a) * r);
    const s = 110 + rng() * 320;
    spr.scale.set(s, s * (0.32 + rng() * 0.22), 1);
    spr.userData.drift = 1.5 + rng() * 2.5;
    scene.add(spr); clouds.push(spr);
  }

  // Low cloud layer: sparse sprites at 40–60 m over open water, below
  // typical flight altitude. Kept clear of the runway approach corridor
  // (x -220..220, z 60..600), the ring course (120 m exclusion) and the
  // cover camera (60, 350). They join `clouds` so they drift in update.
  const LOW_RINGS = [[260, -40], [480, -380], [120, -620], [-380, -560], [-650, -300], [-480, 180], [-120, 420], [60, 200]];
  let lGuard = 0;
  while (clouds.length < 44 + 14 && lGuard++ < 400) {
    const a = rng() * Math.PI * 2, r = 600 + rng() * 700;
    const lx = Math.cos(a) * r, lz = Math.sin(a) * r;
    if (heightAt(lx, lz) > -0.5) continue; // over water only
    if (lx > -220 && lx < 220 && lz > 60 && lz < 600) continue; // approach corridor
    if (Math.hypot(lx - 60, lz - 350) < 250) continue; // cover camera
    if (LOW_RINGS.some(([rx, rz]) => Math.hypot(lx - rx, lz - rz) < 120)) continue;
    const lspr = new THREE.Sprite(new THREE.SpriteMaterial({
      map: cloudTex, color: 0xfff2dd, transparent: true, opacity: 0.35 + rng() * 0.2, depthWrite: false,
    }));
    lspr.position.set(lx, 40 + rng() * 20, lz);
    const ls = 90 + rng() * 130;
    lspr.scale.set(ls, ls * (0.3 + rng() * 0.2), 1);
    lspr.userData.drift = 1.0 + rng() * 2.0;
    scene.add(lspr); clouds.push(lspr);
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
      // Mount Ember: smoke rises and drifts east with the wind, then loops;
      // embers rise out of the crater and fade back down to it.
      for (const sp of smoke) {
        sp.position.y += sp.userData.rise * dt;
        sp.position.x += 3.2 * dt;
        if (sp.position.y > sp.userData.top) {
          sp.position.y = craterY + 8;
          sp.position.x = EMBER_X;
        }
      }
      // Mount Ember lava rivulets pulse orange.
      for (let li = 0; li < lavaGlowMats.length; li++) {
        lavaGlowMats[li].emissiveIntensity = 1.05 + Math.sin(t * 2.6 + li * 1.3) * 0.45;
      }
      // Lens flare breathes very gently.
      for (const f of flare) {
        f.spr.material.opacity = f.base * (0.85 + 0.15 * Math.sin(t * 0.8 + f.phase));
      }
      // Foam rings pulse at the shoreline.
      for (const fr of foamRings) {
        fr.mesh.material.opacity = fr.base * (0.75 + 0.25 * Math.sin(t * 0.9 + fr.phase));
        const fs = 1 + 0.06 * Math.sin(t * 0.9 + fr.phase);
        fr.mesh.scale.set(fs, 1, fs);
      }
      // Harbour boats bob gently; their wakes fade in and out.
      for (const b of boats) {
        b.group.position.y = b.baseY + Math.sin(t * 0.8 + b.phase) * 0.12;
        b.group.rotation.z = Math.sin(t * 0.7 + b.phase) * 0.03;
        b.wakeMat.opacity = 0.22 + 0.08 * Math.sin(t * 1.1 + b.phase);
      }
      emberGlow.material.opacity = 0.75 + Math.sin(t * 2.2) * 0.12;
      const ep = emberGeo.attributes.position;
      for (let i = 0; i < EMBER_N; i++) {
        const s = emberSeed[i];
        s.y += s.v * dt;
        if (s.y > 75) { s.y = 0; s.r = rng() * 22; s.a = rng() * Math.PI * 2; }
        ep.setXYZ(i, EMBER_X + Math.cos(s.a) * s.r, craterY + s.y, EMBER_Z + Math.sin(s.a) * s.r);
      }
      ep.needsUpdate = true;
      cone.rotation.z = Math.PI / 2 - 0.25 + Math.sin(t * 1.7) * 0.08;
      // Eagle's Nest: the warm window glows a touch brighter and dimmer.
      nestWindowGlow.material.opacity = 0.55 + Math.sin(t * 1.4) * 0.15;
      // Sun glitter: each sparkle gently pulses out of phase.
      for (const g of glitter) {
        g.spr.material.opacity = g.base * (0.8 + 0.2 * Math.sin(t * 1.3 + g.phase));
      }
      // Bird flock: slow orbit around the island, slight bob, wing flap.
      for (const b of birds) {
        b.angle += b.omega * dt;
        const bx = BIRD_C.x + Math.cos(b.angle) * b.radius;
        const bz = BIRD_C.z + Math.sin(b.angle) * b.radius;
        const by = b.alt + Math.sin(t * 0.9 + b.phase) * 3;
        const nx = BIRD_C.x + Math.cos(b.angle + 0.05) * b.radius;
        const nz = BIRD_C.z + Math.sin(b.angle + 0.05) * b.radius;
        b.group.position.set(bx, by, bz);
        b.group.lookAt(nx, by, nz);
        const flap = 0.28 + Math.sin(t * b.flap + b.phase) * 0.38;
        b.wl.rotation.z = flap;
        b.wr.rotation.z = -flap;
      }
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
