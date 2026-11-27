// main.js — boot, game loop, state machine, cameras (chase / cockpit),
// ?shot= screenshot staging, deterministic seed. Exposes window.__skyRingReady
// (true after the first rendered frame) for the screenshot harness.
import * as THREE from 'three';
import { CONFIG, MISSIONS } from './config.js';
import { createFlightState, updateFlight, checkLanding, checkWaterCrash } from './flight.js';
import { buildTerrain } from './terrain.js';
import { buildAircraft, updateAircraft } from './aircraft.js';
import { buildRingCourse, checkRingPass, setRingStates } from './rings.js';
import { startMission, objectiveText, scoreMission } from './missions.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';
import { createInput } from './input.js';

const params = new URLSearchParams(location.search);
const SHOT = params.get('shot') || '';
const SEED = parseInt(params.get('seed') || String(CONFIG.seed), 10) || CONFIG.seed;
// Deterministic test-only autopilot: steers through the real flight/mission
// code paths (takeoff, ring centres, runway threshold, flare, landing).
// OFF unless ?autopilot=1; never affects normal play.
const AUTOPILOT = params.get('autopilot') === '1';
let autoStarted = false;
// Autopilot line-following direction per ring: +1 runs the inbound leg
// toward the gate; -1 flies back along the leg after an overshoot.
let autoRingIdx = -1;
let autoDir = 1;
// Autopilot final-approach direction: -1 flies west to the staging point,
// +1 flies the glide east onto the strip.
let autoFinalDir = -1;

const hud = createHud();
const audio = createAudio();
const input = createInput();

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.5, 6000);

const terrain = buildTerrain(scene, SEED);
const aircraft = buildAircraft(scene);
let course = null;
let flight = createFlightState();
let mission = null;
let screen = 'menu'; // menu | briefing | flying | paused | landed | crashed | debrief
let cameraMode = 'chase'; // chase | cockpit
let prevPos = { x: flight.x, y: flight.y, z: flight.z };
let debriefData = null;
let shotStaged = false;

hud.fillMenu();
document.querySelectorAll('.mission-btn').forEach((btn) => {
  btn.addEventListener('click', () => { audio.start(); audio.click(); pickMission(btn.dataset.mission); });
});
document.getElementById('briefing-start').addEventListener('click', () => { audio.start(); audio.click(); beginFlight(); });
document.getElementById('debrief-again').addEventListener('click', () => { audio.click(); pickMission(mission ? mission.def.id : 'ring-run'); });
document.getElementById('debrief-menu').addEventListener('click', () => { audio.click(); toMenu(); });
document.getElementById('pause-resume').addEventListener('click', () => { audio.click(); screen = 'flying'; hud.setState('flying'); });
document.getElementById('pause-menu').addEventListener('click', () => { audio.click(); toMenu(); });

function pickMission(id) {
  mission = startMission(id);
  course = buildRingCourse(scene, mission.def);
  flight = createFlightState();
  mission._objective = objectiveText(mission);
  screen = 'briefing';
  hud.setState('briefing', mission);
}

function beginFlight() {
  flight = createFlightState();
  if (course) course.reset();
  if (mission) { mission.ringsDone = 0; mission.timeLeft = mission.def.parTime; mission.timeBonusTotal = 0; mission.elapsed = 0; mission.finished = false; mission.beachLanded = false; mission.score = 0; }
  prevPos = { x: flight.x, y: flight.y, z: flight.z };
  screen = 'flying';
  hud.setState('flying');
  hud.showMessage(mission ? mission.def.name.toUpperCase() + ' — THROTTLE UP WITH W' : '');
}

function toMenu() {
  flight = createFlightState();
  mission = null;
  screen = 'menu';
  hud.setState('menu');
}

function endFlight(title, cause, finished) {
  if (mission) {
    mission.finished = finished;
    mission.score = scoreMission(flight, mission).score;
    debriefData = {
      title, cause,
      score: mission.score,
      breakdown: scoreMission(flight, mission).breakdown,
    };
  } else {
    debriefData = { title, cause, score: 0, breakdown: [] };
  }
  screen = finished ? 'landed' : 'crashed';
  hud.setState(screen, debriefData);
}

