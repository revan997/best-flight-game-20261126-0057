// aircraft.js — the "Kestrel" bush plane, built from Three.js primitives:
// fuselage, tapered wings, tail, spinning prop, tinted canopy, gear, wingtip lights.
// Model parts are built nose-on-+x, then an inner group turns the nose to +z
// so the outer group can use YXZ yaw/pitch/roll like a real aircraft.
import * as THREE from 'three';

export function buildAircraft(scene) {
  const group = new THREE.Group();
  const model = new THREE.Group();
  model.rotation.y = -Math.PI / 2; // nose +x -> +z
  group.add(model);

  const orange = new THREE.MeshLambertMaterial({ color: 0xff6a2a });
  const white = new THREE.MeshLambertMaterial({ color: 0xf5f2ea });
  const dark = new THREE.MeshLambertMaterial({ color: 0x2a2a30 });
  const glass = new THREE.MeshPhongMaterial({
    color: 0x2a6a8a, shininess: 140, specular: 0xaaddff, transparent: true, opacity: 0.85,
  });

  // Fuselage: tapered cylinder pointing +x (nose), plus a rounded nose cap.
  const body = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 0.55, 7.2, 12), orange);
  body.rotation.z = Math.PI / 2;
  body.position.x = 0.2;
  model.add(body);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(1.02, 12, 10), orange);
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
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(7.0, 0.12, 0.3), white);
  stripe.position.set(0.2, 0.95, 0);
  model.add(stripe);

  // Propeller: hub + two blades in the YZ plane; spins around the nose (x) axis.
  const prop = new THREE.Group();
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.5, 10), dark);
  hub.rotation.z = Math.PI / 2;
  prop.add(hub);
  const bladeMat = new THREE.MeshLambertMaterial({ color: 0x222226, transparent: true, opacity: 0.9 });
  const bladeV = new THREE.Mesh(new THREE.BoxGeometry(0.12, 3.4, 0.42), bladeMat);
  prop.add(bladeV);
  const bladeH = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.42, 3.4), bladeMat);
  prop.add(bladeH);
  prop.position.set(4.55, 0, 0);
  model.add(prop);
  // Spinner disc (faint, reads as a spinning blur at speed).
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(1.75, 24),
    new THREE.MeshBasicMaterial({ color: 0xcccccc, transparent: true, opacity: 0.14, side: THREE.DoubleSide }));
  disc.position.set(4.5, 0, 0);
  disc.rotation.y = Math.PI / 2;
  model.add(disc);

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

  // Wingtip nav lights: red left, green right, white tail.
  const lightGeo = new THREE.SphereGeometry(0.16, 8, 8);
  const navL = new THREE.Mesh(lightGeo, new THREE.MeshBasicMaterial({ color: 0xff2222 }));
  navL.position.set(0.4, 0.15, -6.15);
  model.add(navL);
  const navR = new THREE.Mesh(lightGeo, new THREE.MeshBasicMaterial({ color: 0x22ff44 }));
  navR.position.set(0.4, 0.15, 6.15);
  model.add(navR);
  const navT = new THREE.Mesh(lightGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }));
  navT.position.set(-4.3, 0.4, 0);
  model.add(navT);

  scene.add(group);
  return { group, propeller: prop, gear, setGear(down) { gear.visible = down; } };
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
  const spin = (4 + state.throttle * 46 + state.speed * 0.35) * dt;
  aircraft.propeller.rotation.x += spin;
  aircraft.setGear(state.gearDown);
}
