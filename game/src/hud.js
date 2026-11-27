// hud.js — Glass-cockpit HUD: scrolling speed/altitude/heading tapes, pitch
// ladder + flight-path marker, objective panel, minimap, six-pack gauges,
// plus the existing DOM readouts, horizon, warnings and menu screens.
// Display-only: nothing here affects flight, scoring or the autopilot.
import { MISSIONS } from './config.js';

function el(id) { return document.getElementById(id); }

// Ring course positions (display copy of rings.js COURSE — HUD only).
const COURSE = [
  { x: 260, y: 75, z: -40 },
  { x: 480, y: 95, z: -380 },
  { x: 120, y: 110, z: -620 },
  { x: -380, y: 85, z: -560 },
  { x: -650, y: 60, z: -300 },
  { x: -480, y: 90, z: 180 },
  { x: -120, y: 70, z: 420 },
  { x: 60, y: 60, z: 200 },
];
const RWY = { x: -170, y: 10, z: 120 }; // west threshold of runway 27

const GLASS_BG = 'rgba(6,16,30,0.78)';
const GLASS_EDGE = 'rgba(120,220,255,0.55)';
const TAPE_TXT = '#dff3ff';
const AMBER = '#ffd24a';
const CYAN = '#5ee6ff';

function fmtTime(s) {
  const m = Math.floor(s / 60), ss = Math.floor(s % 60);
  return m + ':' + String(ss).padStart(2, '0');
}
function fmtEta(sec) {
  if (!isFinite(sec) || sec <= 0) return '—';
  const m = Math.floor(sec / 60), ss = Math.floor(sec % 60);
  return m + ':' + String(ss).padStart(2, '0');
}
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

