// Keyboard and mouse input. Held keys give a steering vector; one-shot presses (enter a car,
// punch, pause, confirm, mute) are queued as edge flags and taken once by the loop, so a press
// between two frames is never lost and never counted twice. The mouse aims the weapon.

export const ACTION_PAUSE = 1;
export const ACTION_CONFIRM = 2;
export const ACTION_MUTE = 4;

const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const RUN = new Set(['ShiftLeft', 'ShiftRight']);
const BRAKE = new Set(['Space']);
const ENTER_CAR = new Set(['KeyE']);
const PUNCH = new Set(['KeyF']);
const PAUSE = new Set(['KeyP', 'Escape']);
const CONFIRM = new Set(['Enter', 'NumpadEnter']);
const MUTE = new Set(['KeyM']);
const START_MISSION = new Set(['KeyN']);

export function createInput(canvas) {
  const held = new Set();
  let actions = 0;
  let mouseX = 640;
  let mouseY = 360;
  let mouseDown = false;
  let startMission = false;
  let enterQueued = false;
  let punchQueued = false;

  window.addEventListener('keydown', (event) => {
    if (event.repeat) {
      if (UP.has(event.code) || DOWN.has(event.code) || LEFT.has(event.code) || RIGHT.has(event.code)) event.preventDefault();
      return;
    }
    held.add(event.code);
    // Edge presses are queued the moment the key goes down, so even a tap shorter
    // than one frame is never lost.
    if (ENTER_CAR.has(event.code)) enterQueued = true;
    if (PUNCH.has(event.code)) punchQueued = true;
    if (PAUSE.has(event.code)) actions |= ACTION_PAUSE;
    else if (CONFIRM.has(event.code)) actions |= ACTION_CONFIRM;
    else if (MUTE.has(event.code)) actions |= ACTION_MUTE;
    else if (START_MISSION.has(event.code)) startMission = true;
    if (UP.has(event.code) || DOWN.has(event.code) || LEFT.has(event.code) || RIGHT.has(event.code) || BRAKE.has(event.code)) {
      event.preventDefault();
    }
  });
  window.addEventListener('keyup', (event) => {
    held.delete(event.code);
  });
  window.addEventListener('blur', () => {
    held.clear();
    mouseDown = false;
  });
  canvas.addEventListener('pointermove', (event) => {
    mouseX = event.clientX;
    mouseY = event.clientY;
  });
  canvas.addEventListener('pointerdown', (event) => {
    mouseX = event.clientX;
    mouseY = event.clientY;
    mouseDown = true;
    actions |= ACTION_CONFIRM;
  });
  window.addEventListener('pointerup', () => {
    mouseDown = false;
  });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  function hasAny(set) {
    for (const code of set) if (held.has(code)) return true;
    return false;
  }

  return {
    /** The frame's input: movement vector, car controls, edge presses, and the mouse aim. */
    frame() {
      const mx = (hasAny(RIGHT) ? 1 : 0) - (hasAny(LEFT) ? 1 : 0);
      const my = (hasAny(DOWN) ? 1 : 0) - (hasAny(UP) ? 1 : 0);
      const input = {
        mx,
        my,
        run: hasAny(RUN),
        brake: hasAny(BRAKE),
        enter: enterQueued,
        punch: punchQueued,
        shoot: mouseDown,
        aimScreenX: mouseX,
        aimScreenY: mouseY,
        startMission,
      };
      enterQueued = false;
      punchQueued = false;
      startMission = false;
      return input;
    },
    /** One-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
