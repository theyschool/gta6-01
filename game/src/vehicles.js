// Vehicles: the car types, the traffic that drives the road grid, and the arcade driving
// physics the player and the police share. Traffic cars follow lanes and turn at
// intersections; they slow for the car ahead and never leave the roads.

import { CAR_TYPES, NOS, WORLD } from './config.js';
import { nearestRoad } from './city.js';
import { pick } from './random.js';

const ROAD = WORLD.roadEvery;
const HALF = WORLD.roadHalf;

let nextId = 1;

export function makeCar(typeKey, x, y, angle, opts = {}) {
  const type = CAR_TYPES[typeKey];
  const colors = type.colors;
  // Seeded when the caller passes opts.rng (the world, the police and the screenshot
  // scenes all do); Math.random is only the fallback for one-off callers, so two runs
  // of the same seed always build the same cars.
  const rng = opts.rng || Math.random;
  return {
    id: nextId++,
    type: typeKey,
    name: type.name,
    top: type.top,
    accel: type.accel,
    turn: type.turn,
    radius: type.radius,
    health: type.health,
    maxHealth: type.health,
    color: opts.color || pick(rng, colors),
    x, y, angle, speed: 0,
    isPolice: typeKey === 'police',
    isTaxi: typeKey === 'taxi',
    occupied: !!opts.occupied,
    driver: opts.driver || null,
    // Traffic state: which road it is on, which way it travels, how fast it wants to go.
    axis: opts.axis || 'h',
    dir: opts.dir || 1,
    cruise: 150 + rng() * 90,
    stuck: 0,
    reverse: 0,
    smoke: 0,
    fare: null,
    // NOS boost: a full tank, spent while boosting, refilling slowly when not.
    nos: 1,
    nosActive: false,
    roadblock: false,
  };
}

/** A parked car from a city parking spot. */
export function makeParkedCar(spot, random) {
  const keys = ['sedan', 'hatch', 'sedan', 'van', 'pickup', 'sports', 'muscle', 'hatch'];
  const key = pick(random, keys);
  const car = makeCar(key, spot.x, spot.y, spot.angle, { occupied: false, rng: random });
  const road = nearestRoad(spot.x, spot.y);
  car.axis = road.axis;
  car.dir = 1;
  return car;
}

/** The nearest road point ahead of a car, used by traffic and the autopilot. */
function roadPointAhead(car, city, ahead) {
  const road = nearestRoad(car.x, car.y);
  if (road.axis === 'h') {
    return { x: car.x + Math.cos(car.angle) * ahead, y: road.at, axis: 'h' };
  }
  return { x: road.at, y: car.y + Math.sin(car.angle) * ahead, axis: 'v' };
}

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Is another car in this car's lane, ahead of it, within `dist`? */
function carAhead(car, cars, dist) {
  let nearest = null;
  for (let i = 0; i < cars.length; i += 1) {
    const other = cars[i];
    if (other === car || (other.speed === 0 && other.occupied === false)) continue;
    const dx = other.x - car.x;
    const dy = other.y - car.y;
    const along = dx * Math.cos(car.angle) + dy * Math.sin(car.angle);
    const side = Math.abs(-dx * Math.sin(car.angle) + dy * Math.cos(car.angle));
    if (along > 0 && along < dist && side < 26) {
      if (!nearest || along < nearest) nearest = along;
    }
  }
  return nearest;
}

/**
 * One traffic step: stay in the lane, turn at intersections sometimes, slow for the car
 * ahead, and keep a little noise in the cruise speed so traffic never looks synchronised.
 */
export function updateTrafficCar(car, city, cars, dt, random) {
  const target = roadPointAhead(car, city, 90);
  const wantAngle = Math.atan2(target.y - car.y, target.x - car.x);
  const diff = angleDiff(wantAngle, car.angle);
  car.angle += Math.max(-car.turn * dt, Math.min(car.turn * dt, diff * 2.2));

  // At an intersection, sometimes turn onto the crossing road.
  const road = nearestRoad(car.x, car.y);
  const along = road.axis === 'h' ? car.x : car.y;
  const nearCrossing = Math.abs(along - Math.round(along / ROAD) * ROAD) < 26;
  if (nearCrossing && random() < dt * 0.25) {
    const turn = random() < 0.5 ? Math.PI / 2 : -Math.PI / 2;
    car.angle += turn;
  }

  const ahead = carAhead(car, cars, 85);
  let wantSpeed = car.cruise;
  if (ahead !== null) wantSpeed = Math.min(wantSpeed, Math.max(0, (ahead - 34) * 2.2));
  if (car.speed < wantSpeed) car.speed = Math.min(wantSpeed, car.speed + car.accel * 0.6 * dt);
  else car.speed = Math.max(wantSpeed, car.speed - car.accel * 1.2 * dt);

  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  // Never leave the city or drive into the sea.
  car.x = Math.max(30, Math.min(city.size - 30, car.x));
  car.y = Math.max(30, Math.min(city.waterY - 40, car.y));
}

/**
 * Arcade driving for a driven car (the player, or a police car in pursuit): throttle,
 * steering that bites harder at speed, handbrake drift, and a reverse gear.
 * `input` is {throttle -1..1, steer -1..1, brake, boost} ; returns the impact speed if it hit a wall.
 * Boost is NOS: +40% top speed while held and the tank lasts, about three seconds a fill.
 */
export function driveCar(car, input, dt) {
  const forward = Math.cos(car.angle);
  const right = Math.sin(car.angle);
  const speedAlong = car.speed;
  const steerAuthority = Math.min(1, Math.abs(speedAlong) / 120 + 0.25);
  car.angle += input.steer * car.turn * steerAuthority * dt * (speedAlong >= 0 ? 1 : -1) * 0.9;
  car.nosActive = !!input.boost && car.nos > 0;
  if (car.nosActive) car.nos = Math.max(0, car.nos - NOS.drainPerSecond * dt);
  else car.nos = Math.min(1, car.nos + NOS.rechargePerSecond * dt);
  const top = car.nosActive ? car.top * NOS.boostMult : car.top;
  if (input.throttle > 0) {
    car.speed = Math.min(top, car.speed + car.accel * input.throttle * dt);
  } else if (input.throttle < 0) {
    if (car.speed > 30) car.speed = Math.max(0, car.speed - car.accel * 1.4 * dt);
    else car.speed = Math.max(-car.top * 0.45, car.speed + car.accel * 0.7 * input.throttle * dt);
  } else {
    car.speed -= car.speed * 0.55 * dt;
    if (Math.abs(car.speed) < 4) car.speed = 0;
  }
  if (input.brake) {
    car.speed -= car.speed * 2.4 * dt;
    // A handbrake turn: the back steps out a little while the car keeps its heading.
    car.angle += input.steer * 1.1 * dt * (car.speed >= 0 ? 1 : -1);
  }
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  return { forward, right };
}

/** Push two overlapping cars apart and trade a little speed between them. */
export function collideCars(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const min = a.radius + b.radius;
  const d2 = dx * dx + dy * dy;
  if (d2 >= min * min || d2 === 0) return 0;
  const d = Math.sqrt(d2);
  const push = (min - d) / 2;
  const nx = dx / d;
  const ny = dy / d;
  a.x -= nx * push;
  a.y -= ny * push;
  b.x += nx * push;
  b.y += ny * push;
  const impact = Math.abs(a.speed - b.speed);
  const avg = (a.speed + b.speed) / 2;
  a.speed = avg * 0.7;
  b.speed = avg * 0.7;
  return impact;
}

export { angleDiff };