// ---- Screenshot staging (?shot=cover|rings|landing|menu) ----
function stageShot() {
  if (shotStaged) return;
  shotStaged = true;
  if (SHOT === 'menu') {
    toMenu();
    return;
  }
  mission = startMission('ring-run');
  course = buildRingCourse(scene, mission.def);
  flight = createFlightState();
  if (SHOT === 'debrief') {
    // Completed-mission debrief through the real endFlight path: all 8 rings
    // flown, soft touchdown, plausible finished score (recomputed by
    // scoreMission inside endFlight). Plane stays parked on the runway.
    course.rings.forEach((r) => { r.passed = true; });
    setRingStates(course.rings, 8);
    mission.ringsDone = 8;
    mission.timeLeft = 41;
    mission.timeBonusTotal = 80;
    mission.elapsed = 150 + 80 - 41;
    flight.fuel = 62;
    flight.damage = 0;
    mission._objective = objectiveText(mission);
    endFlight('MISSION COMPLETE', 'Soft touchdown on the runway. The Kestrel is home.', true);
    prevPos = { x: flight.x, y: flight.y, z: flight.z };
    return;
  }
  if (SHOT === 'cover') {
    // Hero: final approach to ring 8, 130 m out — plane lower-centre, ring 8
    // centred ahead, runway beyond it, Mount Ember (NE) in the background
    // right of frame, low sun giving rim light + water glitter. Slight bank
    // for a dynamic hero feel; heading stays north up the approach line.
    Object.assign(flight, { x: 60, y: 48, z: 330, heading: -Math.PI / 2, pitch: 0, bank: 0.12, speed: 55, throttle: 0.7, onGround: false, airborne: true });
    mission.ringsDone = 7;
    mission.timeLeft = 62; mission.score = 700;
    // Keep the HUD clock consistent with the staged progress: 7 rings banked
    // +10 s each, so elapsed = par + bonuses - timeLeft.
    mission.timeBonusTotal = 70; mission.elapsed = 150 + 70 - 62;
    course.rings.forEach((r, i) => { if (i < 7) r.passed = true; });
    setRingStates(course.rings, 7);
  } else if (SHOT === 'rings') {
    // Close pass: 45 m out from ring 8, dead on its centre line — the ring
    // fills the centre of frame and the plane is large, not a speck, with
    // the archipelago + Ember behind the gate.
    Object.assign(flight, { x: 60, y: 58, z: 245, heading: -Math.PI / 2, pitch: 0, bank: 0.1, speed: 60, throttle: 0.8, onGround: false, airborne: true });
    mission.ringsDone = 7;
    mission.timeLeft = 58; mission.score = 700;
    mission.timeBonusTotal = 70; mission.elapsed = 150 + 70 - 58;
    course.rings.forEach((r, i) => { if (i < 7) r.passed = true; });
    setRingStates(course.rings, 7);
  } else if (SHOT === 'landing') {
    // Final approach along the runway (heading east, down the strip): gear
    // down, 8 m above the deck, 260 m of runway ahead, plane lower-centre
    // with threshold markings + PAPI ahead.
    Object.assign(flight, { x: -90, y: 18, z: 120, heading: 0, pitch: -0.03, bank: 0, speed: 42, throttle: 0.25, onGround: false, airborne: true, gearDown: true });
    mission.ringsDone = 8;
    mission.timeLeft = 41; mission.score = 800;
    mission.timeBonusTotal = 80; mission.elapsed = 150 + 80 - 41;
    course.rings.forEach((r) => { r.passed = true; });
    setRingStates(course.rings, 8);
  }
  mission._objective = objectiveText(mission);
  screen = 'flying';
  hud.setState('flying');
  prevPos = { x: flight.x, y: flight.y, z: flight.z };
}

