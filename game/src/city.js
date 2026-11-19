// The city of Solara Bay: a seeded road grid, districts, blocks, buildings, parks, the beach
// and the sea, plus the landmarks the story hangs on. Generation is pure data — no drawing
// here — so the world, the renderer and the minimap all read the same city.

import { DISTRICTS, WORLD } from './config.js';
import { pick } from './random.js';

const ROAD = WORLD.roadEvery;
const HALF = WORLD.roadHalf;
const SIZE = WORLD.size;

/** Which district a point is in, by region of the map. */
export function districtAt(x, y) {
  if (y >= SIZE - 500) return 'marina';
  if (x >= SIZE - 1000) return 'industrial';
  if (x < 1150 && y > 900) return 'oldtown';
  if (y < 950) return 'suburbs';
  return 'downtown';
}

function roadLines() {
  const lines = [];
  for (let v = 0; v <= SIZE; v += ROAD) lines.push(v);
  return lines;
}

/** Distance from a point to the nearest road centre line, and which axis it is on. */
export function nearestRoad(x, y) {
  const rx = Math.round(x / ROAD) * ROAD;
  const ry = Math.round(y / ROAD) * ROAD;
  const dx = Math.abs(x - rx);
  const dy = Math.abs(y - ry);
  if (dx <= dy) return { axis: 'v', at: rx, dist: dx };
  return { axis: 'h', at: ry, dist: dy };
}

export function onRoad(x, y) {
  return nearestRoad(x, y).dist <= HALF;
}

export function inWater(city, x, y) {
  return y >= city.waterY;
}

