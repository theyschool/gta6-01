// The story of Solara Bay: eight missions for Jax Marlowe, a getaway driver who owes the
// fixer Vera Solano one last favour. Each mission is a list of steps; a step is checked every
// frame against the world and reports done, failed, or still open. The runner also owns the
// mission marker the HUD and the minimap point at.

function dist(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}

export const MISSIONS = [
  {
    id: 'wheels',
    title: '1 — Wheels',
    giver: 'Vera Solano',
    briefing: 'Jax. You owe me, and I collect. First: get yourself a car. Any car. Then bring it to my garage.',
    reward: 200,
    steps: [
      { type: 'enterCar', text: 'Steal a car — walk up to one and press E' },
      { type: 'reach', at: 'garage', radius: 90, text: "Drive to Vera's Garage" },
    ],
  },
  {
    id: 'pickup',
    title: '2 — The Pickup',
    giver: 'Vera Solano',
    briefing: 'A package is waiting at the marina, under the fish stall. Bring it to me. Quietly.',
    reward: 350,
    unlock: 'pistol',
    steps: [
      { type: 'reach', at: 'marina', radius: 80, text: 'Go to the marina' },
      { type: 'collect', at: 'marina', radius: 70, hold: 1.2, text: 'Pick up the package — stand by the stall' },
      { type: 'reach', at: 'garage', radius: 90, text: "Bring the package to Vera's Garage" },
    ],
  },
  {
    id: 'hotwheels',
    title: '3 — Hot Wheels',
    giver: 'Vera Solano',
    briefing: 'The cops saw the pickup. Lose them — get your heat down to nothing — then get to the safehouse in Old Town.',
    reward: 400,
    steps: [
      { type: 'loseHeat', text: 'Lose the cops — stay out of sight until the heat dies down' },
      { type: 'reach', at: 'safehouse', radius: 90, text: 'Reach the Old Town safehouse' },
    ],
  },
  {
    id: 'taxirank',
    title: '4 — Taxi Rank',
    giver: 'Vera Solano',
    briefing: 'A driver I know needs a shift covered. Grab a yellow cab and earn $300 in fares. Tips count.',
    reward: 300,
    steps: [
      { type: 'earnFares', amount: 300, text: 'Earn $300 in taxi fares (get in a yellow cab)' },
    ],
  },
  {
    id: 'shakedown',
    title: '5 — The Shakedown',
    giver: 'Vera Solano',
    briefing: 'Three jokers in Old Town owe me money. Go and remind them. Fists or the new hardware — your call.',
    reward: 500,
    unlock: 'shotgun',
    steps: [
      { type: 'defeat', count: 3, at: 'oldtown', text: 'Deal with 3 debtors in Old Town (F to punch, click to shoot)' },
    ],
  },
  {
    id: 'getaway',
    title: '6 — The Getaway',
    giver: 'Vera Solano',
    briefing: 'A friend needs a fast ride to the docks, and the clock is the boss. One hundred seconds. Do not be late.',
    reward: 800,
    steps: [
      { type: 'reach', at: 'docks', radius: 100, time: 100, text: 'Reach the docks in 100 seconds — drive fast, drive clean' },
    ],
  },
  {
    id: 'heatwave',
    title: '7 — Heat Wave',
    giver: 'Vera Solano',
    briefing: 'The whole department is on us tonight. Survive sixty seconds at three stars. Then vanish.',
    reward: 900,
    steps: [
      { type: 'surviveHeat', stars: 3, seconds: 60, text: 'Survive 60 seconds at 3 stars of heat' },
    ],
  },
  {
    id: 'bigscore',
    title: '8 — The Big Score',
    giver: 'Vera Solano',
    briefing: 'The last one. A cash van is crossing town. Take the money, lose the heat, and bring it to the docks. Then we are square, Jax.',
    reward: 2500,
    steps: [
      { type: 'grabVan', text: 'Find the cash van and take the money (walk up to it and press E)' },
      { type: 'loseHeat', text: 'Lose the heat — get the stars to zero' },
      { type: 'reach', at: 'docks', radius: 100, text: 'Deliver the money to the docks' },
    ],
  },
];

