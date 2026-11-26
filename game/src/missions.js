// missions.js — mission select, briefing, objectives, debrief scoring.
import { MISSIONS, CONFIG } from './config.js';

export { MISSIONS };

export function startMission(id) {
  const def = MISSIONS.find((m) => m.id === id) || MISSIONS[0];
  return {
    def,
    ringsDone: 0,
    ringsTotal: def.rings,
    timeLeft: def.parTime,
    timeBonusTotal: 0,
    elapsed: 0,
    refuelUsed: false,
    beachLanded: false,   // Island Hop: beach strip touched down
    finished: false,
    cause: '',
    score: 0,
  };
}

// Objective line shown under the compass while flying.
export function objectiveText(m) {
  if (m.def.id === 'island-hop') {
    if (!m.beachLanded) return 'Land on the BEACH STRIP — island 2 (west)';
    return 'Beach landing done — fly back, land on the MAIN RUNWAY';
  }
  if (m.ringsDone < m.ringsTotal) {
    return `Ring ${m.ringsDone + 1} of ${m.ringsTotal} — circle Mount Ember, then land on the runway`;
  }
  return 'Course complete — land on the MAIN RUNWAY';
}

export function scoreMission(state, mission) {
  const ringPts = mission.ringsDone * CONFIG.ringScore;
  const timePts = mission.finished ? Math.max(0, Math.round(mission.timeLeft)) * 5 : 0;
  const fuelPts = mission.finished ? Math.round(state.fuel) * 2 : 0;
  const landPts = mission.finished ? CONFIG.landingBonus : 0;
  const dmgPts = -Math.round(state.damage);
  const score = Math.max(0, ringPts + timePts + fuelPts + landPts + dmgPts);
  return {
    score,
    breakdown: [
      { label: 'Rings', value: ringPts },
      { label: 'Landing bonus', value: landPts },
      { label: 'Time left', value: timePts },
      { label: 'Fuel left', value: fuelPts },
      { label: 'Damage', value: dmgPts },
    ],
  };
}