export function createHud() {
  const horizonCtx = el('hud-horizon').getContext('2d');
  const speedCtx = el('hud-speed-tape').getContext('2d');
  const altCtx = el('hud-alt-tape').getContext('2d');
  const hdgCtx = el('hud-hdg-tape').getContext('2d');
  const pitchCtx = el('hud-pitch').getContext('2d');
  const mapCtx = el('hud-minimap').getContext('2d');
  const packCtx = el('hud-sixpack').getContext('2d');
  let frame = 0;

  // ---- Minimap static layer (drawn once; islands/runway/beach/volcano) ----
  const MAP_W = 200, MAP_H = 200;
  const mapStatic = document.createElement('canvas');
  mapStatic.width = MAP_W; mapStatic.height = MAP_H;
  const MAP_X0 = -950, MAP_X1 = 950, MAP_Z0 = -850, MAP_Z1 = 750;
  const mx = (x) => (x - MAP_X0) / (MAP_X1 - MAP_X0) * MAP_W;
  const mz = (z) => (z - MAP_Z0) / (MAP_Z1 - MAP_Z0) * MAP_H;
  (function drawMapStatic() {
    const c = mapStatic.getContext('2d');
    const g = c.createLinearGradient(0, 0, 0, MAP_H);
    g.addColorStop(0, '#0d4a6e'); g.addColorStop(0.55, '#0a3a5c'); g.addColorStop(1, '#082c48');
    c.fillStyle = g; c.fillRect(0, 0, MAP_W, MAP_H);
    // Island blobs (match terrain.js bumps: centre + radius, scaled).
    const islands = [
      [0, 0, 720, 46], [-260, -260, 380, 30], [300, -320, 300, 26],
      [-650, -520, 280, 22], [640, -620, 220, 18],
    ];
    for (const [cx, cz, r] of islands) {
      const px = mx(cx), py = mz(cz), pr = r / (MAP_X1 - MAP_X0) * MAP_W;
      c.beginPath(); c.ellipse(px, py, pr, pr * 0.82, 0, 0, Math.PI * 2);
      c.fillStyle = '#c9b078'; c.fill(); // sand rim
      c.beginPath(); c.ellipse(px, py, pr * 0.88, pr * 0.72, 0, 0, Math.PI * 2);
      c.fillStyle = '#3e7d4a'; c.fill(); // green interior
    }
    // Runway 27 (white strip) + beach strip.
    c.strokeStyle = '#ffffff'; c.lineWidth = 4; c.lineCap = 'round';
    c.beginPath(); c.moveTo(mx(-170), mz(120)); c.lineTo(mx(170), mz(120)); c.stroke();
    c.lineWidth = 3;
    c.beginPath(); c.moveTo(mx(-720), mz(-520)); c.lineTo(mx(-580), mz(-520)); c.stroke();
    // Mount Ember volcano marker.
    c.fillStyle = '#ff7a2a';
    c.beginPath(); c.moveTo(mx(640), mz(-620) - 9);
    c.lineTo(mx(640) + 8, mz(-620) + 6); c.lineTo(mx(640) - 8, mz(-620) + 6);
    c.closePath(); c.fill();
    c.fillStyle = '#ffd24a'; c.font = 'bold 11px sans-serif'; c.textAlign = 'center';
    c.fillText('EMBER', mx(640), mz(-620) - 12);
    // North arrow + scale note.
    c.fillStyle = '#dff3ff'; c.font = 'bold 12px sans-serif';
    c.fillText('N ↑', MAP_W - 18, 16);
  })();

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

  // ---- Speed tape (left): scrolling ticks, red stall band < 55 kt ----
  function drawSpeedTape(kt, throttle) {
    const c = speedCtx, W = 144, H = 480;
    c.clearRect(0, 0, W, H);
    c.fillStyle = GLASS_BG; c.fillRect(0, 0, W, H);
    const CY = H / 2 - 20, pxPerKt = 5.5, win = 38;
    // Stall band: values below 55 kt, in tape space.
    const stallTop = CY - (55 - kt) * pxPerKt;
    if (stallTop > 0) {
      c.fillStyle = 'rgba(255,59,48,0.45)';
      c.fillRect(0, Math.max(0, stallTop), W, H - Math.max(0, stallTop));
      c.fillStyle = '#ff8a80'; c.font = 'bold 13px sans-serif'; c.textAlign = 'left';
      if (stallTop > 24) c.fillText('STALL', 8, Math.min(H - 46, stallTop - 6));
    }
    // Ticks every 10 kt, labels every 20.
    c.textAlign = 'right'; c.font = 'bold 17px sans-serif';
    for (let v = Math.max(0, Math.floor(kt - win)); v <= kt + win; v += 10) {
      const y = CY - (v - kt) * pxPerKt;
      if (y < 8 || y > H - 44) continue;
      const major = v % 20 === 0;
      c.strokeStyle = major ? TAPE_TXT : 'rgba(223,243,255,0.55)';
      c.lineWidth = major ? 2.5 : 1.5;
      c.beginPath(); c.moveTo(W - 8, y); c.lineTo(W - (major ? 26 : 18), y); c.stroke();
      if (major) { c.fillStyle = TAPE_TXT; c.fillText(String(v), W - 32, y + 6); }
    }
    // Centre pointer + boxed value.
    c.fillStyle = CYAN;
    c.beginPath(); c.moveTo(W - 8, CY - 9); c.lineTo(W - 8, CY + 9); c.lineTo(W + 2, CY); c.closePath(); c.fill();
    c.fillStyle = 'rgba(4,12,24,0.95)';
    c.strokeStyle = CYAN; c.lineWidth = 2;
    c.beginPath(); c.roundRect(6, CY - 21, 108, 42, 6); c.fill(); c.stroke();
    c.fillStyle = '#ffffff'; c.font = 'bold 24px sans-serif'; c.textAlign = 'center';
    c.fillText(String(kt), 60, CY + 8);
    c.fillStyle = CYAN; c.font = 'bold 12px sans-serif';
    c.fillText('KT', 60, CY + 34 > H - 44 ? CY + 8 : CY + 34);
    // Throttle bar along the bottom.
    c.fillStyle = 'rgba(255,255,255,0.18)'; c.fillRect(10, H - 30, W - 20, 10);
    c.fillStyle = '#37c8ff'; c.fillRect(10, H - 30, (W - 20) * clamp(throttle, 0, 1), 10);
    c.fillStyle = TAPE_TXT; c.font = 'bold 11px sans-serif'; c.textAlign = 'left';
    c.fillText('THR ' + Math.round(throttle * 100) + '%', 10, H - 36);
    c.strokeStyle = GLASS_EDGE; c.lineWidth = 2;
    c.strokeRect(1, 1, W - 2, H - 2);
  }

  // ---- Altitude tape (right): scrolling ticks, boxed value ----
  function drawAltTape(ft, vsFpm) {
    const c = altCtx, W = 144, H = 480;
    c.clearRect(0, 0, W, H);
    c.fillStyle = GLASS_BG; c.fillRect(0, 0, W, H);
    const CY = H / 2 - 20, pxPerFt = 0.55, win = 650;
    c.textAlign = 'left'; c.font = 'bold 16px sans-serif';
    for (let v = Math.max(0, Math.floor((ft - win) / 100) * 100); v <= ft + win; v += 100) {
      const y = CY - (v - ft) * pxPerFt;
      if (y < 8 || y > H - 44) continue;
      const major = v % 500 === 0;
      c.strokeStyle = major ? TAPE_TXT : 'rgba(223,243,255,0.55)';
      c.lineWidth = major ? 2.5 : 1.5;
      c.beginPath(); c.moveTo(8, y); c.lineTo(major ? 26 : 18, y); c.stroke();
      if (major) { c.fillStyle = TAPE_TXT; c.fillText(String(v), 32, y + 5); }
    }
    c.fillStyle = CYAN;
    c.beginPath(); c.moveTo(8, CY - 9); c.lineTo(8, CY + 9); c.lineTo(-2, CY); c.closePath(); c.fill();
    c.fillStyle = 'rgba(4,12,24,0.95)';
    c.strokeStyle = CYAN; c.lineWidth = 2;
    c.beginPath(); c.roundRect(30, CY - 21, 108, 42, 6); c.fill(); c.stroke();
    c.fillStyle = '#ffffff'; c.font = 'bold 22px sans-serif'; c.textAlign = 'center';
    c.fillText(ft.toLocaleString('en-US'), 84, CY + 8);
    c.fillStyle = CYAN; c.font = 'bold 12px sans-serif';
    c.fillText('FT', 84, CY + 34);
    // VSI readout at the bottom.
    c.fillStyle = vsFpm >= 0 ? '#7dff9a' : '#ffb3ab';
    c.font = 'bold 16px sans-serif'; c.textAlign = 'center';
    c.fillText((vsFpm >= 0 ? '+' : '') + vsFpm + ' FPM', W / 2, H - 14);
    c.strokeStyle = GLASS_EDGE; c.lineWidth = 2;
    c.strokeRect(1, 1, W - 2, H - 2);
  }

  // ---- Heading tape (top): N/E/S/W + degree ticks, centred caret ----
  function drawHdgTape(hdg) {
    const c = hdgCtx, W = 560, H = 80;
    c.clearRect(0, 0, W, H);
    const CX = W / 2, pxPerDeg = 4.6;
    c.textAlign = 'center';
    for (let d = -70; d <= 70; d += 5) {
      const deg = ((Math.round(hdg) + d) % 360 + 360) % 360;
      const x = CX + d * pxPerDeg;
      const major = deg % 30 === 0, card = deg % 90 === 0;
      c.strokeStyle = major ? TAPE_TXT : 'rgba(223,243,255,0.5)';
      c.lineWidth = major ? 2.5 : 1.5;
      c.beginPath(); c.moveTo(x, 10); c.lineTo(x, major ? 30 : 22); c.stroke();
      if (major) {
        c.fillStyle = card ? AMBER : TAPE_TXT;
        c.font = card ? 'bold 20px sans-serif' : 'bold 15px sans-serif';
        const label = card ? ['N', 'E', 'S', 'W'][deg / 90] : String(deg).padStart(3, '0');
        c.fillText(label, x, 52);
      }
    }
    // Centre caret.
    c.fillStyle = AMBER;
    c.beginPath(); c.moveTo(CX - 9, 58); c.lineTo(CX + 9, 58); c.lineTo(CX, 72); c.closePath(); c.fill();
  }

  // ---- Pitch ladder + flight-path marker (centre overlay) ----
  function drawPitch(state, hdg) {
    const c = pitchCtx, W = 840, H = 600;
    c.clearRect(0, 0, W, H);
    const CX = W / 2, CY = H / 2, pxPerDeg = 6;
    const pitchDeg = state.pitch * 180 / Math.PI;
    const bankDeg = state.bank * 180 / Math.PI;
    c.save();
    c.translate(CX, CY);
    c.rotate(state.bank);
    c.translate(0, pitchDeg * pxPerDeg);
    // Ladder lines ±10/±20/±30; horizon (0) longest and amber.
    c.textAlign = 'left'; c.font = 'bold 20px sans-serif';
    for (const deg of [-30, -20, -10, 0, 10, 20, 30]) {
      const y = -deg * pxPerDeg;
      const half = deg === 0 ? 130 : deg % 20 === 0 ? 90 : 60;
      c.strokeStyle = deg === 0 ? AMBER : 'rgba(223,243,255,0.9)';
      c.lineWidth = deg === 0 ? 3.5 : 2.5;
      c.beginPath(); c.moveTo(-half, y); c.lineTo(-18, y); c.moveTo(18, y); c.lineTo(half, y); c.stroke();
      c.fillStyle = c.strokeStyle;
      c.fillText(String(Math.abs(deg)), -half - 44, y + 7);
      c.fillText(String(Math.abs(deg)), half + 12, y + 7);
    }
    c.restore();
    // Flight-path marker: circle + wings at the velocity vector.
    const gammaDeg = Math.asin(clamp(state.verticalSpeed / Math.max(state.speed, 1), -1, 1)) * 180 / Math.PI;
    const fx = CX + clamp(-bankDeg * 1.2, -90, 90);
    const fy = CY - gammaDeg * pxPerDeg;
    c.strokeStyle = '#7dff9a'; c.lineWidth = 3;
    c.beginPath(); c.arc(fx, fy, 14, 0, Math.PI * 2); c.stroke();
    c.beginPath();
    c.moveTo(fx - 34, fy); c.lineTo(fx - 14, fy);
    c.moveTo(fx + 14, fy); c.lineTo(fx + 34, fy);
    c.moveTo(fx, fy - 14); c.lineTo(fx, fy - 26);
    c.stroke();
  }

  // ---- Minimap (bottom-right): static islands + rings + plane arrow ----
  function drawMinimap(state, mission) {
    const c = mapCtx;
    c.clearRect(0, 0, MAP_W, MAP_H);
    c.drawImage(mapStatic, 0, 0);
    const nextIdx = mission ? mission.ringsDone : 0;
    // Dotted leg from plane to next target.
    const tx = mission && nextIdx >= mission.ringsTotal ? RWY : COURSE[Math.min(nextIdx, 7)];
    const px = mx(state.x || 0), py = mz(state.z || 0);
    c.strokeStyle = 'rgba(94,230,255,0.8)'; c.lineWidth = 2; c.setLineDash([6, 6]);
    c.beginPath(); c.moveTo(px, py); c.lineTo(mx(tx.x), mz(tx.z)); c.stroke();
    c.setLineDash([]);
    // Ring dots.
    for (let i = 0; i < 8; i++) {
      const r = COURSE[i];
      const done = mission ? i < mission.ringsDone : false;
      const isNext = mission ? i === mission.ringsDone : i === 0;
      const pulse = isNext ? 1 + 0.25 * Math.sin(frame * 0.12) : 1;
      c.beginPath(); c.arc(mx(r.x), mz(r.z), (isNext ? 7 : 5) * pulse, 0, Math.PI * 2);
      c.fillStyle = done ? '#2aff66' : isNext ? '#ffd24a' : 'rgba(255,255,255,0.85)';
      c.fill();
      c.strokeStyle = 'rgba(4,12,24,0.9)'; c.lineWidth = 1.5; c.stroke();
    }
    // Runway target marker when course is done.
    if (mission && nextIdx >= mission.ringsTotal) {
      c.strokeStyle = AMBER; c.lineWidth = 3;
      c.beginPath(); c.arc(mx(RWY.x), mz(RWY.z), 10, 0, Math.PI * 2); c.stroke();
    }
    // Plane arrow (heading deg → canvas angle, 0 = east, clockwise).
    const hdg = ((Math.round(Math.atan2(Math.cos(state.heading), -Math.sin(state.heading)) * 180 / Math.PI) % 360) + 360) % 360;
    const a = (90 - hdg) * Math.PI / 180;
    c.save();
    c.translate(px, py); c.rotate(a);
    c.fillStyle = '#ffffff'; c.strokeStyle = '#16233c'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(13, 0); c.lineTo(-9, -8); c.lineTo(-4, 0); c.lineTo(-9, 8); c.closePath();
    c.fill(); c.stroke();
    c.restore();
    c.strokeStyle = GLASS_EDGE; c.lineWidth = 2;
    c.strokeRect(1, 1, MAP_W - 2, MAP_H - 2);
  }

  // ---- Six-pack (bottom centre): 6 round backlit gauges ----
  function gaugeFace(c, cx, cy, r, label) {
    const g = c.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.1, cx, cy, r);
    g.addColorStop(0, '#1c2f45'); g.addColorStop(1, '#070f1a');
    c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.fillStyle = g; c.fill();
    c.strokeStyle = 'rgba(255,210,74,0.85)'; c.lineWidth = 2.5; c.stroke();
    c.strokeStyle = 'rgba(255,190,80,0.25)'; c.lineWidth = 6;
    c.beginPath(); c.arc(cx, cy, r + 4, 0, Math.PI * 2); c.stroke();
    c.fillStyle = AMBER; c.font = 'bold 11px sans-serif'; c.textAlign = 'center';
    c.fillText(label, cx, cy + r - 4);
  }
  function needle(c, cx, cy, angleDeg, len, color, width) {
    const a = (angleDeg - 90) * Math.PI / 180;
    c.strokeStyle = color; c.lineWidth = width; c.lineCap = 'round';
    c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len); c.stroke();
    c.fillStyle = color; c.beginPath(); c.arc(cx, cy, 4, 0, Math.PI * 2); c.fill();
  }
  function dialTicks(c, cx, cy, r, min, max, step, majorStep, fmt) {
    const sweep = 270, start = -225; // degrees, 0 = up
    for (let v = min; v <= max; v += step) {
      const a = (start + (v - min) / (max - min) * sweep - 90) * Math.PI / 180;
      const major = v % majorStep === 0;
      const r1 = r - (major ? 12 : 7), r2 = r - 2;
      c.strokeStyle = major ? '#dff3ff' : 'rgba(223,243,255,0.5)';
      c.lineWidth = major ? 2 : 1;
      c.beginPath();
      c.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      c.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2);
      c.stroke();
      // No number labels: at this gauge size they overlap into an unreadable
      // jumble. The needle + the digital speed/alt/VSI tapes carry the value.

    }
  }
  function drawSixPack(state, hdg, kt, ft, vsFpm) {
    const c = packCtx, W = 480, H = 96;
    c.clearRect(0, 0, W, H);
    const R = 34, CY = 44, xs = [40, 120, 200, 280, 360, 440];
    // 1 — Airspeed (0–160 kt, red arc below 55).
    gaugeFace(c, xs[0], CY, R, 'AIRSPEED');
    c.strokeStyle = '#ff3b30'; c.lineWidth = 5;
    c.beginPath(); c.arc(xs[0], CY, R - 5, (-225 - 90 + 0) * Math.PI / 180, (-225 + 55 / 160 * 270 - 90) * Math.PI / 180); c.stroke();
    dialTicks(c, xs[0], CY, R, 0, 160, 20, 40, (v) => String(v));
    needle(c, xs[0], CY, -225 + clamp(kt, 0, 160) / 160 * 270, R - 16, '#ffffff', 3);
    // 2 — Attitude (mini horizon).
    gaugeFace(c, xs[1], CY, R, 'ATTITUDE');
    c.save();
    c.beginPath(); c.arc(xs[1], CY, R - 3, 0, Math.PI * 2); c.clip();
    c.translate(xs[1], CY); c.rotate(state.bank);
    const dy = clamp(state.pitch, -0.6, 0.6) * 55;
    c.fillStyle = '#3d7ac8'; c.fillRect(-R, -R, R * 2, R * 2);
    c.fillStyle = '#8a6a3a'; c.fillRect(-R, dy, R * 2, R * 2);
    c.fillStyle = '#fff'; c.fillRect(-R, dy - 1, R * 2, 2);
    c.restore();
    c.strokeStyle = AMBER; c.lineWidth = 3;
    c.beginPath();
    c.moveTo(xs[1] - R * 0.52, CY); c.lineTo(xs[1] - R * 0.16, CY);
    c.moveTo(xs[1] + R * 0.16, CY); c.lineTo(xs[1] + R * 0.52, CY);
    c.stroke();
    // 3 — Altimeter (needle = 1000 ft/rev, short needle = 100 ft).
    gaugeFace(c, xs[2], CY, R, 'ALT');
    dialTicks(c, xs[2], CY, R, 0, 10, 1, 1, (v) => String(v));
    needle(c, xs[2], CY, (ft % 1000) / 1000 * 360, R - 16, '#ffffff', 3);
    needle(c, xs[2], CY, (ft % 100) / 100 * 360, R * 0.32, CYAN, 2);
    // 4 — Turn coordinator (needle = bank, ball = slip approx).
    gaugeFace(c, xs[3], CY, R, 'TURN');
    c.strokeStyle = '#dff3ff'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(xs[3] - R * 0.6, CY - R * 0.52); c.lineTo(xs[3] + R * 0.6, CY - R * 0.52); c.stroke();
    const bankDeg = clamp(state.bank * 180 / Math.PI, -45, 45);
    needle(c, xs[3], CY, bankDeg * 1.6, R - 14, '#ffffff', 3);
    const ballX = xs[3] + clamp(-state.bank * 20, -R * 0.7, R * 0.7);
    c.fillStyle = '#ffffff'; c.beginPath(); c.arc(ballX, CY + R * 0.52, 4, 0, Math.PI * 2); c.fill();
    // 5 — Heading (rotating card, fixed lubber).
    gaugeFace(c, xs[4], CY, R, 'HDG');
    c.save();
    c.beginPath(); c.arc(xs[4], CY, R - 3, 0, Math.PI * 2); c.clip();
    c.translate(xs[4], CY); c.rotate(-hdg * Math.PI / 180);
    c.textAlign = 'center'; c.font = 'bold 12px sans-serif';
    for (let d = 0; d < 360; d += 30) {
      const a = (d - 90) * Math.PI / 180;
      const card = d % 90 === 0;
      if (!card) continue; // degree numbers overlap at this gauge size; N/E/S/W only
      c.fillStyle = AMBER;
      c.fillText(['N', 'E', 'S', 'W'][d / 90],
        Math.cos(a) * (R - 14), Math.sin(a) * (R - 14) + 5);
    }
    c.restore();
    c.fillStyle = AMBER;
    c.beginPath(); c.moveTo(xs[4] - 6, CY - R + 2); c.lineTo(xs[4] + 6, CY - R + 2); c.lineTo(xs[4], CY - R + 14); c.closePath(); c.fill();
    // 6 — VSI (±2000 fpm).
    gaugeFace(c, xs[5], CY, R, 'VSI');
    dialTicks(c, xs[5], CY, R, -2000, 2000, 500, 1000, (v) => (v === 0 ? '0' : String(Math.abs(v) / 1000) + 'k'));
    needle(c, xs[5], CY, -225 + (clamp(vsFpm, -2000, 2000) + 2000) / 4000 * 270, R - 16, '#ffffff', 3);
  }

  let warnTimer = null;
  return {
    update(state, mission) {
      frame++;
      // state: flight state; mission: mission state (or null on menu).
      const kt = Math.round(state.speed * 1.944);
      const ft = Math.max(0, Math.round((state.y - 10) * 3.281));
      const vsFpm = Math.round(state.verticalSpeed * 196.85);
      const hdg = ((Math.round(Math.atan2(Math.cos(state.heading), -Math.sin(state.heading)) * 180 / Math.PI) % 360) + 360) % 360;
      el('hud-speed').textContent = String(kt);
      el('hud-alt').textContent = String(ft);
      el('hud-vs').textContent = (vsFpm >= 0 ? '+' : '') + vsFpm + ' fpm';
      el('hud-heading').textContent = 'HDG ' + String(hdg).padStart(3, '0');
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
        // Objective panel: next target, distance (NM), ETA from speed.
        const done = mission.ringsDone >= mission.ringsTotal;
        const target = done ? RWY : COURSE[Math.min(mission.ringsDone, 7)];
        const dx = target.x - (state.x || 0), dy = target.y - (state.y || 0), dz = target.z - (state.z || 0);
        const distM = Math.hypot(dx, dy, dz);
        const nm = distM / 1852;
        const eta = state.speed > 5 ? fmtEta(distM / state.speed) : '—';
        const label = done ? 'RWY 27' : 'RING ' + (mission.ringsDone + 1) + '/' + mission.ringsTotal;
        el('hud-objective-line').textContent = label + ' · ' + nm.toFixed(1) + ' NM · ETA ' + eta;
      } else {
        el('hud-objective-line').textContent = '—';
      }
      el('hud-fuel').classList.toggle('low', state.fuel < 25);
      el('hud-damage').classList.toggle('high', state.damage >= 50);
      drawHorizon(state.bank, state.pitch);
      drawSpeedTape(kt, state.throttle);
      drawAltTape(ft, vsFpm);
      drawHdgTape(hdg);
      drawPitch(state, hdg);
      drawMinimap(state, mission);
      drawSixPack(state, hdg, kt, ft, vsFpm);
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