// ---- Autopilot (?autopilot=1, test-only) ----
// Returns a synthetic input snapshot each frame: bank toward the target
// bearing, pitch toward the target altitude, throttle toward a target speed.
// Target is the next ring's inbound leg (line-following), then the runway
// centreline traffic pattern (west staging, east glide, touchdown).
function autopilotInput() {
  const snap = {
    throttleUp: false, throttleDown: false,
    pitchUp: false, pitchDown: false,
    rollLeft: false, rollRight: false,
    yawLeft: false, yawRight: false, brake: false,
  };
  let tx, ty, tz, targetSpeed;
  const nextRing = course && course.rings.find((r) => !r.passed);
  if (!flight.airborne) {
    // Takeoff roll / ground roll: climb out straight down the runway.
    tx = flight.x + 400; ty = 90; tz = 120; targetSpeed = 58;
  } else if (nextRing) {
    // Line-following: fly the inbound leg as a LINE through the ring
    // centre (the ring faces along the leg from the previous ring). Pure
    // pursuit of the centre ends in a stable orbit ~60 m off the gate —
    // the turn radius at 52 m/s is ~140 m — so steer onto the line
    // instead: head along the leg, corrected toward the line by the
    // cross-track error. The line runs straight through the gate, so a
    // converged approach cannot miss it. Overshoot past the ring plane
    // flips the run direction until the plane is 300 m back up the leg.
    const idx = nextRing.index;
    const prevDef = idx === 0 ? { x: -150, y: 11, z: 120 } : course.rings[idx - 1].def;
    let ux = nextRing.def.x - prevDef.x;
    let uz = nextRing.def.z - prevDef.z;
    const ul = Math.hypot(ux, uz) || 1;
    ux /= ul; uz /= ul;
    const dx = flight.x - nextRing.def.x;
    const dz = flight.z - nextRing.def.z;
    const s = dx * ux + dz * uz; // along-track: negative before the ring
    if (nextRing.index !== autoRingIdx) { autoRingIdx = nextRing.index; autoDir = 1; }
    const cx = dx - s * ux; // cross-track offset
    const cz = dz - s * uz;
    const cross = Math.hypot(cx, cz);
    // Overshoot past the ring plane: fly back along the leg. Only turn
    // around and run the leg again once well back up the leg AND back on
    // the line — flipping on along-track alone re-triggers mid-turn and
    // the plane orbits the gate forever.
    if (s > 20) autoDir = -1;
    else if (s < -350 && cross < 100) autoDir = 1;
    const wx = autoDir * ux - cx / 40;
    const wz = autoDir * uz - cz / 40;
    tx = flight.x + wx * 100; // heading target only: aim 100 m along w
    tz = flight.z + wz * 100;
    ty = nextRing.def.y;
    targetSpeed = autoDir === 1 ? (s > -250 ? 40 : 52) : 40;
  } else {
    // Final approach as a traffic pattern on the runway centreline
    // (z=120): first fly WEST along the line to the staging point, then
    // turn around and fly the glide EAST onto the strip. Line-following
    // keeps the plane on the centreline; the glide stays above the 23 m
    // hills west of the strip (probed heights) and touches down around
    // mid-runway at ~1 m/s sink. Aiming straight at the threshold from
    // ring 8 instead leaves the plane orbiting the point at 16 m forever
    // (the old flare floored the pitch, so it could never descend).
    const cz = flight.z - 120; // cross-track off the centreline
    if (flight.x > 250) autoFinalDir = -1; // overshot east: go around
    else if (flight.x < -400 && Math.abs(cz) < 60) autoFinalDir = 1;
    const wx = autoFinalDir;
    const wz = 0 - cz / 40;
    tx = flight.x + wx * 100;
    tz = flight.z + wz * 100;
    if (autoFinalDir === -1) {
      ty = 45; // positioning leg, well above the western hills
    } else if (flight.x < -170) {
      ty = 27 + (-170 - flight.x) * 0.05;
    } else if (flight.x <= 0) {
      ty = 11 + (-flight.x) * 0.094;
    } else {
      ty = 11;
    }
    targetSpeed = flight.onGround ? 0 : 42;
  }
  // Bearing: bank so the heading rate turns us toward the target. A
  // negative bank raises the heading, so the desired bank is the negative
  // of the heading error.
  const wantHeading = Math.atan2(tz - flight.z, tx - flight.x);
  let err = wantHeading - flight.heading;
  err = Math.atan2(Math.sin(err), Math.cos(err));
  // Slow down for big turns: at 52 m/s the turn radius (~140 m) is too
  // wide to line up on a 400 m leg after a 140-degree course change; at
  // 32 m/s the radius is ~50 m and the plane converges onto the leg
  // instead of blowing past the gate 30 m off.
  if (Math.abs(err) > 0.7) targetSpeed = Math.min(targetSpeed, 32);
  const wantBank = Math.max(-1.1, Math.min(1.1, -err * 1.2));
  if (flight.bank < wantBank - 0.04) snap.rollRight = true;
  else if (flight.bank > wantBank + 0.04) snap.rollLeft = true;
  // Altitude: pitch for a vertical speed proportional to the height error,
  // flaring (nose up, slow) once low on final with the course complete.
  let wantVy = Math.max(-9, Math.min(9, (ty - flight.y) * 0.9));
  let wantPitch = Math.max(-0.35, Math.min(0.4, wantVy / Math.max(flight.speed, 15)));
  if (flight.pitch < wantPitch - 0.03) snap.pitchUp = true;
  else if (flight.pitch > wantPitch + 0.03) snap.pitchDown = true;
  // Speed: bang-bang throttle around the target speed.
  if (flight.speed < targetSpeed - 1) snap.throttleUp = true;
  else if (flight.speed > targetSpeed + 1.5) snap.throttleDown = true;
  return snap;
}

