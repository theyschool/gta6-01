// The SBPD helicopter: it shows up at three stars and up, hangs over the player with its
// spotlight on them, and keeps the heat from cooling while it can see them. It is the one
// police unit the player cannot outrun by hiding — only by getting far away, fast.

import { POLICE } from './config.js';

// Where the helicopter flies, relative to the player: it enters behind and
// above them, then holds a hover point a little closer, and it holds their
// heat while it is within WATCH_RANGE of them.
const ENTER_BACK = 200;
const ENTER_SIDE = 120;
const HOVER_BACK = 170;
const HOVER_SIDE = 60;
const WATCH_RANGE = 900;

function dist(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Put a helicopter over the player, trailing a little behind their direction of travel. */
export function spawnHeli(state) {
  const p = state.player;
  const px = p.car ? p.car.x : p.x;
  const py = p.car ? p.car.y : p.y;
  const angle = p.car ? p.car.angle : p.angle;
  state.heli = {
    x: px - Math.cos(angle) * ENTER_BACK - ENTER_SIDE,
    y: py - Math.sin(angle) * ENTER_BACK - ENTER_SIDE,
    angle,
    rotor: 0,
  };
  return state.heli;
}

/** One helicopter step: chase a hover point just behind the player, rotor spinning. */
export function updateHeli(state, dt) {
  const h = state.heli;
  if (!h) return;
  const p = state.player;
  const px = p.car ? p.car.x : p.x;
  const py = p.car ? p.car.y : p.y;
  const angle = p.car ? p.car.angle : p.angle;
  // Hover behind the player so the spotlight cone falls on them from up-screen.
  const tx = px - Math.cos(angle) * HOVER_BACK - HOVER_SIDE;
  const ty = py - Math.sin(angle) * HOVER_BACK - HOVER_SIDE;
  const dx = tx - h.x;
  const dy = ty - h.y;
  const d = Math.hypot(dx, dy);
  if (d > 4) {
    const step = Math.min(d, POLICE.heliSpeed * dt);
    h.x += (dx / d) * step;
    h.y += (dy / d) * step;
    h.angle = Math.atan2(dy, dx);
  }
  h.rotor += dt * 28;
  // The heat is gone: the helicopter peels away and is gone for good.
  if (state.wanted < 2) state.heli = null;
}

/** Is the helicopter close enough to hold the player's heat? */
export function heliWatching(state) {
  const h = state.heli;
  if (!h) return false;
  const p = state.player;
  const px = p.car ? p.car.x : p.x;
  const py = p.car ? p.car.y : p.y;
  return dist(h.x, h.y, px, py) < WATCH_RANGE;
}
