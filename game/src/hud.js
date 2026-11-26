// hud.js — DOM HUD: speed, altitude, heading tape, fuel, damage, rings, timer,
// score, artificial horizon, warnings, and the menu / briefing / debrief screens.
import { MISSIONS } from './config.js';

function el(id) { return document.getElementById(id); }

export function createHud() {
  const horizonCtx = el('hud-horizon').getContext('2d');

  function drawHorizon(bank, pitch) {
    const c = horizonCtx, W = 150, H = 110;
    c.clearRect(0, 0, W, H);
    c.save();
    c.beginPath(); c.arc(W / 2, H / 2, 52, 0, Math.PI * 2); c.clip();
    c.translate(W / 2, H / 2);
    c.rotate(bank);
    const dy = pitch * 90;
    // Sky first, over the whole clipped circle, then ground from the horizon
    // line down: at steep pitch the old sky rect left a transparent gap.
    c.fillStyle = '#3d7ac8';
    c.fillRect(-60, -60, 120, 120);
    c.fillStyle = '#8a6a3a';
    c.fillRect(-60, dy, 120, 120);
    c.fillStyle = '#ffffff';
    c.fillRect(-60, dy - 1, 120, 2);
    c.restore();
    // Fixed wings marker.
    c.strokeStyle = '#ffd24a'; c.lineWidth = 3;
    c.beginPath();
    c.moveTo(W / 2 - 34, H / 2); c.lineTo(W / 2 - 12, H / 2);
    c.moveTo(W / 2 + 12, H / 2); c.lineTo(W / 2 + 34, H / 2);
    c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.7)'; c.lineWidth = 2;
    c.beginPath(); c.arc(W / 2, H / 2, 52, 0, Math.PI * 2); c.stroke();
  }

  let warnTimer = null;
  return {
    update(state, mission) {
      // state: flight state; mission: mission state (or null on menu).
      const kt = Math.round(state.speed * 1.944);
      const ft = Math.max(0, Math.round((state.y - 10) * 3.281));
      const vsFpm = Math.round(state.verticalSpeed * 196.85);
      const hdg = ((Math.round(Math.atan2(Math.cos(state.heading), -Math.sin(state.heading)) * 180 / Math.PI) % 360) + 360) % 360;
      el('hud-speed').textContent = String(kt);
      el('hud-alt').textContent = String(ft);
      el('hud-vs').textContent = (vsFpm >= 0 ? '+' : '') + vsFpm + ' fpm';
      el('hud-heading').textContent = String(hdg).padStart(3, '0') + '°';
      el('hud-throttle').style.width = Math.round(state.throttle * 100) + '%';
      el('hud-fuel').style.width = Math.max(0, Math.round(state.fuel)) + '%';
      el('hud-fuel-text').textContent = Math.round(state.fuel) + '%';
      el('hud-damage').style.width = Math.round(state.damage) + '%';
      el('hud-damage-text').textContent = Math.round(state.damage) + '%';
      if (mission) {
        el('hud-rings').textContent = mission.ringsDone + '/' + mission.ringsTotal;
        el('hud-time').textContent = fmtTime(Math.max(0, mission.timeLeft));
        el('hud-score').textContent = String(mission.score);
        el('hud-objective').textContent = mission._objective || '';
      }
      el('hud-fuel').classList.toggle('low', state.fuel < 25);
      el('hud-damage').classList.toggle('high', state.damage >= 50);
      drawHorizon(state.bank, state.pitch);
      // Warnings.
      let warn = '';
      if (state.stalled && state.airborne) warn = '⚠ STALL — NOSE DOWN, ADD THROTTLE';
      else if (state.fuel < 15 && state.fuel > 0) warn = '⚠ LOW FUEL';
      else if (state.fuel <= 0) warn = '⚠ FUEL EMPTY — GLIDE TO THE RUNWAY';
      else if (state.airborne && state.y < 30 && state.verticalSpeed < -6) warn = '⚠ PULL UP';
      const w = el('hud-warning');
      if (warn) { w.textContent = warn; w.classList.add('on'); }
      else { w.textContent = ''; w.classList.remove('on'); }
    },
    showWarning(text) {
      const w = el('hud-warning');
      w.textContent = text; w.classList.add('on');
      clearTimeout(warnTimer);
      warnTimer = setTimeout(() => { w.textContent = ''; w.classList.remove('on'); }, 2200);
    },
    showMessage(text) {
      const m = el('hud-message');
      m.textContent = text;
      m.classList.add('on');
      setTimeout(() => m.classList.remove('on'), 2400);
    },
    setState(screen, data) {
      // screen: menu | briefing | flying | paused | landed | crashed | debrief
      const show = (id, on) => { const n = el(id); if (n) n.classList.toggle('hidden', !on); };
      show('hud-menu', screen === 'menu');
      show('hud-briefing', screen === 'briefing');
      show('hud-debrief', screen === 'debrief' || screen === 'landed' || screen === 'crashed');
      show('hud-pause', screen === 'paused');
      show('hud-flight', screen === 'flying' || screen === 'paused');
      if (screen === 'briefing' && data) {
        el('briefing-title').textContent = data.def.name;
        el('briefing-text').textContent = data.def.briefing;
        el('briefing-par').textContent = 'Par time ' + data.def.parTime + ' s · Rings ' + data.def.rings;
      }
      if ((screen === 'debrief' || screen === 'landed' || screen === 'crashed') && data) {
        el('debrief-title').textContent = data.title;
        el('debrief-cause').textContent = data.cause || '';
        el('debrief-score').textContent = String(data.score);
        el('debrief-rows').innerHTML = data.breakdown.map(
          (b) => `<div class="db-row"><span>${b.label}</span><b>${b.value > 0 ? '+' : ''}${b.value}</b></div>`).join('');
      }
    },
    fillMenu() {
      el('menu-missions').innerHTML = MISSIONS.map((m) => (
        `<button class="mission-btn" data-mission="${m.id}">
          <span class="mission-key">${m.tag}</span>
          <span class="mission-name">${m.name}</span>
          <span class="mission-brief">${m.briefing}</span>
        </button>`)).join('');
    },
  };
}

function fmtTime(s) {
  const m = Math.floor(s / 60), ss = Math.floor(s % 60);
  return m + ':' + String(ss).padStart(2, '0');
}
