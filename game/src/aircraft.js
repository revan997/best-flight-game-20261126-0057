// aircraft.js — the "Kestrel" bush plane, built from Three.js primitives:
// fuselage, tapered wings, tail, spinning prop, tinted canopy, gear, wingtip lights.
// Model parts are built nose-on-+x, then an inner group turns the nose to +z
// so the outer group can use YXZ yaw/pitch/roll like a real aircraft.
import * as THREE from 'three';

// Wingtip contrails (W3): one sprite-puff pool per wingtip. A puff is born
// at the tip, stays behind in world space, grows and fades over TRAIL_LIFE.
// Pool size caps live sprites at TRAIL_POOL per tip; spawn interval is
// chosen so at most TRAIL_LIFE / TRAIL_INTERVAL = 24 puffs are alive.
const TRAIL_POOL = 24;
const TRAIL_LIFE = 1.5; // seconds until a puff fully fades
const TRAIL_INTERVAL = 0.0625; // spawn one puff per wingtip every 1/16 s
const TRAIL_MIN_SPEED = 30; // m/s — only trail when airborne and fast
const TRAIL_MAX_OPACITY = 0.5;
const TRAIL_START_SCALE = 1.0;
const TRAIL_END_SCALE = 3.2;
const _tipPos = new THREE.Vector3();

