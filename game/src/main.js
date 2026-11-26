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
  if (SHOT === 'cover') {
    // Final approach to ring 8: ring ahead, runway beyond it, island in frame.
    Object.assign(flight, { x: 60, y: 45, z: 350, heading: -Math.PI / 2, pitch: 0, bank: 0, speed: 55, throttle: 0.7, onGround: false, airborne: true });
    mission.ringsDone = 7;
    mission.timeLeft = 62; mission.score = 700;
    // Keep the HUD clock consistent with the staged progress: 7 rings banked
    // +10 s each, so elapsed = par + bonuses - timeLeft.
    mission.timeBonusTotal = 70; mission.elapsed = 150 + 70 - 62;
    course.rings.forEach((r, i) => { if (i < 7) r.passed = true; });
    setRingStates(course.rings, 7);
  } else if (SHOT === 'rings') {
    // Close pass: 65 m out from ring 8, dead on its centre line.
    Object.assign(flight, { x: 60, y: 60, z: 265, heading: -Math.PI / 2, pitch: 0, bank: 0, speed: 60, throttle: 0.8, onGround: false, airborne: true });
    mission.ringsDone = 7;
    mission.timeLeft = 58; mission.score = 700;
    mission.timeBonusTotal = 70; mission.elapsed = 150 + 70 - 58;
    course.rings.forEach((r, i) => { if (i < 7) r.passed = true; });
    setRingStates(course.rings, 7);
  } else if (SHOT === 'landing') {
    // Final approach along the runway (heading east, down the strip): gear
    // down, 10 m above the deck, 250 m of runway ahead.
    Object.assign(flight, { x: -80, y: 20, z: 120, heading: 0, pitch: -0.05, bank: 0, speed: 42, throttle: 0.25, onGround: false, airborne: true, gearDown: true });
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
  const snap = input.snapshot();
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
    // Parked beauty shot: low three-quarter view of the plane on the runway.
    const px = flight.x, py = flight.y, pz = flight.z;
    camera.position.set(px - 26, py + 7, pz + 26);
    camera.lookAt(px + 8, py + 2, pz);
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
  const dist = 16 + flight.speed * 0.08;
  const height = 5 + flight.speed * 0.03;
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
  camera.lookAt(flight.x + fwd.x * 26, flight.y + 1.5, flight.z + fwd.z * 26);
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;
  if (SHOT) stageShot();
  update(dt, t);
  terrain.update(dt, t);
  updateAircraft(aircraft, flight, dt);
  updateCamera(dt, t);
  if (screen === 'flying' || screen === 'paused' || screen === 'landed' || screen === 'crashed') {
    hud.update(flight, mission);
  } else if (screen === 'menu') {
    hud.update(flight, null);
  }
  renderer.render(scene, camera);
  if (!window.__skyRingReady) window.__skyRingReady = true;
}

const clock = new THREE.Clock();
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
hud.setState('menu');
animate();