// ---- Per-frame update ----
function update(dt, t) {
  // One-shot actions.
  if (input.consume('mute')) { audio.setMuted(!audio.muted); hud.showMessage(audio.muted ? 'MUTED' : 'SOUND ON'); }
  if (input.consume('camera') && (screen === 'flying' || screen === 'paused')) {
    cameraMode = cameraMode === 'chase' ? 'cockpit' : 'chase';
  }
  if (screen === 'menu') {
    if (input.consume('mission1')) pickMission('ring-run');
    else if (input.consume('mission2')) pickMission('island-hop');
    else if (input.consume('mission3')) pickMission('time-trial');
  } else if (screen === 'briefing') {
    if (input.consume('confirm') || input.consume('mission1')) beginFlight();
    if (input.consume('back')) toMenu();
  } else if (screen === 'flying') {
    if (input.consume('pause')) { screen = 'paused'; hud.setState('paused'); }
    if (input.consume('restart')) beginFlight();
    if (input.consume('back')) toMenu();
    if (screen === 'flying') updateFlying(dt);
  } else if (screen === 'paused') {
    if (input.consume('pause') || input.consume('confirm')) { screen = 'flying'; hud.setState('flying'); }
    if (input.consume('restart')) beginFlight();
    if (input.consume('back')) toMenu();
  } else if (screen === 'landed' || screen === 'crashed') {
    if (input.consume('confirm') || input.consume('restart')) pickMission(mission ? mission.def.id : 'ring-run');
    if (input.consume('back')) toMenu();
  }
  if (screen === 'flying' || screen === 'paused' || screen === 'landed' || screen === 'crashed') {
    audio.setEngine(flight.throttle, flight.speed);
  }
}