/** Where a named place is, in world coordinates. */
export function placePosition(state, name) {
  const city = state.city;
  switch (name) {
    case 'garage': return { x: city.garage.x, y: city.garage.y };
    case 'marina': return { x: city.marina.x, y: city.marina.y };
    case 'hospital': return { x: city.hospital.x, y: city.hospital.y };
    case 'docks': return { x: city.docks.x, y: city.docks.y };
    case 'safehouse': return { x: 700, y: 1600 };
    case 'oldtown': return { x: 700, y: 1800 };
    default: return { x: city.start.x, y: city.start.y };
  }
}

export function createMissionRunner() {
  return {
    index: -1, // -1: no mission active; 0..7: mission in progress
    step: 0,
    timer: 0,
    hold: 0,
    defeated: 0,
    faresEarned: 0,
    vanTaken: false,
    done: [],
    failed: false,
    justFinished: null,
    justStarted: null,
  };
}

export function startMission(state, index) {
  const m = state.missions;
  m.index = index;
  m.step = 0;
  m.timer = 0;
  m.hold = 0;
  m.defeated = 0;
  m.faresEarned = 0;
  m.vanTaken = false;
  m.failed = false;
  m.justStarted = MISSIONS[index].title;
  const mission = MISSIONS[index];
  // Scripted setups: mission 3 starts hot, mission 7 starts at three stars.
  if (mission.id === 'hotwheels') state.wantedHeat = 30;
  if (mission.id === 'heatwave') state.wantedHeat = 50;
  if (mission.id === 'bigscore') spawnCashVan(state);
  if (mission.id === 'shakedown') spawnDebtors(state);
}

export function spawnCashVan(state) {
  const van = state.cars.find((c) => c.type === 'truck' && c.isCashVan);
  if (van) return;
  const x = state.city.size / 2;
  const y = 1350;
  // The same shape makeCar builds — NOS tank, boost flag and roadblock flag
  // included — so any code that reads a car can read the van the same way.
  const created = {
    id: 9000 + Math.floor(state.random() * 100),
    type: 'truck', name: 'Cash Van', top: 300, accel: 280, turn: 2.0, radius: 22,
    health: 200, maxHealth: 200, color: '#2f6d4f', x, y, angle: 0, speed: 0,
    isPolice: false, isTaxi: false, occupied: true, driver: null,
    axis: 'h', dir: 1, cruise: 170, stuck: 0, reverse: 0, smoke: 0, fare: null, isCashVan: true,
    nos: 1, nosActive: false, roadblock: false,
  };
  state.cars.push(created);
  state.cashVan = created;
}

export function spawnDebtors(state) {
  for (let i = 0; i < 3; i += 1) {
    state.peds.push({
      id: 8000 + i,
      x: 600 + i * 220, y: 1750 + (i % 2) * 140,
      angle: 0, speed: 0, health: 60, maxHealth: 60,
      color: ['#c0392b', '#8e44ad', '#d35400'][i],
      state: 'debtor', down: 0, flee: 0, walkPhase: state.random() * 6,
      targetX: 0, targetY: 0, wait: 0,
    });
  }
}

function currentStep(state) {
  const m = state.missions;
  if (m.index < 0) return null;
  return MISSIONS[m.index].steps[m.step] || null;
}

