// input.js — keyboard + mouse. Keyboard is primary; mouse only nudges the
// camera. Exposes a polled input snapshot plus one-shot actions via consume().
export function createInput() {
  const keys = {};
  const mouse = { x: 0, y: 0, dx: 0, dy: 0 };
  const pressed = new Set(); // one-shot actions, cleared by consume()
  let lookX = 0, lookY = 0;

  const ACTION_KEYS = {
    camera: 'KeyC', restart: 'KeyR', pause: 'KeyP', mute: 'KeyM',
    confirm: 'Enter', back: 'Escape',
    mission1: 'Digit1', mission2: 'Digit2', mission3: 'Digit3',
  };

  function onKeyDown(e) {
    if (e.repeat) return;
    keys[e.code] = true;
    for (const [action, code] of Object.entries(ACTION_KEYS)) {
      if (e.code === code) pressed.add(action);
    }
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
      e.preventDefault();
    }
  }
  function onKeyUp(e) { keys[e.code] = false; }
  function onMouseMove(e) {
    mouse.dx += e.movementX || 0;
    mouse.dy += e.movementY || 0;
    mouse.x = e.clientX; mouse.y = e.clientY;
  }
  function onBlur() { for (const k of Object.keys(keys)) keys[k] = false; }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('blur', onBlur);

  return {
    keys, mouse,
    // Polled snapshot for the flight model (held keys).
    snapshot() {
      return {
        throttleUp: !!keys['KeyW'],
        throttleDown: !!keys['KeyS'],
        pitchUp: !!keys['ArrowDown'],
        pitchDown: !!keys['ArrowUp'],
        rollLeft: !!keys['ArrowLeft'],
        rollRight: !!keys['ArrowRight'],
        yawLeft: !!keys['KeyA'],
        yawRight: !!keys['KeyD'],
        brake: !!keys['Space'],
      };
    },
    // One-shot action: true once per key press.
    consume(action) {
      if (pressed.has(action)) { pressed.delete(action); return true; }
      return false;
    },
    // Mouse look deltas since last read (decays to a small orbit offset).
    lookDelta() {
      const dx = mouse.dx, dy = mouse.dy;
      mouse.dx = 0; mouse.dy = 0;
      lookX = Math.max(-0.6, Math.min(0.6, lookX + dx * 0.0012));
      lookY = Math.max(-0.35, Math.min(0.35, lookY + dy * 0.001));
      lookX *= 0.92; lookY *= 0.92;
      return { x: lookX, y: lookY };
    },
  };
}
