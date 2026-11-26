// config.js — tuning constants + mission definitions for Sky Ring Run.
export const CONFIG = {
  seed: 20261126,
  // Flight tuning (SI units internally; HUD converts to kt / ft).
  maxSpeed: 95,          // m/s at full throttle, level flight
  cruiseSpeed: 55,
  stallSpeed: 28,        // ~55 kt: below this the nose drops and controls mush
  thrustAccel: 22,       // m/s^2 at full throttle
  dragCoef: 0.0026,      // quadratic drag
  pitchRate: 0.9,        // rad/s at full elevator
  rollRate: 1.9,         // rad/s at full aileron
  yawRate: 0.35,         // rad/s rudder
  maxBank: 1.15,         // rad (~66 deg)
  gravity: 9.81,
  brakeDrag: 0.9,        // extra drag multiplier with airbrake
  // Fuel / damage
  fuelCapacity: 100,
  fuelBurn: 1.0,         // %/s at full throttle (idle ~0.15)
  fuelBurnIdle: 0.15,
  refuelAmount: 55,      // % restored by the refuel ring
  damageHardLanding: 35,
  damageGroundHit: 100,
  crashDamage: 100,
  // Course
  ringCount: 8,
  ringRadius: 14,
  ringScore: 100,
  ringTimeBonus: 10,     // s added on Ring Run
  landingBonus: 250,
  softLandingVs: 4.5,    // m/s max sink for a soft touchdown
  hardLandingVs: 9,      // m/s: above this is a crash
  // World
  waterLevel: 0,
  runwayHeight: 10,
  sunElevation: 0.32,    // rad — low golden-hour sun
  fogNear: 400,
  fogFar: 2600,
};

export const MISSIONS = [
  {
    id: 'ring-run',
    name: 'Ring Run',
    tag: '1',
    briefing: 'Fly the 8-ring course over the archipelago, then land on the main runway. The gold ring refuels you. Par time 150 s.',
    rings: 8,
    parTime: 150,
    refuel: true,
    timeBonus: 10,
  },
  {
    id: 'island-hop',
    name: 'Island Hop',
    tag: '2',
    briefing: 'Land on the beach strip of the second island, then fly back and land on the main runway. Two short-field landings. Par time 240 s.',
    rings: 0,
    parTime: 240,
    refuel: false,
    timeBonus: 0,
    beachLanding: true,
  },
  {
    id: 'time-trial',
    name: 'Time Trial',
    tag: '3',
    briefing: 'Same 8 rings, tighter clock — 110 s, no refuel ring. Pure throttle discipline. Land on the main runway to finish.',
    rings: 8,
    parTime: 110,
    refuel: false,
    timeBonus: 0,
  },
];