function updateFlying(dt) {
  const snap = AUTOPILOT ? autopilotInput() : input.snapshot();
  const events = updateFlight(flight, snap, dt);
  if (events.includes('takeoff')) hud.showMessage('AIRBORNE — GEAR UP, FLY THE COURSE');
  // Keep the plane glued to the strip while it is still on the ground.
  if (flight.onGround) flight.y = terrain.heightAt(flight.x, flight.z) + 1.2;

  // Mission clock.
  mission.elapsed += dt;
  mission.timeLeft = Math.max(0, mission.def.parTime + (mission.timeBonusTotal || 0) - mission.elapsed);
  mission._objective = objectiveText(mission);
  if (mission.timeLeft <= 0 && !mission.finished) {
    endFlight('OUT OF TIME', 'The clock hit zero before you landed.', false);
    audio.crash();
    return;
  }

  // Ring pass.
  if (course) {
    const hit = checkRingPass(course.rings, flight, prevPos);
    if (hit >= 0) {
      const ring = course.rings[hit];
      mission.ringsDone++;
      mission.score += 100;
      if (mission.def.timeBonus) mission.timeBonusTotal = (mission.timeBonusTotal || 0) + mission.def.timeBonus;
      if (ring.isRefuel) {
        flight.fuel = Math.min(100, flight.fuel + CONFIG.refuelAmount);
        mission.refuelUsed = true;
        hud.showMessage('⛽ REFUEL RING — FUEL +' + CONFIG.refuelAmount + '%');
      } else {
        hud.showMessage('RING ' + (hit + 1) + ' — +100');
      }
      audio.chime();
      setRingStates(course.rings, mission.ringsDone);
    }
  }
  prevPos = { x: flight.x, y: flight.y, z: flight.z };

  // Water crash, then landing.
  if (checkWaterCrash(flight)) {
    audio.crash();
    endFlight('DITCHED IN THE SEA', 'You hit the water. The Kestrel is not a boat.', false);
    return;
  }
  const land = checkLanding(flight, terrain);
  if (land === 'landed') {
    audio.thud();
    const onBeach = terrain.isBeach(flight.x, flight.z);
    if (onBeach && mission.def.id === 'island-hop' && !mission.beachLanded) {
      mission.beachLanded = true;
      mission.score += 150;
      hud.showMessage('BEACH LANDING ✓ — NOW FLY BACK TO THE MAIN RUNWAY');
      return; // stay in flying: throttle up and take off again
    }
    const courseDone = mission.ringsDone >= mission.ringsTotal;
    const hopDone = mission.def.id === 'island-hop' && mission.beachLanded;
    if (courseDone || hopDone || mission.def.id === 'island-hop' && mission.ringsTotal === 0 && mission.beachLanded) {
      endFlight('MISSION COMPLETE', 'Soft touchdown on the runway. The Kestrel is home.', true);
    } else {
      endFlight('LANDED EARLY', 'You landed before finishing the course — partial score.', false);
    }
    return;
  }
  if (land === 'hard') {
    audio.thud();
    hud.showWarning('HARD LANDING — DAMAGE ' + Math.round(flight.damage) + '%');
    if (flight.damage >= 100) { audio.crash(); endFlight('AIRFRAME LOST', 'Damage reached 100% after a hard landing.', false); }
    return;
  }
  if (land === 'crashed') {
    audio.crash();
    const cause = flight.y <= 2 ? 'You hit the terrain.' : 'Hard impact — the airframe broke up.';
    endFlight('CRASHED', cause, false);
    return;
  }
  if (flight.damage >= 100) {
    audio.crash();
    endFlight('AIRFRAME LOST', 'Damage reached 100%.', false);
    return;
  }
  // Fuel out is survivable: glide. Low-fuel warning is on the HUD.
  if (flight.fuel <= 0 && !flight._fuelWarned) {
    hud.showWarning('FUEL EMPTY — GLIDE TO THE RUNWAY');
    flight._fuelWarned = true;
  }
}

