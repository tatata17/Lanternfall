// Keyboard, mouse and touch state for the game. main.js reads this every
// step; nothing here knows about the world, so the same input feeds the
// live game and the screenshot autopilot's hand-made substitute.
//
// On a touchscreen the game plays twin-stick: the first thumb on the
// left half is the move stick, a thumb on the right half aims and fires.
// A mouse keeps the desktop scheme: WASD moves, the pointer aims, and
// holding the button fires.

import { FIELD } from './config.js';

export function createInput(canvas, pad = null) {
  const keys = new Set();
  const mouse = { x: 0, y: 0, down: false, clicked: false };
  const pressed = new Set();
  const sticks = new Map(); // pointerId -> { role, startX, startY, x, y }
  // Portrait controller pads (DOM elements below the field). Each pad
  // stick holds a live vector while its thumb is down, in the same
  // shape the on-field sticks produce, so the two schemes blend.
  const padVectors = { move: null, aim: null };

  if (pad) {
    for (const role of ['move', 'aim']) {
      const zone = pad[role];
      if (!zone) continue;
      const base = zone.querySelector('.stick-base');
      const knob = zone.querySelector('.stick-knob');
      let pointerId = null;
      let centerX = 0;
      let centerY = 0;
      let baseRadius = 74;
      const update = (event) => {
        const dx = event.clientX - centerX;
        const dy = event.clientY - centerY;
        const length = Math.hypot(dx, dy);
        // Knob travel follows the base's size, so the smaller sticks
        // of the portrait-field layout feel the same as the big ones.
        const maxTravel = Math.max(18, baseRadius - 24);
        const travel = Math.min(length, maxTravel);
        if (knob) {
          knob.style.transform = length > 0
            ? `translate(${(dx / length) * travel}px, ${(dy / length) * travel}px)`
            : '';
        }
        if (length < 8) {
          padVectors[role] = { x: 0, y: 0 };
        } else {
          const scale = Math.min(1, length / (maxTravel + 12)) / length;
          padVectors[role] = { x: dx * scale, y: dy * scale };
        }
      };
      zone.addEventListener('pointerdown', (event) => {
        if (pointerId !== null) return;
        pointerId = event.pointerId;
        try { zone.setPointerCapture(pointerId); } catch { /* synthetic or odd webview pointers */ }
        const rect = base.getBoundingClientRect();
        centerX = rect.left + rect.width / 2;
        centerY = rect.top + rect.height / 2;
        baseRadius = rect.width / 2;
        update(event);
        event.preventDefault();
      });
      zone.addEventListener('pointermove', (event) => {
        if (event.pointerId === pointerId) update(event);
      });
      const release = (event) => {
        if (event.pointerId !== pointerId) return;
        pointerId = null;
        padVectors[role] = null;
        if (knob) knob.style.transform = '';
      };
      zone.addEventListener('pointerup', release);
      zone.addEventListener('pointercancel', release);
    }
  }

  function toField(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * FIELD.width,
      y: ((clientY - rect.top) / rect.height) * FIELD.height,
    };
  }

  window.addEventListener('keydown', (event) => {
    if (!keys.has(event.code)) pressed.add(event.code);
    keys.add(event.code);
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) event.preventDefault();
  });
  window.addEventListener('keyup', (event) => keys.delete(event.code));
  window.addEventListener('blur', () => {
    keys.clear();
    mouse.down = false;
    sticks.clear();
    padVectors.move = null;
    padVectors.aim = null;
  });

  canvas.addEventListener('pointerdown', (event) => {
    const point = toField(event.clientX, event.clientY);
    mouse.x = point.x;
    mouse.y = point.y;
    mouse.clicked = true;
    if (event.pointerType === 'touch') {
      const role = point.x < FIELD.width / 2 && ![...sticks.values()].some((s) => s.role === 'move') ? 'move' : 'aim';
      sticks.set(event.pointerId, { role, startX: point.x, startY: point.y, x: point.x, y: point.y });
      event.preventDefault();
    } else {
      mouse.down = true;
    }
  });
  canvas.addEventListener('pointermove', (event) => {
    const point = toField(event.clientX, event.clientY);
    if (event.pointerType === 'touch') {
      const stick = sticks.get(event.pointerId);
      if (stick) { stick.x = point.x; stick.y = point.y; }
    } else {
      mouse.x = point.x;
      mouse.y = point.y;
    }
  });
  function releasePointer(event) {
    sticks.delete(event.pointerId);
    if (event.pointerType !== 'touch') mouse.down = false;
  }
  canvas.addEventListener('pointerup', releasePointer);
  canvas.addEventListener('pointercancel', releasePointer);
  window.addEventListener('pointerup', (event) => { if (event.pointerType !== 'touch') mouse.down = false; });

  function stickVector(role) {
    for (const stick of sticks.values()) {
      if (stick.role !== role) continue;
      const dx = stick.x - stick.startX;
      const dy = stick.y - stick.startY;
      const length = Math.hypot(dx, dy);
      if (length < 9) return { x: 0, y: 0 };
      const scale = Math.min(1, length / 62) / (length || 1);
      return { x: dx * scale, y: dy * scale };
    }
    return null;
  }

  return {
    keys,
    mouse,
    /** Was this key newly pressed since the last call? Consumes the press. */
    takePress(code) {
      if (!pressed.has(code)) return false;
      pressed.delete(code);
      return true;
    },
    /** The click or tap from this frame, consumed once. */
    takeClick() {
      const was = mouse.clicked;
      mouse.clicked = false;
      return was;
    },
    endFrame() {
      pressed.clear();
      mouse.clicked = false;
    },
    moveAxis() {
      let x = 0;
      let y = 0;
      if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
      if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
      if (keys.has('KeyW') || keys.has('ArrowUp')) y -= 1;
      if (keys.has('KeyS') || keys.has('ArrowDown')) y += 1;
      if (x !== 0 && y !== 0) { x *= Math.SQRT1_2; y *= Math.SQRT1_2; }
      return { x, y };
    },
    /** The touch move stick's vector, or null when no thumb is on it.
     * A portrait pad stick, while held, takes this over. */
    touchMove() {
      if (padVectors.move) return padVectors.move;
      return stickVector('move');
    },
    /** The touch aim stick's vector, or null. A deflected aim stick is
     * also the trigger: firing is part of aiming on touch. */
    touchAim() {
      const padAim = padVectors.aim;
      if (padAim && (padAim.x !== 0 || padAim.y !== 0)) return padAim;
      if (padAim) return null;
      const vector = stickVector('aim');
      if (!vector || (vector.x === 0 && vector.y === 0)) return null;
      return vector;
    },
    usingTouch() { return sticks.size > 0 || padVectors.move !== null || padVectors.aim !== null; },
    /** Live sticks, for drawing the twin-stick overlay. */
    sticks() { return [...sticks.values()]; },
  };
}
