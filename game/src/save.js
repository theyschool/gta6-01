// Saving: the story progress, the cash and the hidden packages live in localStorage, so a
// visit can pick up where the last one left off. A save that fails to parse is ignored.

import { BEST_KEY, SAVE_KEY } from './config.js';

export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return null;
    return data;
  } catch {
    return null;
  }
}

export function saveGame(state) {
  try {
    const data = {
      cash: state.cash,
      missionsDone: state.missions.done,
      packages: state.city.packages.filter((p) => p.taken).length,
      packageTaken: state.city.packages.map((p) => (p.taken ? 1 : 0)),
      unlocked: state.unlocked,
      playerX: state.player.x,
      playerY: state.player.y,
      stats: state.stats,
      savedAt: Date.now(),
    };
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function applySave(state, data) {
  if (!data) return;
  if (typeof data.cash === 'number') state.cash = data.cash;
  if (Array.isArray(data.missionsDone)) state.missions.done = data.missionsDone;
  if (Array.isArray(data.packageTaken)) {
    for (let i = 0; i < data.packageTaken.length && i < state.city.packages.length; i += 1) {
      state.city.packages[i].taken = data.packageTaken[i] === 1;
    }
  }
  if (data.unlocked) state.unlocked = { ...state.unlocked, ...data.unlocked };
  if (typeof data.playerX === 'number' && typeof data.playerY === 'number') {
    state.player.x = data.playerX;
    state.player.y = data.playerY;
  }
  if (data.stats) state.stats = { ...state.stats, ...data.stats };
}

export function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch { /* storage can be off */ }
}

export function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

export function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch { /* storage can be off */ }
}
