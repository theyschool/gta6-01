// The screenshot scenes behind ?shot=chase|drive|foot|mission. Each one plays the real rules
// forward from a fresh world for a fixed number of seconds, steered by the same road-following
// autopilot the title screen uses, so the frame is what a short game really looks like and the
// same seed always gives the same frame. Every scene is gameplay with the full HUD — never a menu.

import { STEP } from './config.js';
import { nearestRoad } from './city.js';
import { SCREEN_PLAY } from './render.js';
import { addHeat } from './police.js';
import { startMission } from './missions.js';
import { makeCar } from './vehicles.js';

const SECONDS = { foot: 5, drive: 6, chase: 2.5, mission: 4 };

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/**
 * Where the autopilot wants to go: along the current road toward the mission marker's
 * coordinate, in the right-hand lane — and when it is time to change roads, to the centre
 * of the intersection first, so the turn is a right angle instead of a cut corner.
 */
function navTarget(state) {
  const car = state.player.car;
  const marker = state.missionMarker();
  const tx = marker ? marker.x : car.x + 1200;
  const ty = marker ? marker.y : car.y;
  const road = nearestRoad(car.x, car.y);
  if (road.axis === 'h') {
    const dir = Math.sign(tx - car.x) || 1;
    if (Math.abs(car.x - tx) > 120) return { x: car.x + dir * 400, y: road.at + dir * 16 };
    const vx = Math.round(car.x / 450) * 450;
    return { x: vx, y: road.at };
  }
  const dir = Math.sign(ty - car.y) || 1;
  if (Math.abs(car.y - ty) > 120) return { x: road.at - dir * 16, y: car.y + dir * 400 };
  const hy = Math.round(car.y / 450) * 450;
  return { x: road.at, y: hy };
}

/** The autopilot's input for one frame: drive toward the nav target, or walk toward it. */
export function autopilotInput(state) {
  const p = state.player;
  const idle = { mx: 0, my: 0, run: false, brake: false, enter: false, punch: false, shoot: false, aimX: 0, aimY: 0 };
  if (!p.car) {
    const marker = state.missionMarker();
    const tx = marker ? marker.x : p.x + 400;
    const ty = marker ? marker.y : p.y;
    const dx = tx - p.x;
    const dy = ty - p.y;
    const d = Math.hypot(dx, dy);
    if (d < 30) return idle;
    return { ...idle, mx: dx / d, my: dy / d, run: true };
  }
  const car = p.car;
  let target = navTarget(state);
  const want = Math.atan2(target.y - car.y, target.x - car.x);
  const diff = angleDiff(want, car.angle);
  const steer = clamp(diff * 2.2, -1, 1);
  // Slow right down for a turn, so the car swings a right angle instead of a wide arc.
  let throttle = Math.abs(diff) > 0.4 ? 0.25 : 1;
  // Traffic ahead: overtake in the other lane when it is clear, brake when it is not.
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  let blocked = false;
  for (const other of state.cars) {
    if (other === car || other.health <= 0) continue;
    const dx = other.x - car.x;
    const dy = other.y - car.y;
    const along = dx * fx + dy * fy;
    const side = Math.abs(-dx * fy + dy * fx);
    if (along > 0 && along < 110 && side < 26) {
      blocked = true;
      break;
    }
  }
  if (blocked) {
    const road = nearestRoad(car.x, car.y);
    let overtake = null;
    if (road.axis === 'h') {
      const dir = Math.sign(target.x - car.x) || 1;
      overtake = { x: car.x + dir * 200, y: road.at - dir * 16 };
    } else {
      const dir = Math.sign(target.y - car.y) || 1;
      overtake = { x: road.at + dir * 16, y: car.y + dir * 200 };
    }
    let clear = true;
    for (const other of state.cars) {
      if (other === car || other.health <= 0) continue;
      if (Math.hypot(other.x - overtake.x, other.y - overtake.y) < 100) {
        clear = false;
        break;
      }
    }
    if (clear) target = overtake;
    else throttle = Math.min(throttle, 0.25);
  }
  const want2 = Math.atan2(target.y - car.y, target.x - car.x);
  const steer2 = clamp(angleDiff(want2, car.angle) * 2.2, -1, 1);
  // my is screen-down, so forward throttle is -my (the world flips the sign for cars).
  return { ...idle, mx: steer2, my: -throttle, aimX: car.x + Math.cos(car.angle) * 100, aimY: car.y + Math.sin(car.angle) * 100 };
}