export function createCity(random) {
  const lines = roadLines();
  const buildings = [];
  const parks = [];
  const trees = [];
  const lamps = [];
  const parkedSpots = [];
  const packages = [];

  // Landmark blocks, by block column/row: garage, hospital, police HQ, the tower, the docks.
  const landmarks = {
    '3,4': { name: "Vera's Garage", kind: 'garage', color: '#c98f5f', height: 16 },
    '5,3': { name: 'General Hospital', kind: 'hospital', color: '#e8e4da', height: 26 },
    '4,2': { name: 'Police HQ', kind: 'police', color: '#3f5a78', height: 30 },
    '4,3': { name: 'Solara Tower', kind: 'tower', color: '#5f7285', height: 92 },
    '6,6': { name: 'The Docks', kind: 'docks', color: '#7a6f66', height: 18 },
  };

  for (let bx = 0; bx < 8; bx += 1) {
    for (let by = 0; by < 8; by += 1) {
      const x0 = bx * ROAD + HALF + 14;
      const y0 = by * ROAD + HALF + 14;
      const x1 = (bx + 1) * ROAD - HALF - 14;
      const y1 = (by + 1) * ROAD - HALF - 14;
      if (y0 >= SIZE - 500) continue; // the beach strip: no blocks, sand and sea instead
      const key = `${bx},${by}`;
      const landmark = landmarks[key];
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;
      const district = districtAt(cx, cy);
      if (!landmark && random() < 0.11) {
        parks.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
        const n = 5 + Math.floor(random() * 6);
        for (let i = 0; i < n; i += 1) {
          trees.push({ x: x0 + 20 + random() * (x1 - x0 - 40), y: y0 + 20 + random() * (y1 - y0 - 40), r: 12 + random() * 8 });
        }
        continue;
      }
      const palette = DISTRICTS[district].buildings;
      if (landmark) {
        const w = Math.min(200, x1 - x0 - 40);
        const h = Math.min(170, y1 - y0 - 40);
        buildings.push({
          x: cx - w / 2, y: cy - h / 2, w, h,
          height: landmark.height, color: landmark.color,
          roof: '#3d434c', name: landmark.name, kind: landmark.kind, district,
        });
      } else {
        const lots = district === 'downtown' ? 2 + Math.floor(random() * 2) : 1 + Math.floor(random() * 3);
        const cols = Math.ceil(Math.sqrt(lots));
        const rows = Math.ceil(lots / cols);
        for (let lot = 0; lot < lots; lot += 1) {
          const lx = x0 + ((lot % cols) / cols) * (x1 - x0);
          const ly = y0 + (Math.floor(lot / cols) / rows) * (y1 - y0);
          const lw = (x1 - x0) / cols - 22;
          const lh = (y1 - y0) / rows - 22;
          if (lw < 46 || lh < 46) continue;
          const w = 46 + random() * (lw - 46);
          const h = 46 + random() * (lh - 46);
          const tall = district === 'downtown' ? 26 + random() * 55 : 10 + random() * 18;
          buildings.push({
            x: lx + 8 + random() * Math.max(0, lw - w - 16),
            y: ly + 8 + random() * Math.max(0, lh - h - 16),
            w, h, height: tall,
            color: pick(random, palette),
            roof: district === 'downtown' ? '#4a5058' : '#8a6f52',
            name: null, kind: 'block', district,
          });
        }
      }
      // A few trees along the block's sidewalk.
      const treeCount = 1 + Math.floor(random() * 3);
      for (let i = 0; i < treeCount; i += 1) {
        const side = random();
        trees.push({
          x: side < 0.5 ? x0 - 24 + random() * 10 : x1 + 14 + random() * 10,
          y: y0 + random() * (y1 - y0),
          r: 10 + random() * 7,
        });
      }
    }
  }

  // Lamps at every intersection.
  for (const lx of lines) {
    for (const ly of lines) {
      if (ly >= SIZE - 500) continue;
      lamps.push({ x: lx + HALF + 6, y: ly + HALF + 6 });
    }
  }

  // Parked cars along the roads, and the hidden packages the player can collect.
  for (let i = 0; i < 46; i += 1) {
    const horizontal = random() < 0.5;
    const line = lines[1 + Math.floor(random() * (lines.length - 2))];
    const along = 120 + random() * (SIZE - 240);
    const side = random() < 0.5 ? -1 : 1;
    parkedSpots.push({
      x: horizontal ? along : line + side * (HALF + 10),
      y: horizontal ? line + side * (HALF + 10) : along,
      angle: horizontal ? 0 : Math.PI / 2,
    });
  }
  const packageSpots = [];
  for (let i = 0; i < 15; i += 1) {
    const bx = Math.floor(random() * 8);
    const by = Math.floor(random() * 7);
    packageSpots.push({
      x: bx * ROAD + HALF + 60 + random() * (ROAD - 2 * HALF - 120),
      y: by * ROAD + HALF + 60 + random() * (ROAD - 2 * HALF - 120),
    });
  }
  for (const p of packageSpots) packages.push({ x: p.x, y: p.y, taken: false });

  const garage = buildings.find((b) => b.kind === 'garage');
  const hospital = buildings.find((b) => b.kind === 'hospital');
  const docks = buildings.find((b) => b.kind === 'docks');
  const marina = { x: SIZE - 700, y: SIZE - 620 };

  return {
    size: SIZE,
    lines,
    buildings,
    parks,
    trees,
    lamps,
    parkedSpots,
    packages,
    waterY: SIZE - 240,
    sandY: SIZE - 500,
    garage: garage ? { x: garage.x + garage.w / 2, y: garage.y + garage.h + 110 } : { x: 1575, y: 2025 },
    hospital: hospital ? { x: hospital.x + hospital.w / 2, y: hospital.y + hospital.h + 60 } : { x: 2250, y: 1575 },
    docks: docks ? { x: docks.x + docks.w / 2, y: docks.y + docks.h + 60 } : { x: 2925, y: 3375 },
    marina,
    start: garage ? { x: garage.x + garage.w / 2, y: garage.y + garage.h + 110 } : { x: 1575, y: 2025 },
  };
}

/** The building whose footprint contains the circle (x, y, r), or null. */
export function hitBuilding(city, x, y, r) {
  for (let i = 0; i < city.buildings.length; i += 1) {
    const b = city.buildings[i];
    if (x + r > b.x && x - r < b.x + b.w && y + r > b.y && y - r < b.y + b.h) return b;
  }
  return null;
}

/** Push a circle out of every building it overlaps; returns true if it touched one. */
export function resolveBuildings(city, body, r) {
  let hit = false;
  for (let i = 0; i < city.buildings.length; i += 1) {
    const b = city.buildings[i];
    const cx = Math.max(b.x, Math.min(body.x, b.x + b.w));
    const cy = Math.max(b.y, Math.min(body.y, b.y + b.h));
    const dx = body.x - cx;
    const dy = body.y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 >= r * r) continue;
    hit = true;
    if (d2 > 0.0001) {
      const d = Math.sqrt(d2);
      body.x = cx + (dx / d) * r;
      body.y = cy + (dy / d) * r;
    } else {
      // Centre inside the building: push out along the shortest side.
      const left = body.x - b.x;
      const right = b.x + b.w - body.x;
      const top = body.y - b.y;
      const bottom = b.y + b.h - body.y;
      const m = Math.min(left, right, top, bottom);
      if (m === left) body.x = b.x - r;
      else if (m === right) body.x = b.x + b.w + r;
      else if (m === top) body.y = b.y - r;
      else body.y = b.y + b.h + r;
    }
  }
  return hit;
}
