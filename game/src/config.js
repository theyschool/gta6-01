// Solara Bay — tuning, palette and shared constants. One place for every number the city,
// the cars, the police, the missions and the renderer agree on, so a balance change is one edit.

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** The city is a square of this many world units; roads run on a grid through it. */
export const WORLD = { size: 3600, roadEvery: 450, roadHalf: 34, lane: 16 };

export const SAVE_KEY = 'solara-bay.save.v1';
export const BEST_KEY = 'solara-bay.best.v1';

/** The playfield the renderer fits to the window; the camera zooms the world into it. */
export const VIEW = { width: 1280, height: 720 };

export const PLAYER = {
  walk: 175,
  run: 265,
  radius: 13,
  health: 100,
  punchRange: 34,
  punchDamage: 34,
  punchCooldown: 0.42,
};

export const WEAPONS = {
  fists: { name: 'Fists', damage: 34, range: 40, rate: 0.42, ammo: Infinity, spread: 0 },
  pistol: { name: 'P9 Pistol', damage: 34, range: 460, rate: 0.24, ammo: 12, spread: 0.03 },
  shotgun: { name: 'Street Sweeper', damage: 26, range: 300, rate: 0.85, ammo: 6, spread: 0.16, pellets: 5 },
};

export const CAR_TYPES = {
  sedan: { name: 'Bison S', top: 400, accel: 380, turn: 2.6, radius: 17, health: 100, colors: ['#c0392b', '#2e5f8a', '#7d8a99', '#3d9970'] },
  hatch: { name: 'Pipit', top: 350, accel: 360, turn: 2.9, radius: 15, health: 90, colors: ['#e8a13c', '#8e6cc0', '#4fa3a5', '#c0c8d0'] },
  taxi: { name: 'Cabrio Taxi', top: 390, accel: 380, turn: 2.7, radius: 16, health: 100, colors: ['#f2c230'] },
  van: { name: 'Hauler', top: 330, accel: 320, turn: 2.3, radius: 19, health: 130, colors: ['#d8d3c8', '#5b7a6f', '#8a6f4d'] },
  truck: { name: 'Mammoth', top: 300, accel: 280, turn: 2.0, radius: 22, health: 170, colors: ['#b8542f', '#3f6d8e', '#6b6b6b'] },
  sports: { name: 'Comet GT', top: 560, accel: 520, turn: 3.1, radius: 16, health: 90, colors: ['#d7263d', '#f2f2f2', '#1c2b39', '#e8b10c'] },
  muscle: { name: 'Brawler', top: 480, accel: 460, turn: 2.5, radius: 17, health: 110, colors: ['#2f9e44', '#8c2f39', '#222831'] },
  pickup: { name: 'Rancher', top: 360, accel: 350, turn: 2.4, radius: 18, health: 120, colors: ['#7a5c2e', '#4a6b8a', '#9aa5a0'] },
  police: { name: 'Interceptor', top: 520, accel: 500, turn: 3.0, radius: 17, health: 130, colors: ['#101418'] },
};

/** Wanted heat 0..100; the stars shown are thresholds of it. */
export const WANTED = {
  starAt: [0, 10, 25, 45, 65, 85],
  stealCar: 15,
  stealPoliceCar: 25,
  punchPed: 8,
  killPed: 20,
  shoot: 6,
  decayPerSecond: 2.2,
  decayHiddenPerSecond: 4.5,
};

export const POLICE = {
  footPerStar: 2,
  carsPerStar: 1,
  maxCars: 6,
  copHealth: 60,
  copSpeed: 235,
  bustSeconds: 1.6,
  shootAtStars: 3,
  shootRange: 340,
  shootDamage: 7,
  shootInterval: 0.9,
  heliAtStars: 3,
  heliSpeed: 560,
  roadblockAtStars: 3,
  roadblockAhead: 430,
};

/** NOS boost: +40% top speed while held, about three seconds of juice per fill. */
export const NOS = {
  boostMult: 1.4,
  drainPerSecond: 1 / 3,
  rechargePerSecond: 0.06,
};

/** The radio: three tracks the DJ cycles through, thirty seconds each. */
export const RADIO = {
  station: 'WAVE 88.1',
  tracks: [
    { title: 'Neon Drive', artist: 'Pink Horizon' },
    { title: 'Midnight Marina', artist: 'Coastline' },
    { title: 'Sunset Strip', artist: 'Vega Ray' },
  ],
  trackSeconds: 30,
};

export const ECONOMY = {
  startCash: 150,
  packageValue: 100,
  fareMin: 25,
  fareMax: 60,
  wastedFee: 150,
  bustedFee: 200,
  hospitalHeal: 50,
};

export const PALETTE = {
  grass: '#9aa84f',
  grassDry: '#b3a05a',
  park: '#6f9a44',
  sand: '#e8c88f',
  water: '#2f7f9b',
  waterDeep: '#1f5f7d',
  sidewalk: '#c2b096',
  asphalt: '#453f3a',
  asphaltLine: '#e8d44d',
  curb: '#8f887a',
  buildingShadow: 'rgba(20, 16, 8, 0.35)',
  hudPanel: 'rgba(12, 16, 22, 0.85)',
  hudText: '#f2efe4',
  hudMuted: '#c9c2ae',
  hudGold: '#f2c230',
  hudDanger: '#e5534b',
  mission: '#f2c230',
  police: '#4aa3ff',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Districts, by region of the map. The renderer and the city generator share these names. */
export const DISTRICTS = {
  suburbs: { name: 'Palm Heights', buildings: ['#e8dcc8', '#d9c2a3', '#c8b49a', '#e0cbb0'] },
  downtown: { name: 'Downtown Solara', buildings: ['#7d8fa3', '#9aa7b8', '#6b7c8c', '#a3b0bd', '#5f7285'] },
  oldtown: { name: 'Old Town', buildings: ['#c98f5f', '#b57e52', '#d9a06b', '#a8764f'] },
  industrial: { name: 'The Yards', buildings: ['#8a7f74', '#7a6f66', '#96887c', '#6e6258'] },
  marina: { name: 'Marina Bay', buildings: ['#dfe8ea', '#c8d6da', '#e8e2d4', '#b8ccd2'] },
};
