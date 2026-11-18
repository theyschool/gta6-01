// The Solara Bay Police Department: who shows up, how they chase, when they shoot, and
// when they drag you in. Wanted stars decide the force; distance and line of sight decide
// whether the heat cools off.

import { POLICE, WANTED } from './config.js';
import { makeCar, driveCar } from './vehicles.js';
import { nearestRoad, onRoad, resolveBuildings } from './city.js';

function dist(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Where a cop or a cruiser spawns: on a road, a few blocks from the player, never on top of them. */
function spawnPoint(state, random) {
  const p = state.player;
  const px = p.car ? p.car.x : p.x;
  const py = p.car ? p.car.y : p.y;
  for (let tries = 0; tries < 12; tries += 1) {
    const angle = random() * Math.PI * 2;
    const range = 480 + random() * 320;
    const x = Math.max(60, Math.min(state.city.size - 60, px + Math.cos(angle) * range));
    const y = Math.max(60, Math.min(state.city.waterY - 60, py + Math.sin(angle) * range));
    if (onRoad(x, y)) return { x, y };
    const road = nearestRoad(x, y);
    if (road.axis === 'h') return { x, y: road.at };
    return { x: road.at, y };
  }
  return { x: px + 500, y: py };
}

function spawnCop(state, random) {
  const at = spawnPoint(state, random);
  state.cops.push({
    id: 5000 + Math.floor(random() * 9000),
    x: at.x, y: at.y, angle: 0, speed: 0,
    health: POLICE.copHealth, maxHealth: POLICE.copHealth,
    color: '#1d3a5f', state: 'chase', down: 0, bust: 0, shootCd: 0, walkPhase: random() * 6,
  });
}

function spawnCruiser(state, random) {
  const at = spawnPoint(state, random);
  const road = nearestRoad(at.x, at.y);
  const car = makeCar('police', at.x, at.y, road.axis === 'h' ? 0 : Math.PI / 2, { occupied: true });
  car.axis = road.axis;
  car.dir = 1;
  state.cars.push(car);
  state.policeCars.push(car);
}

export function wantedStars(heat) {
  let stars = 0;
  for (let i = 0; i < WANTED.starAt.length; i += 1) {
    if (heat >= WANTED.starAt[i]) stars = i;
  }
  return stars;
}

/**
 * One police step: keep the force at the size the stars demand, move the cops, shoot when
 * the stars allow it, and report 'busted' when a cop holds the player on foot long enough.
 * Returns an events array: 'busted', 'copDown', 'shot'.
 */
export function updatePolice(state, dt, random) {
  const events = [];
  const p = state.player;
  const px = p.car ? p.car.x : p.x;
  const py = p.car ? p.car.y : p.y;
  const stars = state.wanted;

  // Force size follows the stars.
  const wantFoot = stars * POLICE.footPerStar;
  const wantCars = Math.min(POLICE.maxCars, stars * POLICE.carsPerStar);
  let guard = 0;
  while (state.cops.filter((c) => c.health > 0).length < wantFoot && guard < 6) {
    spawnCop(state, random);
    guard += 1;
  }
  guard = 0;
  while (state.policeCars.filter((c) => c.health > 0).length < wantCars && guard < 4) {
    spawnCruiser(state, random);
    guard += 1;
  }
  // Cops too far away give up and despawn; cruisers far away are towed off too.
  state.cops = state.cops.filter((c) => c.health > 0 && dist(c.x, c.y, px, py) < 1400);
  state.policeCars = state.policeCars.filter((c) => {
    if (c.health <= 0) return false;
    if (dist(c.x, c.y, px, py) > 1500) {
      const i = state.cars.indexOf(c);
      if (i >= 0) state.cars.splice(i, 1);
      return false;
    }
    return true;
  });

  // Foot cops: run at the player; hold them to bust; shoot at three stars and up.
  for (const cop of state.cops) {
    if (cop.health <= 0) continue;
    if (cop.down > 0) {
      cop.down -= dt;
      continue;
    }
    const d = dist(cop.x, cop.y, px, py);
    const wantAngle = Math.atan2(py - cop.y, px - cop.x);
    cop.angle += Math.max(-3.4 * dt, Math.min(3.4 * dt, angleDiff(wantAngle, cop.angle) * 3));
    const speed = d > 40 ? POLICE.copSpeed : POLICE.copSpeed * 0.4;
    cop.x += Math.cos(cop.angle) * speed * dt;
    cop.y += Math.sin(cop.angle) * speed * dt;
    cop.walkPhase += dt * 10;
    if (!p.car && d < 30) {
      cop.bust += dt;
      if (cop.bust >= POLICE.bustSeconds) events.push('busted');
    } else cop.bust = 0;
    if (stars >= POLICE.shootAtStars && !p.car && d < POLICE.shootRange) {
      cop.shootCd -= dt;
      if (cop.shootCd <= 0) {
        cop.shootCd = POLICE.shootInterval + random() * 0.5;
        if (random() < 0.55) {
          p.health -= POLICE.shootDamage;
          events.push('shot');
          state.particles.push({
            kind: 'muzzle', x: cop.x, y: cop.y, vx: 0, vy: 0, life: 0.12, max: 0.12, size: 10,
          });
        }
      }
    }
  }

  // Cruisers: steer straight at the player and ram; if they get stuck, back out and retry.
  for (const car of state.policeCars) {
    if (car.health <= 0) continue;
    const d = dist(car.x, car.y, px, py);
    const wantAngle = Math.atan2(py - car.y, px - car.x);
    const diff = angleDiff(wantAngle, car.angle);
    let throttle = 1;
    let steer = Math.max(-1, Math.min(1, diff * 1.6));
    if (Math.abs(diff) > 2.2) {
      // Facing away: reverse out, then swing around.
      throttle = -0.7;
      steer = -steer;
    }
    if (car.stuck > 0) {
      car.stuck -= dt;
      throttle = -0.8;
      steer = 0.6;
    } else if (Math.abs(car.speed) < 25 && d > 60) {
      car.stuckTimer = (car.stuckTimer || 0) + dt;
      if (car.stuckTimer > 1.6) {
        car.stuck = 0.9;
        car.stuckTimer = 0;
      }
    } else car.stuckTimer = 0;
    driveCar(car, { throttle, steer, brake: false }, dt);
    car.x = Math.max(30, Math.min(state.city.size - 30, car.x));
    car.y = Math.max(30, Math.min(state.city.waterY - 40, car.y));
    // Cruisers chase through the streets, not through buildings.
    if (resolveBuildings(state.city, car, car.radius)) car.speed *= 0.6;
    // A ram that lands: the player's car takes damage, the cruiser takes a little too.
    if (p.car && d < car.radius + p.car.radius + 4) {
      const impact = Math.abs(car.speed - p.car.speed);
      if (impact > 60) {
        p.car.health -= impact * 0.06;
        car.health -= impact * 0.02;
        state.shake = Math.min(10, state.shake + impact * 0.02);
        events.push('ram');
      }
    }
  }

  // Heat cools when no cop is close and nothing criminal just happened.
  const nearestCop = Math.min(
    ...state.cops.map((c) => dist(c.x, c.y, px, py)),
    ...state.policeCars.map((c) => dist(c.x, c.y, px, py)),
    Infinity,
  );
  if (state.crimeTimer > 0) state.crimeTimer -= dt;
  else if (state.wantedHeat > 0) {
    const rate = nearestCop > 520 ? WANTED.decayHiddenPerSecond : WANTED.decayPerSecond;
    state.wantedHeat = Math.max(0, state.wantedHeat - rate * dt);
    state.wanted = wantedStars(state.wantedHeat);
  }
  return events;
}

/** A crime the world saw: raise the heat and restart the cool-down clock. */
export function addHeat(state, amount) {
  state.wantedHeat = Math.min(100, state.wantedHeat + amount);
  state.wanted = wantedStars(state.wantedHeat);
  state.crimeTimer = 4;
}