// ---- Cameras ----
function updateCamera(dt, t) {
  const look = input.lookDelta();
  const fwd = { x: Math.cos(flight.heading), z: Math.sin(flight.heading) };
  if (screen === 'menu') {
    // Cinematic slow orbit around the parked plane on the runway. The camera
    // starts SW of the strip looking NE, high enough that Mount Ember + the
    // archipelago clear the foreground hills, with the low western sun
    // glittering on the water at the frame edges. The look point is biased
    // NE so the plane sits left of centre, clear of the right-docked menu
    // card. One revolution ~2 min.
    const px = flight.x, py = flight.y, pz = flight.z;
    const a = 5.35 + t * 0.05;
    camera.position.set(px + Math.sin(a) * 34, py + 16, pz + Math.cos(a) * 34);
    camera.lookAt(px + 14, py + 2, pz - 6);
    return;
  }
  if (cameraMode === 'cockpit') {
    // Sit just behind the canopy, not on the nose: the prop disc is 4 m ahead,
    // so the blades read as a spinner blur instead of filling the frame, and
    // the nose + HUD strip stay in view below.
    const cx = flight.x + fwd.x * 0.6, cz = flight.z + fwd.z * 0.6;
    camera.position.set(cx, flight.y + 1.5, cz);
    const lx = flight.x + fwd.x * 60 + look.x * 30;
    const lz = flight.z + fwd.z * 60;
    camera.lookAt(lx, flight.y + flight.pitch * 30 - 1.5 + look.y * 20, lz);
    camera.rotation.z += flight.bank * 0.35;
    return;
  }
  // Chase: behind and above, eased toward its target. Snap when far away
  // (first frames / staged shots) so the plane is never a speck on screen.
  // The look point sits a few metres ABOVE the plane so it reads in the
  // lower-centre third and the horizon lands ~40% from the top.
  const dist = 10 + flight.speed * 0.04;
  const height = 3 + flight.speed * 0.015;
  const tx = flight.x - fwd.x * dist + look.x * 8;
  const tz = flight.z - fwd.z * dist;
  const ty = flight.y + height + look.y * 4;
  const gap = Math.hypot(tx - camera.position.x, ty - camera.position.y, tz - camera.position.z);
  if (gap > 50) {
    camera.position.set(tx, ty, tz);
  } else {
    camera.position.x += (tx - camera.position.x) * Math.min(1, dt * 5);
    camera.position.y += (ty - camera.position.y) * Math.min(1, dt * 5);
    camera.position.z += (tz - camera.position.z) * Math.min(1, dt * 5);
  }
  // Look-toward-next-objective: bias the look point a few metres toward the
  // next ring (or the runway threshold once the course is done) so the
  // target stays in frame while the plane holds the lower-centre third.
  let lx = flight.x + fwd.x * 26;
  let lz = flight.z + fwd.z * 26;
  let ly = flight.y + 1;
  if (mission && course) {
    const next = course.rings.find((r) => !r.passed);
    const obj = next ? next.def : { x: 0, y: 12, z: 120 };
    const dx = obj.x - flight.x, dz = obj.z - flight.z;
    const dl = Math.hypot(dx, dz) || 1;
    lx += (dx / dl) * 10;
    lz += (dz / dl) * 10;
    ly += Math.max(-3, Math.min(3, (obj.y - flight.y) * 0.15));
  }
  camera.lookAt(lx, ly, lz);
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;
  if (SHOT) stageShot();
  if (AUTOPILOT && !SHOT && !autoStarted) {
    autoStarted = true;
    mission = startMission('ring-run');
    course = buildRingCourse(scene, mission.def);
    beginFlight();
  }
  // Test-only fast-forward: the software renderer runs at a few fps, so
  // advance the simulation in fixed 1/60 s steps several times per rendered
  // frame. Same code paths, same step size — only the wall-clock pace changes.
  // Normal play is untouched: it still steps once per frame with the real dt.
  if (AUTOPILOT) {
    for (let i = 0; i < 30; i++) update(1 / 60, t);
  } else {
    update(dt, t);
  }
  terrain.update(dt, t);
  // Ground height under the plane for the W3 water/ground blob shadow
  // (aircraft.js reads state.groundY when present; 0 over water).
  flight.groundY = Math.max(0, terrain.heightAt(flight.x, flight.z));
  updateAircraft(aircraft, flight, dt);
  updateCamera(dt, t);
  if (screen === 'flying' || screen === 'paused' || screen === 'landed' || screen === 'crashed') {
    hud.update(flight, mission);
  } else if (screen === 'menu') {
    hud.update(flight, null);
  }
  renderer.render(scene, camera);
  if (!window.__skyRingReady) window.__skyRingReady = true;
  if (AUTOPILOT && (screen === 'landed' || screen === 'crashed')) {
    window.__skyRingAutopilotResult = screen;
  }
  if (AUTOPILOT) {
    // Test-only probes for the screenshot harness.
    window.__skyRingHeightAt = (x, z) => terrain.heightAt(x, z);
    window.__skyRingDebug = () => ({
      screen, x: Math.round(flight.x), y: Math.round(flight.y), z: Math.round(flight.z),
      speed: Math.round(flight.speed), ringsDone: mission ? mission.ringsDone : 0,
      timeLeft: mission ? Math.round(mission.timeLeft) : 0, fuel: Math.round(flight.fuel),
      throttle: +flight.throttle.toFixed(2), bank: +flight.bank.toFixed(2),
      pitch: +flight.pitch.toFixed(2), onGround: flight.onGround,
      heading: +flight.heading.toFixed(2), airborne: flight.airborne,
      damage: Math.round(flight.damage),
    });
  }
}

const clock = new THREE.Clock();
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
hud.setState('menu');
animate();