/** The world point the HUD arrow and minimap should point at, or null. */
export function missionMarker(state) {
  const step = currentStep(state);
  if (!step) return null;
  if (step.at) return { ...placePosition(state, step.at), label: step.text };
  if (step.type === 'grabVan' && state.cashVan) return { x: state.cashVan.x, y: state.cashVan.y, label: step.text };
  if (step.type === 'defeat') {
    const debtor = state.peds.find((p) => p.state === 'debtor' && p.health > 0);
    if (debtor) return { x: debtor.x, y: debtor.y, label: step.text };
  }
  if (step.type === 'earnFares' && state.player.car && state.player.car.isTaxi) {
    if (state.taxi.destination) return { x: state.taxi.destination.x, y: state.taxi.destination.y, label: step.text };
  }
  return null;
}

export function missionText(state) {
  const m = state.missions;
  if (m.index < 0) {
    if (m.done.length >= MISSIONS.length) return 'Story complete — Solara Bay is yours. Free roam!';
    return `Next: ${MISSIONS[m.done.length].title} — press N to start it, or walk to Vera's Garage`;
  }
  const step = currentStep(state);
  const mission = MISSIONS[m.index];
  let text = `${mission.title}: ${step ? step.text : ''}`;
  if (step && step.type === 'reach' && step.time) text += ` — ${Math.max(0, Math.ceil(step.time - m.timer))}s left`;
  if (step && step.type === 'earnFares') text += ` — $${Math.min(step.amount, m.faresEarned)}/$${step.amount}`;
  if (step && step.type === 'defeat') text += ` — ${m.defeated}/${step.count}`;
  if (step && step.type === 'surviveHeat') text += ` — ${Math.max(0, Math.ceil(step.seconds - m.timer))}s left`;
  return text;
}

/**
 * Advance the active mission one step. Returns 'step' | 'done' | 'fail' | null.
 * `events` collects what the world should react to (sounds, banners).
 */
export function updateMission(state, dt, events) {
  const m = state.missions;
  if (m.index < 0) return null;
  const mission = MISSIONS[m.index];
  const step = mission.steps[m.step];
  if (!step) return null;
  const p = state.player;
  const px = p.car ? p.car.x : p.x;
  const py = p.car ? p.car.y : p.y;

  function advance() {
    m.step += 1;
    m.timer = 0;
    m.hold = 0;
    events.push('step');
    if (m.step >= mission.steps.length) {
      m.done.push(mission.id);
      state.cash += mission.reward;
      state.stats.earned += mission.reward;
      if (mission.unlock) state.unlocked[mission.unlock] = true;
      m.justFinished = mission;
      m.index = -1;
      m.step = 0;
      return 'done';
    }
    return 'step';
  }

  function fail() {
    m.failed = true;
    m.index = -1;
    m.step = 0;
    return 'fail';
  }

  switch (step.type) {
    case 'enterCar':
      if (p.car) return advance();
      break;
    case 'reach': {
      m.timer += dt;
      if (step.time && m.timer > step.time) return fail();
      const at = placePosition(state, step.at);
      if (dist(px, py, at.x, at.y) < step.radius) return advance();
      break;
    }
    case 'collect': {
      const at = placePosition(state, step.at);
      if (dist(px, py, at.x, at.y) < step.radius) {
        m.hold += dt;
        if (m.hold >= (step.hold || 1)) return advance();
      } else m.hold = 0;
      break;
    }
    case 'loseHeat':
      if (state.wanted < 1) return advance();
      break;
    case 'earnFares':
      if (m.faresEarned >= step.amount) return advance();
      break;
    case 'defeat':
      if (m.defeated >= step.count) return advance();
      break;
    case 'surviveHeat': {
      if (state.wanted >= step.stars) {
        m.timer += dt;
        if (m.timer >= step.seconds) return advance();
      } else {
        m.timer = Math.max(0, m.timer - dt * 0.5);
      }
      break;
    }
    case 'grabVan':
      if (m.vanTaken) return advance();
      break;
    default:
      break;
  }
  return null;
}

/** Cash the player can still earn, for the pause menu. */
export function remainingReward(state) {
  return MISSIONS.filter((mis) => !state.missions.done.includes(mis.id))
    .reduce((sum, mis) => sum + mis.reward, 0);
}