function putPlayerInCar(state, typeKey, x, y, angle) {
  const car = state.cars.find((c) => c.type === typeKey && !c.occupied && !c.isPolice);
  const use = car || state.cars.find((c) => !c.occupied && !c.isPolice);
  if (!use) return;
  use.x = x;
  use.y = y;
  use.angle = angle;
  use.speed = 120;
  use.occupied = true;
  state.player.car = use;
  state.player.onFoot = false;
  state.player.x = x;
  state.player.y = y;
}

function addCrowd(state, x, y, count) {
  for (let i = 0; i < count; i += 1) {
    const ped = {
      id: 6000 + i,
      x: x + (state.random() - 0.5) * 500,
      y: y + (state.random() - 0.5) * 260,
      angle: state.random() * Math.PI * 2,
      speed: 0, health: 30, maxHealth: 30,
      color: ['#d94f3d', '#3d7ad9', '#e8a13c', '#7a4fd9', '#3da35f'][i % 5],
      name: 'Local', state: 'walk', down: 0, flee: 0,
      targetX: x + 200, targetY: y, wait: 0, walkPhase: state.random() * 6,
    };
    state.peds.push(ped);
  }
}

/**
 * Set `world` to the named scene and return the screen to draw over it.
 * chase: three stars, cruisers on your tail, mid-pursuit.
 * drive: a sports car through downtown traffic.
 * foot: Jax on foot in a busy street, mission live.
 * mission: the timed getaway to the docks, clock running.
 */
export function stageShot(name, world) {
  const state = world.state;
  world.reset();
  const seconds = SECONDS[name] || 5;

  if (name === 'foot') {
    state.player.x = 1500;
    state.player.y = 1800;
    state.player.angle = 0;
    addCrowd(state, 1600, 1800, 10);
    state.cash = 1240;
  } else if (name === 'drive') {
    putPlayerInCar(state, 'sports', 1100, 1366, 0);
    startMission(state, 5);
    state.cash = 2860;
  } else if (name === 'chase') {
    // A straight-line chase east along 9th Avenue: the cruisers close in but have not
    // caught the player yet, so the frame reads as pursuit, not a pile-up.
    startMission(state, 5);
    putPlayerInCar(state, 'muscle', 800, 916, 0);
    state.player.car.speed = 350;
    addHeat(state, 52);
    for (let i = 0; i < 3; i += 1) {
      const cruiser = makeCar('police', 450 - i * 150, 916, 0, { occupied: true });
      cruiser.speed = 380;
      state.cars.push(cruiser);
      state.policeCars.push(cruiser);
    }
    state.cash = 3420;
  } else if (name === 'mission') {
    startMission(state, 5);
    putPlayerInCar(state, 'sports', 1500, 3166, 0);
    state.cash = 1980;
    state.missions.timer = 13; // the clock is already running: 87 seconds left
  } else {
    state.player.x = 1500;
    state.player.y = 1800;
  }

  for (let i = 0; i < (seconds / STEP); i += 1) {
    world.step(STEP, autopilotInput(state));
  }
  // Each scene says its own line: the foot scene keeps Vera's briefing, the others stay
  // clean so the HUD reads at a glance.
  if (name === 'foot') {
    state.message = "Vera: get a car, Jax. Any car. Then bring it to my garage.";
    state.messageUntil = state.time + 10;
  } else {
    state.message = null;
  }
  return { screen: SCREEN_PLAY, best: state.stats.earned };
}
