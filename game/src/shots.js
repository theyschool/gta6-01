// The screenshot scenes behind ?shot=chase|drive|foot|mission. Each one plays the real rules
// forward from a fresh world for a fixed number of seconds, steered by the same road-following
// autopilot the title screen uses, so the frame is what a short game really looks like and the
// same seed always gives the same frame. Every scene is gameplay with the full HUD — never a menu.

import { STEP } from './config.js';
import { nearestRoad } from './city.js';
import { SCREEN_PLAY } from './render.js';
import { addHeat, spawnRoadblock } from './police.js';
import { startMission } from './missions.js';
import { makeCar } from './vehicles.js';

const SECONDS = { foot: 5, drive: 6, chase: 2.5, mission: 2.5 };

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
  // In a staged chase the autopilot holds the NOS boost down, so the frame shows flames.
  return { ...idle, mx: steer2, my: -throttle, run: state.shotBoost === true, aimX: car.x + Math.cos(car.angle) * 100, aimY: car.y + Math.sin(car.angle) * 100 };
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
  // The staged car is armoured: a screenshot scene is a frame, not a fair fight, and
  // rams, roadblocks and building grazes during the autopilot's run must not blow it
  // up halfway through and leave the player standing on a roof.
  use.health = 1000;
  use.maxHealth = 1000;
  state.player.car = use;
  state.player.onFoot = false;
  state.player.x = x;
  state.player.y = y;
}

function addTraffic(state, spots) {
  for (const [type, x, y, angle, speed, axis, dir] of spots) {
    const car = makeCar(type, x, y, angle, { occupied: true, axis, dir, rng: state.random });
    car.speed = speed;
    state.cars.push(car);
  }
}

/** Traffic placed around the player's final position, for the capture frame. */
function addTrafficNearPlayer(state) {
  const car = state.player.car;
  if (!car) return;
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  const rx = -fy;
  const ry = fx;
  const spots = [
    { along: 270, side: 16, type: 'sedan' },
    { along: 430, side: -16, type: 'hatch' },
    { along: -280, side: -16, type: 'van' },
  ];
  for (const spot of spots) {
    const x = car.x + fx * spot.along + rx * spot.side;
    const y = car.y + fy * spot.along + ry * spot.side;
    const c = makeCar(spot.type, x, y, car.angle, { occupied: false, rng: state.random });
    state.cars.push(c);
  }
}
function puffTireSmoke(state) {
  const car = state.player.car;
  if (!car) return;
  const bx = car.x - Math.cos(car.angle) * car.radius;
  const by = car.y - Math.sin(car.angle) * car.radius;
  for (let i = 0; i < 5; i += 1) {
    state.particles.push({
      kind: 'smoke', x: bx + (state.random() - 0.5) * 20, y: by + (state.random() - 0.5) * 20,
      vx: (state.random() - 0.5) * 30, vy: -20 - state.random() * 20,
      life: 1.1, max: 1.1, size: 6 + state.random() * 5, color: '#9a9a9a',
    });
  }
  for (let i = 0; i < 5; i += 1) {
    const d = 30 + i * 22;
    state.skids.push({
      x1: bx - Math.cos(car.angle) * d, y1: by - Math.sin(car.angle) * d,
      x2: bx - Math.cos(car.angle) * (d + 20), y2: by - Math.sin(car.angle) * (d + 20),
      life: 9,
    });
  }
}

/** A burnt-out wreck with a smoke column, placed for the capture frame. */
function addWreck(state, x, y, angle) {
  state.wrecks.push({ x, y, angle, color: '#1c1a18', radius: 17, smokeT: 0 });
  for (let i = 0; i < 8; i += 1) {
    state.particles.push({
      kind: 'smoke', x: x + (state.random() - 0.5) * 16, y: y - i * 14,
      vx: (state.random() - 0.5) * 10, vy: -40,
      life: 2.4, max: 2.4, size: 10 + i * 2, color: '#2e2a26',
    });
  }
  state.particles.push({ kind: 'flame', x, y, vx: 0, vy: 0, life: 0.5, max: 0.5, size: 14, color: '#ff9a2f' });
}

