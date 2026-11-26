// flight.js — arcade flight model: thrust/drag/lift/stall/bank/pitch/yaw,
// ground + water collision, landing detection. Units: metres, seconds, radians.
import { CONFIG } from './config.js';

export function createFlightState() {
  return {
    // Position: x east, y up, z south. Start parked at the west end of the runway.
    x: -150, y: CONFIG.runwayHeight + 1.2, z: 120,
    heading: Math.PI / 2,   // facing +x (east, down the runway)
    pitch: 0,
    bank: 0,
    speed: 0,               // m/s along the nose
    throttle: 0,
    verticalSpeed: 0,
    fuel: CONFIG.fuelCapacity,
    damage: 0,
    onGround: true,
    airborne: false,
    gearDown: true,
    stalled: false,
    time: 0,
  };
}

export function updateFlight(state, input, dt) {
  const events = [];
  dt = Math.min(dt, 0.05);
  state.time += dt;

  // Throttle (W/S), clamped 0..1. Airbrake adds drag.
  if (input.throttleUp) state.throttle = Math.min(1, state.throttle + dt * 0.55);
  if (input.throttleDown) state.throttle = Math.max(0, state.throttle - dt * 0.55);

  // Fuel burns with throttle; empty tank = no thrust.
  const burn = CONFIG.fuelBurnIdle + (CONFIG.fuelBurn - CONFIG.fuelBurnIdle) * state.throttle;
  state.fuel = Math.max(0, state.fuel - burn * dt * (state.onGround ? 0.4 : 1));
  const thrust = state.fuel > 0 ? state.throttle * CONFIG.thrustAccel : 0;

  // Stall: below stall speed lift collapses, nose drops, controls mush.
  const stallFactor = state.speed < CONFIG.stallSpeed
    ? Math.max(0, state.speed / CONFIG.stallSpeed) : 1;
  state.stalled = state.airborne && state.speed < CONFIG.stallSpeed;
  if (state.stalled && !state._stallWarned) { events.push('stall'); state._stallWarned = true; }
  if (!state.stalled) state._stallWarned = false;
  const control = state.airborne ? (0.35 + 0.65 * stallFactor) : 1;

  // Roll (bank) and pitch from arrow keys; rudder yaw from A/D.
  const rollIn = (input.rollRight ? 1 : 0) - (input.rollLeft ? 1 : 0);
  const pitchIn = (input.pitchUp ? 1 : 0) - (input.pitchDown ? 1 : 0);
  const yawIn = (input.yawRight ? 1 : 0) - (input.yawLeft ? 1 : 0);
  state.bank += rollIn * CONFIG.rollRate * control * dt;
  state.bank = Math.max(-CONFIG.maxBank, Math.min(CONFIG.maxBank, state.bank));
  // Bank bleeds off gently when no input; pitch eases toward level.
  if (!rollIn) state.bank *= Math.max(0, 1 - dt * 0.55);
  state.pitch += pitchIn * CONFIG.pitchRate * control * dt;
  if (state.stalled) state.pitch -= dt * 0.45; // nose drops in a stall
  state.pitch = Math.max(-0.6, Math.min(0.6, state.pitch));
  if (!pitchIn && state.airborne) state.pitch *= Math.max(0, 1 - dt * 0.35);

  // Heading rate follows bank (coordinated turn) plus a little rudder.
  const turnRate = -Math.tan(state.bank) * CONFIG.gravity / Math.max(state.speed, 12);
  state.heading += (turnRate + yawIn * CONFIG.yawRate * control * 0.4) * dt;

  // Speed: thrust minus quadratic drag (plus airbrake), pitch trades speed for height.
  const drag = CONFIG.dragCoef * state.speed * state.speed * (input.brake ? 1 + CONFIG.brakeDrag : 1);
  state.speed += (thrust - drag - Math.sin(state.pitch) * CONFIG.gravity * 0.9) * dt;
  if (state.speed < 0) state.speed = 0;

  // Takeoff: enough speed + a little pitch lifts off the ground.
  if (state.onGround && state.speed > CONFIG.stallSpeed * 0.9 && state.pitch > 0.04) {
    state.onGround = false; state.airborne = true; events.push('takeoff');
  }

  // Velocity along the nose; lift keeps us up only with airspeed.
  const cp = Math.cos(state.pitch), sp = Math.sin(state.pitch);
  const ch = Math.cos(state.heading), sh = Math.sin(state.heading);
  let vx = cp * ch * state.speed;
  let vz = cp * sh * state.speed;
  let vy = sp * state.speed;
  if (state.airborne) {
    // Sink when slow: lift shortfall pulls the plane down (a real sink rate).
    const liftShort = Math.max(0, 1 - state.speed / (CONFIG.stallSpeed * 1.35));
    vy -= liftShort * liftShort * 25;
  }
  state.x += vx * dt;
  state.z += vz * dt;
  state.y += vy * dt;
  state.verticalSpeed = vy;

  return events;
}

// Landing / crash test against terrain. Returns 'landed' | 'hard' | 'crashed' | null.
// terrain supplies heightAt(x,z) plus isRunway(x,z) / isBeach(x,z) strip tests.
export function checkLanding(state, terrain) {
  if (!state.airborne && state.onGround) return null;
  const ground = terrain.heightAt(state.x, state.z);
  if (state.y <= ground + 1.1) {
    state.y = ground + 1.1;
    const onStrip = terrain.isRunway(state.x, state.z) || terrain.isBeach(state.x, state.z);
    const aligned = Math.abs(Math.sin(state.heading - Math.PI / 2)) < 0.45 || onStrip;
    const vs = Math.abs(state.verticalSpeed);
    if (onStrip && aligned && vs <= CONFIG.softLandingVs && state.speed < 55) {
      state.onGround = true; state.airborne = false; state.speed *= 0.4;
      state.pitch = 0; state.bank = 0;
      return 'landed';
    }
    if (onStrip && vs <= CONFIG.hardLandingVs) {
      state.damage += CONFIG.damageHardLanding;
      state.onGround = true; state.airborne = false; state.speed *= 0.25;
      state.pitch = 0; state.bank = 0;
      return state.damage >= 100 ? 'crashed' : 'hard';
    }
    if (vs <= CONFIG.softLandingVs && state.speed < 55) {
      // Gentle touchdown off the strip: rough-field landing, not a crash.
      state.damage += 25;
      state.onGround = true; state.airborne = false; state.speed *= 0.25;
      state.pitch = 0; state.bank = 0;
      return state.damage >= 100 ? 'crashed' : 'hard';
    }
    state.damage = 100;
    return 'crashed';
  }
  return null;
}

export function checkWaterCrash(state) {
  if (state.y <= CONFIG.waterLevel + 0.6 && !state.onGround) {
    state.damage = 100;
    return true;
  }
  return false;
}