export function buildAircraft(scene) {
  const group = new THREE.Group();
  const model = new THREE.Group();
  model.rotation.y = -Math.PI / 2; // nose +x -> +z
  group.add(model);

  const orange = new THREE.MeshLambertMaterial({ color: 0xff6a2a });
  const cream = new THREE.MeshLambertMaterial({ color: 0xf3ead2 });
  const white = new THREE.MeshLambertMaterial({ color: 0xf5f2ea });
  const dark = new THREE.MeshLambertMaterial({ color: 0x2a2a30 });
  const glass = new THREE.MeshPhongMaterial({
    color: 0x2a6a8a, shininess: 140, specular: 0xaaddff, transparent: true, opacity: 0.85,
  });

  // Fuselage: cream/ivory, tapered cylinder pointing +x (nose), plus a
  // rounded nose cap. Bold orange 'Kestrel' stripe runs along each side.
  const body = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 0.55, 7.2, 12), cream);
  body.rotation.z = Math.PI / 2;
  body.position.x = 0.2;
  model.add(body);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(1.02, 12, 10), cream);
  nose.scale.set(1.1, 1, 1);
  nose.position.x = 3.8;
  model.add(nose);
  const belly = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.5, 5.4, 12), white);
  belly.rotation.z = Math.PI / 2;
  belly.position.set(-0.4, -0.28, 0);
  model.add(belly);

  // Canopy: tinted half-dome over the cockpit.
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.95, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), glass);
  canopy.scale.set(1.7, 0.9, 1.05);
  canopy.position.set(1.1, 0.55, 0);
  model.add(canopy);

  // Wings: tapered boxes with white tips; tailplane + fin.
  const wingGeo = new THREE.BoxGeometry(2.6, 0.22, 5.4);
  const wingL = new THREE.Mesh(wingGeo, orange);
  wingL.position.set(0.4, 0.15, -3.4);
  model.add(wingL);
  const wingR = new THREE.Mesh(wingGeo, orange);
  wingR.position.set(0.4, 0.15, 3.4);
  model.add(wingR);
  for (const z of [-6.0, 6.0]) {
    const tip = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.24, 0.5), white);
    tip.position.set(0.4, 0.15, z);
    model.add(tip);
  }
  const tail = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.18, 4.4), orange);
  tail.position.set(-3.4, 0.35, 0);
  model.add(tail);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.0, 0.2), orange);
  fin.position.set(-3.4, 1.15, 0);
  fin.rotation.z = 0.25;
  model.add(fin);
  // Orange 'Kestrel' cheatline stripes along both fuselage sides, plus a
  // thin orange spine stripe on top. Fuselage radius at mid-body is ~0.8,
  // so the side stripes sit at |z| = 0.82 and protrude slightly.
  for (const z of [-0.82, 0.82]) {
    const sideStripe = new THREE.Mesh(new THREE.BoxGeometry(6.0, 0.38, 0.1), orange);
    sideStripe.position.set(0.2, 0.05, z);
    model.add(sideStripe);
  }
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(7.0, 0.12, 0.3), orange);
  stripe.position.set(0.2, 0.95, 0);
  model.add(stripe);

  // Propeller: hub + two blades in the YZ plane; spins around the nose (x) axis.
  const prop = new THREE.Group();
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.5, 10), dark);
  hub.rotation.z = Math.PI / 2;
  prop.add(hub);
  const bladeMat = new THREE.MeshLambertMaterial({ color: 0x9a938a, transparent: true, opacity: 0.9 });
  const bladeV = new THREE.Mesh(new THREE.BoxGeometry(0.12, 3.4, 0.42), bladeMat);
  prop.add(bladeV);
  const bladeH = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.42, 3.4), bladeMat);
  prop.add(bladeH);
  // Bright tip stripes so the blades never read as dark wedges.
  const tipMat = new THREE.MeshBasicMaterial({ color: 0xffc94d });
  for (const ty of [-1.55, 1.55]) {
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.5, 0.44), tipMat);
    tip.position.y = ty; prop.add(tip);
  }
  for (const tz of [-1.55, 1.55]) {
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.44, 0.5), tipMat);
    tip.position.z = tz; prop.add(tip);
  }
  prop.position.set(4.55, 0, 0);
  model.add(prop);
  // Spinner disc (reads as a spinning blur at speed): larger and brighter
  // than v4 so it reads at the 768x480 downscale, with a bright tip ring.
  const discMat = new THREE.MeshBasicMaterial({
    map: makeDiscTexture(), color: 0xe8e2d8, transparent: true, opacity: 0.3,
    side: THREE.DoubleSide, depthWrite: false,
  });
  const disc = new THREE.Mesh(new THREE.CircleGeometry(2.05, 28), discMat);
  disc.position.set(4.5, 0, 0);
  disc.rotation.y = Math.PI / 2;
  model.add(disc);
  const tipRingMat = new THREE.MeshBasicMaterial({
    color: 0xffc94d, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false,
  });
  const tipRing = new THREE.Mesh(new THREE.TorusGeometry(1.95, 0.07, 8, 40), tipRingMat);
  tipRing.position.set(4.5, 0, 0);
  tipRing.rotation.y = Math.PI / 2;
  model.add(tipRing);
  prop.userData.bladeMat = bladeMat;
  prop.userData.discMat = discMat;
  prop.userData.tipRingMat = tipRingMat;

  // Landing gear: three legs + wheels.
  const gear = new THREE.Group();
  const legMat = new THREE.MeshLambertMaterial({ color: 0x333338 });
  for (const [lx, lz] of [[2.2, -1.1], [2.2, 1.1], [-2.6, 0]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.5, 6), legMat);
    leg.position.set(lx, -1.0, lz);
    gear.add(leg);
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 12), dark);
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(lx, -1.7, lz);
    gear.add(wheel);
  }
  model.add(gear);

  // Wingtip nav lights: red left, green right, white tail. Each light gets
  // a small glow sprite so it stays visible in daylight.
  const glowTex = makeDiscTexture();
  const lightGeo = new THREE.SphereGeometry(0.16, 8, 8);
  function addNavLight(x, y, z, color) {
    const lamp = new THREE.Mesh(lightGeo, new THREE.MeshBasicMaterial({ color }));
    lamp.position.set(x, y, z);
    model.add(lamp);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color, transparent: true, opacity: 0.85, depthWrite: false,
    }));
    glow.position.set(x, y, z);
    glow.scale.set(1.1, 1.1, 1.1);
    model.add(glow);
    return { lamp, glow };
  }
  const navL = addNavLight(0.4, 0.15, -6.15, 0xff2222);
  const navR = addNavLight(0.4, 0.15, 6.15, 0x22ff44);
  const navT = addNavLight(-4.3, 0.4, 0, 0xffffff);
  // White tail strobe: double-blink ~1 Hz (bright for the first 0.12 s of
  // each second, dark the rest). Red belly beacon: slow pulse (~0.7 Hz).
  const strobeMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1 });
  const strobe = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), strobeMat);
  strobe.position.set(-4.35, 0.75, 0);
  model.add(strobe);
  const strobeGlowMat = new THREE.SpriteMaterial({
    map: glowTex, color: 0xffffff, transparent: true, opacity: 1, depthWrite: false,
  });
  const strobeGlow = new THREE.Sprite(strobeGlowMat);
  strobeGlow.position.set(-4.35, 0.75, 0);
  strobeGlow.scale.set(1.8, 1.8, 1.8);
  model.add(strobeGlow);
  const beaconMat = new THREE.MeshBasicMaterial({ color: 0xff2020, transparent: true, opacity: 0.6 });
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), beaconMat);
  beacon.position.set(0.2, -0.95, 0);
  model.add(beacon);
  const beaconGlowMat = new THREE.SpriteMaterial({
    map: glowTex, color: 0xff2020, transparent: true, opacity: 0.6, depthWrite: false,
  });
  const beaconGlow = new THREE.Sprite(beaconGlowMat);
  beaconGlow.position.set(0.2, -0.95, 0);
  beaconGlow.scale.set(1.6, 1.6, 1.6);
  model.add(beaconGlow);

  // Control surfaces (visual only, small deflections): ailerons hinged at
  // the wing trailing edges, elevator at the tailplane trailing edge, and
  // a rudder at the fin trailing edge. Geometry is translated so each
  // mesh origin sits on its hinge line.
  const ailGeo = new THREE.BoxGeometry(0.7, 0.1, 1.6);
  ailGeo.translate(-0.35, 0, 0);
  const aileronL = new THREE.Mesh(ailGeo, orange);
  aileronL.position.set(-0.9, 0.15, -4.6);
  model.add(aileronL);
  const aileronR = new THREE.Mesh(ailGeo, orange);
  aileronR.position.set(-0.9, 0.15, 4.6);
  model.add(aileronR);
  const elevGeo = new THREE.BoxGeometry(0.6, 0.1, 3.6);
  elevGeo.translate(-0.3, 0, 0);
  const elevator = new THREE.Mesh(elevGeo, orange);
  elevator.position.set(-4.3, 0.35, 0);
  model.add(elevator);
  const rudGeo = new THREE.BoxGeometry(0.7, 1.6, 0.12);
  rudGeo.translate(-0.35, 0, 0);
  const rudder = new THREE.Mesh(rudGeo, orange);
  rudder.position.set(-4.2, 1.15, 0);
  model.add(rudder);

  // Soft blob shadow on the water/ground: one ellipse mesh + radial
  // texture, added to the scene (world space). Positioned each frame at
  // (state.x, groundY + 0.3, state.z); hidden when state.groundY is
  // undefined (W1 adds flight.groundY in main.js).
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(1, 24),
    new THREE.MeshBasicMaterial({
      map: glowTex, color: 0x0a1a20, transparent: true, opacity: 0, depthWrite: false,
    }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.visible = false;
  scene.add(shadow);

  // Wingtip contrail anchors: invisible markers at the model-local tip
  // positions (0.4, 0.15, ±6.0). Their world position — via the group's
  // YXZ yaw/pitch/roll matrix — is where each puff is born.
  const tipL = new THREE.Object3D();
  tipL.position.set(0.4, 0.15, -6.0);
  model.add(tipL);
  const tipR = new THREE.Object3D();
  tipR.position.set(0.4, 0.15, 6.0);
  model.add(tipR);

  // Contrail puff pools: sprites share one radial-gradient texture (the
  // makeDiscTexture() pattern); each puff has its own material so its
  // opacity can fade independently. Puffs are added to the scene (world
  // space) so they stay behind the plane instead of following it.
  const puffTexture = makeDiscTexture();
  const trails = [];
  for (const tip of [tipL, tipR]) {
    const pool = [];
    for (let i = 0; i < TRAIL_POOL; i++) {
      const mat = new THREE.SpriteMaterial({
        map: puffTexture, color: 0xffffff, transparent: true,
        opacity: 0, depthWrite: false,
      });
      const sprite = new THREE.Sprite(mat);
      sprite.visible = false;
      scene.add(sprite);
      pool.push({ sprite, age: 0, active: false });
    }
    trails.push({ tip, pool, next: 0, acc: 0 });
  }

  scene.add(group);
  return {
    group, propeller: prop, gear, setGear(down) { gear.visible = down; }, trails,
    strobe, strobeGlow, strobeMat, strobeGlowMat,
    beacon, beaconMat, beaconGlowMat,
    aileronL, aileronR, elevator, rudder, shadow,
    _time: 0, _prevHeading: null,
  };
}

