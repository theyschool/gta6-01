// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s steps
// (several in a slow frame, none in a fast one), and the renderer paints what is there. The game
// moves between title, play, paused, wasted, busted and the ending. Behind the title screen the
// city lives on in attract mode — a sports car cruising Solara Bay on autopilot.
//
// ?seed=N fixes the city's random layout. ?shot=chase|drive|foot|mission (with &seed=N) stages
// that scene instead of running the loop, paints it twice and sets window.__shotReady.

import { ECONOMY, PLAYER, STEP, VIEW } from './config.js';
import { createRandom } from './random.js';
import { createWorld } from './world.js';
import { ACTION_CONFIRM, ACTION_MUTE, ACTION_PAUSE, createInput } from './input.js';
import { createRenderer, SCREEN_BUSTED, SCREEN_END, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WASTED } from './render.js';
import { autopilotInput, stageShot } from './shots.js';
import { createAudio } from './audio.js';
import { applySave, loadSave, readBest, saveBest, saveGame } from './save.js';
import { MISSIONS } from './missions.js';

const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();
const saved = loadSave();

const ui = {
  banner: null,
  bannerUntil: 0,
  menuIndex: 0,
  showHelp: false,
  saveExists: !!saved,
};

function runShot(name) {
  // Paint synchronously, twice, so a headless screenshot always catches the finished frame
  // even where requestAnimationFrame never fires before the capture.
  const scene = stageShot(name, world);
  renderer.draw(world.state, scene.screen, ui);
  renderer.draw(world.state, scene.screen, ui);
  window.__shotReady = true;
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();
  let menuKey = 0;
  const state = world.state;
  state.attract = true;
  // A read-only handle for playtests and the finalist review: the live game state.
  window.__solara = { state, get screen() { return screen; } };

  window.addEventListener('keydown', () => audio.enable());
  canvas.addEventListener('pointerdown', () => audio.enable());

  function announce(message) {
    status.textContent = message;
  }

  function menuItems() {
    const items = [];
    if (ui.saveExists) items.push('continue');
    items.push('new');
    items.push('help');
    return items;
  }

  function startGame(fromSave) {
    world.reset();
    state.attract = false;
    if (fromSave && saved) {
      applySave(state, saved);
      if (state.missions.done.length < MISSIONS.length) {
        world.startMission(state.missions.done.length);
      }
      announce('Welcome back to Solara Bay.');
    } else {
      announce('Solara Bay. Steal a car and drive to Vera\'s Garage.');
    }
    screen = SCREEN_PLAY;
    audio.enable();
  }

  function respawn(place, fee, message) {
    state.cash = Math.max(0, state.cash - fee);
    state.health = PLAYER.health;
    state.wantedHeat = 0;
    state.wanted = 0;
    state.crimeTimer = 0;
    state.cops = [];
    for (const car of state.policeCars) {
      const i = state.cars.indexOf(car);
      if (i >= 0) state.cars.splice(i, 1);
    }
    state.policeCars = [];
    if (state.player.car) {
      state.player.car.occupied = false;
      state.player.car = null;
    }
    state.player.onFoot = true;
    state.player.x = place.x;
    state.player.y = place.y;
    state.missions.index = -1;
    state.missions.step = 0;
    saveGame(state);
    announce(message);
  }

  function handleEvents(events) {
    for (const event of events) {
      if (event === 'shot') audio.shot();
      else if (event === 'punch' || event === 'crash' || event === 'ram') audio.punch();
      else if (event === 'explosion') audio.explosion();
      else if (event === 'cash') audio.cash();
      else if (event === 'pickup') audio.pickup();
      else if (event === 'missionDone') {
        audio.mission();
        ui.banner = 'MISSION COMPLETE';
        ui.bannerUntil = state.time + 3.5;
        saveGame(state);
        if (state.missions.done.length >= MISSIONS.length) {
          screen = SCREEN_END;
          saveBest(state.stats.earned);
        }
      } else if (event === 'missionFail') {
        audio.fail();
      } else if (event === 'wasted') {
        audio.fail();
        respawn(state.city.hospital, ECONOMY.wastedFee, 'Wasted. The hospital patched you up.');
        screen = SCREEN_WASTED;
      } else if (event === 'busted') {
        audio.fail();
        respawn({ x: 1800, y: 900 }, ECONOMY.bustedFee, 'Busted. The cops took their cut.');
        screen = SCREEN_BUSTED;
      }
    }
    const sirens = state.policeCars.length > 0 || state.cops.length > 0;
    audio.siren(sirens);
    audio.engine(state.player.car ? Math.abs(state.player.car.speed) / state.player.car.top : 0);
  }

  function step(frameInput) {
    const rect = canvas.getBoundingClientRect();
    const sx = (frameInput.aimScreenX - rect.left) * (VIEW.width / rect.width);
    const sy = (frameInput.aimScreenY - rect.top) * (VIEW.height / rect.height);
    frameInput.aimX = renderer.camera.x + (sx - VIEW.width / 2);
    frameInput.aimY = renderer.camera.y + (sy - VIEW.height / 2);
    if (screen === SCREEN_TITLE) {
      const events = world.step(STEP, autopilotInput(state));
      handleEvents(events);
      return;
    }
    if (screen !== SCREEN_PLAY) return;
    const events = world.step(STEP, frameInput);
    handleEvents(events);
    if (frameInput.startMission && state.missions.index < 0 && state.missions.done.length < MISSIONS.length) {
      world.startMission(state.missions.done.length);
      state.missions.justStarted = MISSIONS[state.missions.done.length].title;
      announce(`Mission started: ${MISSIONS[state.missions.done.length].title}`);
    }
  }

  function handleActions(frameInput) {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      const muted = audio.toggleMute();
      announce(muted ? 'Sound off.' : 'Sound on.');
    }
    if (screen === SCREEN_TITLE) {
      // Arrow keys move the menu, one step per press.
      if (frameInput.my !== 0 && menuKey === 0) {
        ui.menuIndex = (ui.menuIndex + frameInput.my + menuItems().length) % menuItems().length;
      }
      menuKey = frameInput.my;
      if (actions & ACTION_CONFIRM) {
        if (ui.showHelp) {
          ui.showHelp = false;
          return;
        }
        const items = menuItems();
        const choice = items[ui.menuIndex];
        if (choice === 'help') ui.showHelp = true;
        else startGame(choice === 'continue');
      }
      return;
    }
    if (screen === SCREEN_PLAY) {
      if (actions & ACTION_PAUSE) {
        screen = SCREEN_PAUSED;
        saveGame(state);
        announce('Paused.');
      }
      return;
    }
    if (screen === SCREEN_PAUSED) {
      if (actions & ACTION_PAUSE || actions & ACTION_CONFIRM) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
      return;
    }
    if (screen === SCREEN_WASTED || screen === SCREEN_BUSTED || screen === SCREEN_END) {
      if (actions & ACTION_CONFIRM) {
        screen = SCREEN_PLAY;
        announce('Back on the streets of Solara Bay.');
      }
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    const frameInput = input.frame();
    handleActions(frameInput);
    while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
      step(frameInput);
      accumulator -= STEP;
    }
    if (screen !== SCREEN_TITLE && screen !== SCREEN_PLAY) accumulator = 0;
    renderer.draw(state, screen, ui);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      saveGame(state);
      announce('Paused.');
    }
  });

  announce('Solara Bay. Press Enter to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