function addCrowd(state, x, y, count) {
  for (let i = 0; i < count; i += 1) {
    const ped = {
      id: 6000 + i,
      x: x + (state.random() - 0.5) * 340,
      y: y + (state.random() - 0.5) * 200,
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
    addCrowd(state, 1600, 1800, 16);
    state.cash = 1240;
  } else if (name === 'drive') {
    putPlayerInCar(state, 'sports', 1100, 1366, 0);
    startMission(state, 5);
    // Six cars on the roads around the player, so the frame reads as city traffic.
    addTraffic(state, [
      ['sedan', 1500, 1366, 0, 150, 'h', 1],
      ['hatch', 1900, 1334, Math.PI, 140, 'h', -1],
      ['van', 2300, 1366, 0, 120, 'h', 1],
      ['taxi', 750, 1334, Math.PI, 160, 'h', -1],
      ['sports', 2600, 1366, 0, 200, 'h', 1],
      ['pickup', 1350, 900, Math.PI / 2, 130, 'v', 1],
    ]);
    state.cash = 2860;
  } else if (name === 'chase') {
    // A five-star chase east along 9th Avenue: the cruisers close in but have not
    // caught the player yet, so the frame reads as pursuit, not a pile-up.
    startMission(state, 5);
    putPlayerInCar(state, 'muscle', 800, 916, 0);
    state.player.car.speed = 350;
    state.shotBoost = true; // the autopilot holds the NOS down for the whole chase
    addHeat(state, 90); // five stars: five cruisers, a helicopter, a roadblock
    for (let i = 0; i < 3; i += 1) {
      const cruiser = makeCar('police', 450 - i * 150, 916, 0, { occupied: true, rng: state.random });
      cruiser.speed = 380;
      state.cars.push(cruiser);
      state.policeCars.push(cruiser);
    }
    // Traffic on the same avenue, ahead of the player and on the crossing road.
    addTraffic(state, [
      ['sedan', 1500, 916, 0, 150, 'h', 1],
      ['hatch', 1900, 884, Math.PI, 140, 'h', -1],
      ['van', 2300, 916, 0, 120, 'h', 1],
      ['taxi', 2600, 884, Math.PI, 160, 'h', -1],
      ['sports', 2900, 916, 0, 200, 'h', 1],
      ['pickup', 1350, 650, Math.PI / 2, 130, 'v', 1],
    ]);
    state.cash = 3420;
  } else if (name === 'mission') {
    // The timed getaway to the docks, staged on the last avenue before the beach:
    // the docks building and the sea are in the frame, the city behind the player.
    startMission(state, 5);
    putPlayerInCar(state, 'sports', 1900, 2716, 0);
    state.player.car.speed = 320;
    addHeat(state, 50); // three stars: helicopter, roadblock and cruisers join the run
    state.cash = 1980;
    state.missions.timer = 13; // the clock is already running: 87 seconds left
  } else {
    state.player.x = 1500;
    state.player.y = 1800;
  }

  for (let i = 0; i < (seconds / STEP); i += 1) {
    world.step(STEP, autopilotInput(state));
  }
  // Dress the capture frame: a roadblock ahead and a smoking wreck on the shoulder
  // for the chase, tire smoke behind the player's car in both driving scenes.
  if (name === 'foot') {
    // The autopilot walks the player toward the garage during the sim, so the cab,
    // the cruiser and a few extra locals are staged around where they end up.
    const px = state.player.x;
    const py = state.player.y;
    const taxi = makeCar('taxi', px + 130, py + 46, 0, { occupied: false, rng: state.random });
    state.cars.push(taxi);
    const cruiser = makeCar('police', px - 150, py + 62, 0, { occupied: false, rng: state.random });
    state.cars.push(cruiser);
    for (let i = 0; i < 6; i += 1) {
      state.peds.push({
        id: 6100 + i,
        x: px + (state.random() - 0.5) * 420, y: py + (state.random() - 0.5) * 260,
        angle: state.random() * Math.PI * 2, speed: 0, health: 30, maxHealth: 30,
        color: ['#d94f3d', '#3d7ad9', '#e8a13c', '#7a4fd9', '#3da35f', '#d94f9e'][i % 6],
        name: 'Local', state: 'walk', down: 0, flee: 0,
        targetX: px + 200, targetY: py, wait: 0, walkPhase: state.random() * 6,
      });
    }
  } else if (name === 'chase') {
    spawnRoadblock(state, state.random);
    const car = state.player.car;
    if (car) {
      // A wreck on the shoulder ahead of the player, whatever way they are facing.
      const wx = car.x + Math.cos(car.angle) * 300 - Math.sin(car.angle) * 64;
      const wy = car.y + Math.sin(car.angle) * 300 + Math.cos(car.angle) * 64;
      addWreck(state, wx, wy, car.angle + 0.6);
      puffTireSmoke(state);
    }
  } else if (name === 'drive') {
    puffTireSmoke(state);
    addTrafficNearPlayer(state);
  } else if (name === 'mission') {
    // The cruisers from the sim are still closing in, so two more are staged right
    // behind the player and a fresh roadblock ahead of them: the frame is the chase.
    spawnRoadblock(state, state.random);
    const car = state.player.car;
    if (car) {
      for (let i = 0; i < 2; i += 1) {
        const cruiser = makeCar('police', car.x - Math.cos(car.angle) * (170 + i * 150), car.y - Math.sin(car.angle) * (170 + i * 150), car.angle, { occupied: true, rng: state.random });
        cruiser.speed = 380;
        state.cars.push(cruiser);
        state.policeCars.push(cruiser);
      }
      puffTireSmoke(state);
    }
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
