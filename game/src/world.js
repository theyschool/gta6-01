// The world: everything that moves and everything that happens. Player on foot and in cars,
// traffic, pedestrians, pickups, the taxi trade, combat, damage, particles and skid marks.
// The missions and the police live in their own files; this one calls them each step.

import { CAR_TYPES, ECONOMY, PLAYER, STEP, WANTED, WEAPONS, WORLD } from './config.js';
import { createCity, hitBuilding, inWater, nearestRoad, onRoad, resolveBuildings } from './city.js';
import { createRandom, pick } from './random.js';
import { collideCars, driveCar, makeCar, makeParkedCar, updateTrafficCar } from './vehicles.js';
import { addHeat, updatePolice, wantedStars } from './police.js';
import { createMissionRunner, missionMarker, startMission, updateMission } from './missions.js';

function dist(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

const PED_COLORS = ['#d94f3d', '#3d7ad9', '#e8a13c', '#7a4fd9', '#3da35f', '#d94f9e', '#4fa3a5', '#c0c8d0', '#8c5a2b', '#5a6b8a'];
const PED_NAMES = ['Mara', 'Tomas', 'Lena', 'Kiko', 'Rosa', 'Dev', 'Ana', 'Bruno', 'Sofia', 'Iker'];

export function createWorld(random) {
  const city = createCity(random);
  const state = {
    city,
    random,
    time: 0,
    clock: 17 * 60 + 20, // golden hour: the city at 5:20 in the afternoon
    cash: ECONOMY.startCash,
    health: PLAYER.health,
    armor: 0,
    wantedHeat: 0,
    wanted: 0,
    crimeTimer: 0,
    player: {
      x: city.start.x, y: city.start.y, angle: -Math.PI / 2, speed: 0,
      onFoot: true, car: null, weapon: 'fists', ammo: 0,
      punchCd: 0, shootCd: 0, reload: 0, runPhase: 0,
    },
    cars: [],
    peds: [],
    cops: [],
    policeCars: [],
    heli: null,
    roadblocks: [],
    lastRoadblockAt: -99,
    wrecks: [],
    shotBoost: false,
    particles: [],
    skids: [],
    pickups: [],
    missions: createMissionRunner(),
    taxi: { active: false, passenger: null, destination: null, fare: 0, wait: 0 },
    cashVan: null,
    unlocked: { pistol: false, shotgun: false },
    stats: { carsStolen: 0, pedsDown: 0, earned: 0, packages: 0, fares: 0, timePlayed: 0 },
    message: null,
    messageUntil: 0,
    shake: 0,
    wasted: false,
    busted: false,
    attract: false,
    best: 0,
  };

  function showMessage(text, seconds) {
    state.message = text;
    state.messageUntil = state.time + (seconds || 4);
  }

  // The HUD, the minimap and the autopilot all ask the state for its mission marker.
  state.missionMarker = () => missionMarker(state);

  function spawnParticles(kind, x, y, count, color) {
    for (let i = 0; i < count; i += 1) {
      const a = random() * Math.PI * 2;
      const sp = 40 + random() * (kind === 'explosion' ? 260 : 120);
      state.particles.push({
        kind, x, y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: kind === 'smoke' ? 1.4 : 0.6, max: kind === 'smoke' ? 1.4 : 0.6,
        size: kind === 'explosion' ? 10 + random() * 18 : 3 + random() * 5,
        color: color || (kind === 'spark' ? '#f2a541' : kind === 'blood' ? '#a02020' : '#888888'),
      });
    }
    if (state.particles.length > 320) state.particles.splice(0, state.particles.length - 320);
  }

  function spawnTrafficCar() {
    const lines = city.lines;
    const line = lines[1 + Math.floor(random() * (lines.length - 2))];
    const along = 100 + random() * (city.size - 200);
    const horizontal = random() < 0.5;
    const dir = random() < 0.5 ? 1 : -1;
    const keys = ['sedan', 'hatch', 'sedan', 'van', 'pickup', 'taxi', 'sports', 'muscle'];
    const key = pick(random, keys);
    const lane = WORLD.lane;
    let x;
    let y;
    let angle;
    if (horizontal) {
      x = along;
      y = line + (dir === 1 ? lane : -lane);
      angle = dir === 1 ? 0 : Math.PI;
    } else {
      x = line + (dir === 1 ? -lane : lane);
      y = along;
      angle = dir === 1 ? Math.PI / 2 : -Math.PI / 2;
    }
    const car = makeCar(key, x, y, angle, { occupied: true, axis: horizontal ? 'h' : 'v', dir, rng: random });
    car.speed = car.cruise * 0.7;
    return car;
  }

  function spawnPed() {
    const lines = city.lines;
    const line = lines[1 + Math.floor(random() * (lines.length - 2))];
    const along = 100 + random() * (city.size - 200);
    const horizontal = random() < 0.5;
    const side = random() < 0.5 ? -1 : 1;
    const off = WORLD.roadHalf + 5;
    return {
      id: 1000 + Math.floor(random() * 90000),
      x: horizontal ? along : line + side * off,
      y: horizontal ? line + side * off : along,
      angle: random() * Math.PI * 2,
      speed: 0,
      health: 30, maxHealth: 30,
      color: pick(random, PED_COLORS),
      name: pick(random, PED_NAMES),
      state: 'walk', down: 0, flee: 0,
      targetX: 0, targetY: 0, wait: random() * 2,
      walkPhase: random() * 6,
    };
  }

  function spawnPickups() {
    state.pickups = [];
    // Health at the hospital, ammo at the gun shop in Old Town, and a few of each around town.
    state.pickups.push({ kind: 'health', x: city.hospital.x, y: city.hospital.y, respawn: 0 });
    state.pickups.push({ kind: 'ammo', x: 650, y: 2050, respawn: 0 });
    for (let i = 0; i < 4; i += 1) {
      const line = city.lines[1 + Math.floor(random() * 6)];
      state.pickups.push({ kind: 'health', x: 300 + random() * 2800, y: line + 60, respawn: 0 });
    }
    for (let i = 0; i < 4; i += 1) {
      const line = city.lines[1 + Math.floor(random() * 6)];
      state.pickups.push({ kind: 'ammo', x: 300 + random() * 2800, y: line - 60, respawn: 0 });
    }
  }

  function reset() {
    state.time = 0;
    state.clock = 17 * 60 + 20;
    state.cash = ECONOMY.startCash;
    state.health = PLAYER.health;
    state.armor = 0;
    state.wantedHeat = 0;
    state.wanted = 0;
    state.crimeTimer = 0;
    state.player.x = city.start.x;
    state.player.y = city.start.y;
    state.player.angle = -Math.PI / 2;
    state.player.speed = 0;
    state.player.onFoot = true;
    state.player.car = null;
    state.player.weapon = 'fists';
    state.player.ammo = 0;
    state.player.punchCd = 0;
    state.player.shootCd = 0;
    state.player.reload = 0;
    state.cars = city.parkedSpots.map((spot) => makeParkedCar(spot, random));
    state.peds = [];
    state.cops = [];
    state.policeCars = [];
    state.heli = null;
    state.roadblocks = [];
    state.lastRoadblockAt = -99;
    state.wrecks = [];
    state.shotBoost = false;
    state.particles = [];
    state.skids = [];
    state.missions = createMissionRunner();
    state.taxi = { active: false, passenger: null, destination: null, fare: 0, wait: 0 };
    state.cashVan = null;
    state.unlocked = { pistol: false, shotgun: false };
    state.stats = { carsStolen: 0, pedsDown: 0, earned: 0, packages: 0, fares: 0, timePlayed: 0 };
    state.message = null;
    state.shake = 0;
    state.wasted = false;
    state.busted = false;
    spawnPickups();
    for (let i = 0; i < 22; i += 1) state.cars.push(spawnTrafficCar());
    for (let i = 0; i < 36; i += 1) state.peds.push(spawnPed());
    startMission(state, 0);
    showMessage("Vera: get a car, Jax. Any car. Then bring it to my garage.", 6);
  }

  /** The player steps into the nearest car, or out of the one they are driving. */
  function toggleCar(events) {
    const p = state.player;
    if (!p.onFoot) {
      if (Math.abs(p.car.speed) > 90) return;
      const car = p.car;
      car.occupied = false;
      car.speed = 0;
      p.x = car.x + Math.cos(car.angle + Math.PI / 2) * (car.radius + 16);
      p.y = car.y + Math.sin(car.angle + Math.PI / 2) * (car.radius + 16);
      p.onFoot = true;
      p.car = null;
      p.angle = car.angle;
      if (state.taxi.active) {
        state.taxi.active = false;
        state.taxi.passenger = null;
        state.taxi.destination = null;
        showMessage('You left the cab — the fare is gone.', 3);
      }
      return;
    }
    let best = null;
    let bestD = 48;
    for (const car of state.cars) {
      if (car.health <= 0) continue;
      const d = dist(p.x, p.y, car.x, car.y);
      if (d < bestD) {
        bestD = d;
        best = car;
      }
    }
    if (!best) return;
    if (best.isCashVan && state.missions.index >= 0 && state.missions.index === 7) {
      state.missions.vanTaken = true;
      addHeat(state, 30);
      showMessage('You took the money! Now lose the heat and get to the docks.', 5);
      events.push('cash');
      return;
    }
    if (best.isPolice) {
      addHeat(state, WANTED.stealPoliceCar);
      showMessage('You stole a police cruiser! The whole department is coming.', 4);
      events.push('crime');
    } else if (best.occupied) {
      const driver = spawnPed();
      driver.x = best.x + Math.cos(best.angle + Math.PI / 2) * 30;
      driver.y = best.y + Math.sin(best.angle + Math.PI / 2) * 30;
      driver.state = 'flee';
      driver.flee = 6;
      state.peds.push(driver);
      addHeat(state, WANTED.stealCar);
      state.stats.carsStolen += 1;
      showMessage(`You jacked a ${best.name}!`, 3);
      events.push('crime');
    } else {
      state.stats.carsStolen += 1;
    }
    best.occupied = true;
    best.driver = 'player';
    p.car = best;
    p.onFoot = false;
    p.speed = best.speed;
    if (best.isTaxi) {
      state.taxi.active = true;
      state.taxi.wait = 1.5;
      showMessage('Taxi shift started — a passenger is coming. Drive them where they point.', 5);
    }
  }

  /** Punch the nearest person in front of the player. */
  function punch(events) {
    const p = state.player;
    if (!p.onFoot || p.punchCd > 0) return;
    p.punchCd = PLAYER.punchCooldown;
    const fx = p.x + Math.cos(p.angle) * 20;
    const fy = p.y + Math.sin(p.angle) * 20;
    const targets = [...state.peds, ...state.cops];
    for (const t of targets) {
      if (t.health <= 0 || t.down > 0) continue;
      if (dist(fx, fy, t.x, t.y) < PLAYER.punchRange) {
        t.health -= PLAYER.punchDamage;
        t.down = 2.2;
        t.flee = 5;
        spawnParticles('spark', t.x, t.y, 6, '#f2e394');
        events.push('punch');
        if (t.state === 'debtor') {
          state.missions.defeated += 1;
          showMessage(`Debtor dealt with — ${state.missions.defeated}/3`, 3);
        } else if (state.cops.includes(t)) {
          addHeat(state, 12);
          events.push('crime');
        } else {
          addHeat(state, WANTED.punchPed);
          state.stats.pedsDown += 1;
          events.push('crime');
        }
        if (t.health <= 0) {
          t.state = 'down';
          t.down = 8;
          if (!state.cops.includes(t)) {
            addHeat(state, WANTED.killPed - WANTED.punchPed);
            events.push('crime');
          }
        }
        return;
      }
    }
  }

  /** Fire the equipped weapon at the mouse aim point. */
  function shoot(events) {
    const p = state.player;
    if (!p.onFoot || p.shootCd > 0 || p.reload > 0) return;
    const weapon = WEAPONS[p.weapon];
    if (p.weapon === 'fists') return;
    if (p.ammo <= 0) {
      p.reload = 1.1;
      return;
    }
    p.shootCd = weapon.rate;
    p.ammo -= 1;
    const aimAngle = Math.atan2(state.aimY - p.y, state.aimX - p.x);
    const mx = p.x + Math.cos(aimAngle) * 26;
    const my = p.y + Math.sin(aimAngle) * 26;
    state.particles.push({ kind: 'muzzle', x: mx, y: my, vx: 0, vy: 0, life: 0.1, max: 0.1, size: 12, color: '#ffd76a' });
    events.push('shot');
    addHeat(state, WANTED.shoot);
    const pellets = weapon.pellets || 1;
    for (let pellet = 0; pellet < pellets; pellet += 1) {
      const a = aimAngle + (random() - 0.5) * 2 * weapon.spread;
      let best = null;
      let bestAlong = weapon.range;
      const consider = (obj, radius) => {
        const dx = obj.x - p.x;
        const dy = obj.y - p.y;
        const along = dx * Math.cos(a) + dy * Math.sin(a);
        const side = Math.abs(-dx * Math.sin(a) + dy * Math.cos(a));
        if (along > 10 && along < bestAlong && side < radius) {
          bestAlong = along;
          best = { obj, radius, along };
        }
      };
      for (const cop of state.cops) if (cop.health > 0 && cop.down <= 0) consider(cop, 16);
      for (const ped of state.peds) if (ped.health > 0 && ped.down <= 0) consider(ped, 15);
      for (const car of state.cars) if (car.health > 0) consider(car, car.radius);
      if (best) {
        const hx = p.x + Math.cos(a) * bestAlong;
        const hy = p.y + Math.sin(a) * bestAlong;
        const obj = best.obj;
        if (obj.health !== undefined && obj.type !== undefined) {
          obj.health -= weapon.damage;
          spawnParticles('spark', hx, hy, 5, '#f2a541');
          if (obj.health <= 0) explodeCar(obj, events);
        } else {
          obj.health -= weapon.damage;
          spawnParticles('blood', hx, hy, 6, '#a02020');
          obj.down = 2.5;
          obj.flee = 6;
          if (obj.state === 'debtor') {
            state.missions.defeated += 1;
            showMessage(`Debtor dealt with — ${state.missions.defeated}/3`, 3);
          }
          if (state.cops.includes(obj)) {
            addHeat(state, 10);
            if (obj.health <= 0) events.push('copDown');
          } else {
            addHeat(state, WANTED.killPed);
            state.stats.pedsDown += 1;
            events.push('crime');
            if (obj.health <= 0) obj.state = 'down';
          }
        }
      }
    }
    if (p.ammo <= 0) p.reload = 1.1;
  }

  function explodeCar(car, events) {
    if (car.health > -999) {
      car.health = -1000;
      spawnParticles('explosion', car.x, car.y, 26, '#ff7a2f');
      spawnParticles('smoke', car.x, car.y, 12, '#555555');
      // The wreck stays: a burnt husk with a smoke column, so a kill reads in the frame.
      state.wrecks.push({ x: car.x, y: car.y, angle: car.angle, color: car.color, radius: car.radius, smokeT: 0 });
      if (state.wrecks.length > 8) state.wrecks.shift();
      state.shake = Math.min(14, state.shake + 8);
      events.push('explosion');
      if (state.player.car === car) {
        state.player.car = null;
        state.player.onFoot = true;
        state.player.x = car.x + 40;
        state.player.y = car.y + 40;
        state.health -= 25;
      }
      const i = state.cars.indexOf(car);
      if (i >= 0) state.cars.splice(i, 1);
      const pi = state.policeCars.indexOf(car);
      if (pi >= 0) state.policeCars.splice(pi, 1);
    }
  }

  function updatePlayer(dt, input, events) {
    const p = state.player;
    p.punchCd = Math.max(0, p.punchCd - dt);
    p.shootCd = Math.max(0, p.shootCd - dt);
    if (p.reload > 0) {
      p.reload -= dt;
      if (p.reload <= 0) p.ammo = WEAPONS[p.weapon].ammo;
    }
    if (p.onFoot) {
      const speed = input.run ? PLAYER.run : PLAYER.walk;
      const mag = Math.hypot(input.mx, input.my);
      if (mag > 0.05) {
        const nx = input.mx / Math.max(1, mag);
        const ny = input.my / Math.max(1, mag);
        const stepX = nx * speed * dt;
        const stepY = ny * speed * dt;
        p.x += stepX;
        if (hitBuilding(state.city, p.x, p.y, PLAYER.radius)) p.x -= stepX;
        p.y += stepY;
        if (hitBuilding(state.city, p.x, p.y, PLAYER.radius)) p.y -= stepY;
        if (p.weapon === 'fists') p.angle = Math.atan2(ny, nx);
        else p.angle = Math.atan2(state.aimY - p.y, state.aimX - p.x);
        p.runPhase += dt * (input.run ? 13 : 9);
      }
      p.x = clamp(p.x, 30, state.city.size - 30);
      p.y = clamp(p.y, 30, state.city.waterY - 30);
      if (input.enter) toggleCar(events);
      if (input.punch) punch(events);
      if (input.shoot) shoot(events);
      // The hospital patches you up when you stand by its doors.
      if (dist(p.x, p.y, state.city.hospital.x, state.city.hospital.y) < 90) {
        state.health = Math.min(PLAYER.health, state.health + 12 * dt);
      }
    } else {
      const car = p.car;
      const before = car.speed;
      // W is up on the screen, so forward is -my: up means throttle, down means reverse.
      // Shift is NOS in a car (and a sprint on foot): +40% top speed while the tank lasts.
      driveCar(car, { throttle: -input.my, steer: input.mx, brake: input.brake, boost: input.run }, dt);
      car.x = clamp(car.x, 30, state.city.size - 30);
      car.y = clamp(car.y, 30, state.city.waterY - 40);
      const hit = resolveBuildings(state.city, car, car.radius);
      if (hit && Math.abs(before) > 150) {
        car.health -= (Math.abs(before) - 150) * 0.06;
        car.speed *= 0.45;
        spawnParticles('spark', car.x, car.y, 8, '#f2a541');
        state.shake = Math.min(10, state.shake + 3);
        events.push('crash');
      }
      // NOS flames from the exhaust, and a little shake, while the boost is on.
      if (car.nosActive) {
        const ex = car.x - Math.cos(car.angle) * car.radius * 1.2;
        const ey = car.y - Math.sin(car.angle) * car.radius * 1.2;
        state.particles.push({
          kind: 'flame', x: ex + (random() - 0.5) * 6, y: ey + (random() - 0.5) * 6,
          vx: -Math.cos(car.angle) * 120, vy: -Math.sin(car.angle) * 120,
          life: 0.28, max: 0.28, size: 7 + random() * 6, color: '#ff9a2f',
        });
        state.shake = Math.max(state.shake, 1.6);
      }
      // Tire smoke and skid marks on a hard handbrake stop or a fast drift.
      const drifting = Math.abs(input.mx) > 0.7 && Math.abs(car.speed) > 300;
      if ((input.brake && Math.abs(car.speed) > 160) || drifting) {
        const bx = car.x - Math.cos(car.angle) * car.radius;
        const by = car.y - Math.sin(car.angle) * car.radius;
        state.skids.push({ x1: bx, y1: by, x2: bx + Math.cos(car.angle) * car.speed * dt, y2: by + Math.sin(car.angle) * car.speed * dt, life: 9 });
        if (state.skids.length > 420) state.skids.splice(0, state.skids.length - 420);
        state.particles.push({
          kind: 'smoke', x: bx + (random() - 0.5) * 10, y: by + (random() - 0.5) * 10,
          vx: (random() - 0.5) * 30, vy: -20 - random() * 20,
          life: 0.9, max: 0.9, size: 7 + random() * 5, color: '#9a9a9a',
        });
      }
      if (car.health <= 0) explodeCar(car, events);
      else if (car.health < car.maxHealth * 0.5) {
        car.smoke += dt;
        if (car.smoke > 0.12) {
          car.smoke = 0;
          state.particles.push({ kind: 'smoke', x: car.x, y: car.y, vx: (random() - 0.5) * 20, vy: -30, life: 1.2, max: 1.2, size: 9 + random() * 7, color: '#444444' });
        }
      }
      if (input.enter) toggleCar(events);
    }
  }

  function updatePeds(dt, events) {
    const p = state.player;
    const px = p.car ? p.car.x : p.x;
    const py = p.car ? p.car.y : p.y;
    // Keep the crowd near the player.
    let guard = 0;
    while (state.peds.length < 34 && guard < 4) {
      const ped = spawnPed();
      if (dist(ped.x, ped.y, px, py) > 500 && dist(ped.x, ped.y, px, py) < 1100) state.peds.push(ped);
      guard += 1;
    }
    for (const ped of state.peds) {
      if (ped.health <= 0 && ped.state !== 'down') {
        ped.state = 'down';
        ped.down = 8;
      }
      if (ped.down > 0) {
        ped.down -= dt;
        if (ped.down <= 0 && ped.health > 0) {
          ped.state = 'walk';
          ped.flee = 4;
        }
        continue;
      }
      if (ped.state === 'passenger') continue;
      if (ped.flee > 0) {
        ped.flee -= dt;
        const away = Math.atan2(ped.y - py, ped.x - px);
        ped.angle = away;
        ped.x += Math.cos(away) * 200 * dt;
        ped.y += Math.sin(away) * 200 * dt;
        ped.walkPhase += dt * 13;
        continue;
      }
      if (ped.wait > 0) {
        ped.wait -= dt;
        if (ped.wait <= 0) {
          const road = nearestRoad(ped.x, ped.y);
          const along = (road.axis === 'h' ? ped.x : ped.y) + (random() - 0.5) * 500;
          const side = random() < 0.5 ? -1 : 1;
          if (road.axis === 'h') {
            ped.targetX = clamp(along, 80, state.city.size - 80);
            ped.targetY = road.at + side * (WORLD.roadHalf + 5);
          } else {
            ped.targetX = road.at + side * (WORLD.roadHalf + 5);
            ped.targetY = clamp(along, 80, state.city.waterY - 80);
          }
        }
        continue;
      }
      const d = dist(ped.x, ped.y, ped.targetX, ped.targetY);
      if (d < 12 || (ped.targetX === 0 && ped.targetY === 0)) {
        ped.wait = 1 + random() * 4;
        continue;
      }
      const want = Math.atan2(ped.targetY - ped.y, ped.targetX - ped.x);
      ped.angle += Math.max(-4 * dt, Math.min(4 * dt, angleDiff(want, ped.angle) * 4));
      const speed = ped.state === 'debtor' ? 0 : 62 + Math.sin(ped.walkPhase) * 8;
      ped.x += Math.cos(ped.angle) * speed * dt;
      ped.y += Math.sin(ped.angle) * speed * dt;
      ped.walkPhase += dt * 8;
      if (hitBuilding(state.city, ped.x, ped.y, 10)) {
        ped.x -= Math.cos(ped.angle) * speed * dt;
        ped.y -= Math.sin(ped.angle) * speed * dt;
        ped.wait = 0.5;
      }
      // A fast car through a crowd is a crime, and a tragedy — but only on the road itself:
      // people on the sidewalk are safe from passing traffic.
      for (const car of state.cars) {
        if (car.speed > 60 && onRoad(ped.x, ped.y) && dist(ped.x, ped.y, car.x, car.y) < car.radius + 10) {
          ped.health -= car.speed > 260 ? 100 : 45;
          ped.down = 3;
          ped.flee = 0;
          spawnParticles('blood', ped.x, ped.y, 6, '#a02020');
          if (car === p.car) {
            addHeat(state, car.speed > 260 ? WANTED.killPed : WANTED.punchPed);
            state.stats.pedsDown += 1;
            events.push('crime');
          }
          break;
        }
      }
    }
    state.peds = state.peds.filter((ped) => dist(ped.x, ped.y, px, py) < 1500 || ped.state === 'debtor');
  }

  function updateTraffic(dt) {
    const p = state.player;
    const px = p.car ? p.car.x : p.x;
    const py = p.car ? p.car.y : p.y;
    let guard = 0;
    const traffic = state.cars.filter((c) => c.occupied && !c.isPolice && c !== p.car && !c.isCashVan);
    while (traffic.length < 20 && guard < 3) {
      const car = spawnTrafficCar();
      if (dist(car.x, car.y, px, py) > 450) {
        state.cars.push(car);
        traffic.push(car);
      }
      guard += 1;
    }
    for (const car of state.cars) {
      if (!car.occupied || car.isPolice || car === p.car || car.isCashVan) continue;
      updateTrafficCar(car, state.city, state.cars, dt, random);
      resolveBuildings(state.city, car, car.radius);
    }
    if (state.cashVan && state.cashVan.health > 0) {
      updateTrafficCar(state.cashVan, state.city, state.cars, dt, random);
    }
    // Car-to-car collisions. The player's car is a battering ram: it keeps most of its
    // speed and shoves the other car aside, so a chase never dies in a traffic jam.
    const cars = state.cars;
    for (let i = 0; i < cars.length; i += 1) {
      for (let j = i + 1; j < cars.length; j += 1) {
        const a = cars[i];
        const b = cars[j];
        if (a.health <= 0 || b.health <= 0) continue;
        if (Math.abs(a.x - b.x) > 60 || Math.abs(a.y - b.y) > 60) continue;
        const aSpeed = a.speed;
        const bSpeed = b.speed;
        const impact = collideCars(a, b);
        if (impact > 120) {
          a.health -= impact * 0.04;
          b.health -= impact * 0.04;
          spawnParticles('spark', (a.x + b.x) / 2, (a.y + b.y) / 2, 5, '#f2a541');
          if (a === p.car || b === p.car) {
            const playerCar = a === p.car ? a : b;
            const other = a === p.car ? b : a;
            playerCar.speed = Math.max(playerCar.speed, Math.max(aSpeed, bSpeed) * 0.8);
            const dx = other.x - playerCar.x;
            const dy = other.y - playerCar.y;
            const d = Math.hypot(dx, dy) || 1;
            other.x += (dx / d) * 16;
            other.y += (dy / d) * 16;
            other.speed *= 0.6;
            state.shake = Math.min(8, state.shake + 2);
          }
        }
      }
    }
    for (let i = state.cars.length - 1; i >= 0; i -= 1) {
      const car = state.cars[i];
      if (car.health <= 0) {
        if (car !== p.car) explodeCar(car, []);
        continue;
      }
      if (!car.occupied && car !== p.car && dist(car.x, car.y, px, py) > 1500 && !car.isCashVan) {
        state.cars.splice(i, 1);
      }
    }
  }

  function updateTaxi(dt, events) {
    const t = state.taxi;
    const p = state.player;
    if (!t.active || !p.car || !p.car.isTaxi) return;
    if (!t.passenger) {
      t.wait -= dt;
      if (t.wait <= 0) {
        const ped = spawnPed();
        ped.x = p.car.x + Math.cos(p.car.angle + Math.PI / 2) * 40;
        ped.y = p.car.y + Math.sin(p.car.angle + Math.PI / 2) * 40;
        ped.state = 'passenger';
        state.peds.push(ped);
        t.passenger = ped;
        const line = state.city.lines[1 + Math.floor(random() * 6)];
        t.destination = { x: 200 + random() * 3000, y: line };
        t.fare = ECONOMY.fareMin + Math.floor(random() * (ECONOMY.fareMax - ECONOMY.fareMin));
        showMessage(`Passenger: take me to the pin on the map. $${t.fare} in it for you.`, 4);
      }
      return;
    }
    const d = dist(p.car.x, p.car.y, t.destination.x, t.destination.y);
    if (d < 70) {
      const tip = Math.floor(random() * 15);
      const paid = t.fare + tip;
      state.cash += paid;
      state.stats.earned += paid;
      state.stats.fares += 1;
      state.missions.faresEarned += paid;
      showMessage(`Fare complete — $${paid} (incl. $${tip} tip)`, 3);
      events.push('cash');
      const ped = t.passenger;
      ped.state = 'flee';
      ped.flee = 3;
      ped.x = p.car.x + 40;
      ped.y = p.car.y + 40;
      t.passenger = null;
      t.destination = null;
      t.wait = 2.5;
    }
  }

  function updatePickups(dt, events) {
    const p = state.player;
    const px = p.car ? p.car.x : p.x;
    const py = p.car ? p.car.y : p.y;
    for (const pickup of state.pickups) {
      if (pickup.respawn > 0) {
        pickup.respawn -= dt;
        continue;
      }
      if (dist(px, py, pickup.x, pickup.y) < 34) {
        if (pickup.kind === 'health') {
          state.health = Math.min(PLAYER.health, state.health + 40);
          showMessage('Health +40', 2);
        } else {
          const weapon = state.unlocked.shotgun ? 'shotgun' : state.unlocked.pistol ? 'pistol' : null;
          if (weapon) {
            state.player.weapon = weapon;
            state.player.ammo = WEAPONS[weapon].ammo;
            showMessage(`${WEAPONS[weapon].name} ammo restocked`, 2);
          } else {
            state.cash += 50;
            showMessage('Found a stash — +$50', 2);
          }
        }
        pickup.respawn = 30;
        events.push('pickup');
      }
    }
    for (const pack of state.city.packages) {
      if (pack.taken) continue;
      if (dist(px, py, pack.x, pack.y) < 26) {
        pack.taken = true;
        state.cash += ECONOMY.packageValue;
        state.stats.earned += ECONOMY.packageValue;
        state.stats.packages += 1;
        showMessage(`Hidden package found — +$${ECONOMY.packageValue} (${state.stats.packages}/15)`, 3);
        events.push('cash');
      }
    }
  }

  function updateParticles(dt) {
    for (let i = state.particles.length - 1; i >= 0; i -= 1) {
      const pt = state.particles[i];
      pt.life -= dt;
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      if (pt.kind === 'smoke') {
        pt.vy -= 12 * dt;
        pt.size += 14 * dt;
      }
      if (pt.life <= 0) state.particles.splice(i, 1);
    }
    // Wrecks keep smoking: a black column that marks where the kill happened.
    for (const wreck of state.wrecks) {
      wreck.smokeT += dt;
      if (wreck.smokeT > 0.14) {
        wreck.smokeT = 0;
        state.particles.push({
          kind: 'smoke', x: wreck.x + (random() - 0.5) * 14, y: wreck.y + (random() - 0.5) * 10,
          vx: (random() - 0.5) * 12, vy: -46 - random() * 20,
          life: 2.4, max: 2.4, size: 10 + random() * 8, color: '#2e2a26',
        });
        if (state.particles.length > 320) state.particles.splice(0, state.particles.length - 320);
      }
    }
    for (let i = state.skids.length - 1; i >= 0; i -= 1) {
      state.skids[i].life -= dt;
      if (state.skids[i].life <= 0) state.skids.splice(i, 1);
    }
    state.shake = Math.max(0, state.shake - dt * 22);
  }

  function step(dt, input) {
    const events = [];
    state.time += dt;
    state.stats.timePlayed += dt;
    state.clock = 17 * 60 + 20 + Math.floor(state.time / 6);
    state.aimX = input.aimX;
    state.aimY = input.aimY;

    if (!state.attract) {
      updatePlayer(dt, input, events);
      updateTraffic(dt);
      updatePeds(dt, events);
      updateTaxi(dt, events);
      updatePickups(dt, events);
      const policeEvents = updatePolice(state, dt, random);
      for (const e of policeEvents) {
        if (e === 'busted') {
          state.busted = true;
          events.push('busted');
        } else if (e === 'shot') events.push('shot');
        else if (e === 'ram') events.push('ram');
      }
      const missionEvents = [];
      const missionResult = updateMission(state, dt, missionEvents);
      if (missionResult === 'done') {
        const m = state.missions.justFinished;
        showMessage(`${m.title} complete — +$${m.reward}`, 5);
        events.push('missionDone');
      } else if (missionResult === 'fail') {
        showMessage('Mission failed — talk to Vera at the garage to try again.', 5);
        events.push('missionFail');
      }
      if (state.health <= 0 && !state.wasted) {
        state.wasted = true;
        events.push('wasted');
      }
      if (state.message && state.time > state.messageUntil) state.message = null;
    } else {
      // Attract mode: the city lives behind the title screen, nobody gets hurt.
      updateTraffic(dt);
      updatePeds(dt, events);
      if (!state.player.car) {
        const car = state.cars.find((c) => c.type === 'sports' && !c.occupied);
        if (car) {
          state.player.car = car;
          state.player.onFoot = false;
          car.occupied = true;
        }
      }
      if (state.player.car) {
        updatePlayer(dt, input, events);
      }
    }
    updateParticles(dt);
    return events;
  }

  reset();
  return {
    state,
    reset,
    step,
    showMessage,
    startMission: (index) => startMission(state, index),
    missionMarker: () => missionMarker(state),
    explodeCar: (car, events) => explodeCar(car, events),
  };
}