export function updateAircraft(aircraft, state, dt) {
  const g = aircraft.group;
  g.position.set(state.x, state.y, state.z);
  // Nose is +z after the inner turn: yaw PI/2 - heading, pitch nose-up, roll = bank.
  g.rotation.order = 'YXZ';
  g.rotation.y = Math.PI / 2 - state.heading;
  g.rotation.x = -state.pitch;
  g.rotation.z = state.bank;
  // Prop spins faster with throttle (and keeps windmilling in flight).
  const spinRate = 4 + state.throttle * 46 + state.speed * 0.35;
  const spin = spinRate * dt;
  aircraft.propeller.rotation.x += spin;
  // Fast spin blurs the blades away and strengthens the translucent disc
  // (and its bright tip ring) so the prop reads at the 768x480 downscale.
  const blur = Math.min(1, spinRate / 50);
  if (aircraft.propeller.userData.bladeMat) {
    aircraft.propeller.userData.bladeMat.opacity = 0.85 - 0.6 * blur;
  }
  if (aircraft.propeller.userData.discMat) {
    aircraft.propeller.userData.discMat.opacity = 0.14 + 0.22 * blur;
  }
  if (aircraft.propeller.userData.tipRingMat) {
    aircraft.propeller.userData.tipRingMat.opacity = 0.45 + 0.45 * blur;
  }
  aircraft.setGear(state.gearDown);

  // Time base: state.time (accumulated dt in flight.js); fall back to a
  // local dt accumulation. Never Date.now() / Math.random() (deterministic).
  const t = (state.time !== undefined && state.time !== null)
    ? state.time : ((aircraft._time = (aircraft._time || 0) + dt));
  // Tail strobe: ~1 Hz blink — bright for the first 0.12 s of each second.
  const strobeOn = (t % 1) < 0.12;
  const strobeOp = strobeOn ? 1 : 0.04;
  if (aircraft.strobeMat) aircraft.strobeMat.opacity = strobeOp;
  if (aircraft.strobeGlowMat) aircraft.strobeGlowMat.opacity = strobeOn ? 1 : 0.03;
  // Belly beacon: slow red pulse (~0.7 Hz, smooth sine).
  const beaconOp = 0.15 + 0.85 * (0.5 + 0.5 * Math.sin(t * 2 * Math.PI * 0.7));
  if (aircraft.beaconMat) aircraft.beaconMat.opacity = beaconOp;
  if (aircraft.beaconGlowMat) aircraft.beaconGlowMat.opacity = beaconOp;

  // Control surfaces (visual only, ±0.3 rad max): ailerons deflect
  // opposite with bank, elevator with pitch, rudder with heading rate.
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  if (aircraft.aileronL) aircraft.aileronL.rotation.z = clamp(state.bank * 1.2, -0.3, 0.3);
  if (aircraft.aileronR) aircraft.aileronR.rotation.z = clamp(-state.bank * 1.2, -0.3, 0.3);
  if (aircraft.elevator) aircraft.elevator.rotation.z = clamp(-state.pitch * 2, -0.3, 0.3);
  if (aircraft.rudder) {
    let yawRate = 0;
    if (aircraft._prevHeading !== null && dt > 0) {
      let d = state.heading - aircraft._prevHeading;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      yawRate = d / dt;
    }
    aircraft._prevHeading = state.heading;
    aircraft.rudder.rotation.y = clamp(yawRate * 1.5, -0.3, 0.3);
  }

  // Blob shadow: only when W1 has supplied state.groundY; fades and grows
  // with altitude (higher = larger + fainter), hidden above 120 m.
  if (aircraft.shadow) {
    if (state.groundY === undefined || state.groundY === null) {
      aircraft.shadow.visible = false;
    } else {
      const alt = Math.max(0, state.y - state.groundY);
      if (alt > 120) {
        aircraft.shadow.visible = false;
      } else {
        aircraft.shadow.visible = true;
        aircraft.shadow.position.set(state.x, state.groundY + 0.3, state.z);
        const k = 1 + alt / 40;
        aircraft.shadow.scale.set(4.2 * k, 3.0 * k, 1);
        aircraft.shadow.material.opacity = 0.32 * (1 - alt / 120);
      }
    }
  }

  // Wingtip contrails: while airborne and faster than TRAIL_MIN_SPEED,
  // spawn one puff per wingtip every TRAIL_INTERVAL at the tip's current
  // world position. Puffs age in world space, growing and fading over
  // TRAIL_LIFE, then recycle. Visual only — no flight/scoring effect.
  if (aircraft.trails) {
    for (const trail of aircraft.trails) {
      if (state.airborne && state.speed > TRAIL_MIN_SPEED) {
        trail.acc += dt;
        let guard = 0;
        while (trail.acc >= TRAIL_INTERVAL && guard++ < TRAIL_POOL) {
          trail.acc -= TRAIL_INTERVAL;
          const puff = trail.pool[trail.next];
          trail.next = (trail.next + 1) % TRAIL_POOL;
          trail.tip.getWorldPosition(_tipPos);
          puff.sprite.position.copy(_tipPos);
          puff.age = 0;
          puff.active = true;
          puff.sprite.visible = true;
          puff.sprite.scale.set(TRAIL_START_SCALE, TRAIL_START_SCALE, TRAIL_START_SCALE);
          puff.sprite.material.opacity = TRAIL_MAX_OPACITY;
        }
      } else {
        trail.acc = 0;
      }
      for (const puff of trail.pool) {
        if (!puff.active) continue;
        puff.age += dt;
        const t = puff.age / TRAIL_LIFE;
        if (t >= 1) {
          puff.active = false;
          puff.sprite.visible = false;
          puff.sprite.material.opacity = 0;
        } else {
          puff.sprite.material.opacity = TRAIL_MAX_OPACITY * (1 - t);
          const s = TRAIL_START_SCALE + (TRAIL_END_SCALE - TRAIL_START_SCALE) * t;
          puff.sprite.scale.set(s, s, s);
        }
      }
    }
  }
}

function makeDiscTexture() {
  const cv = document.createElement('canvas');
  cv.width = 128; cv.height = 128;
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  g.addColorStop(0, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.28)');
  g.addColorStop(0.9, 'rgba(255,255,255,0.10)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(cv);
}
