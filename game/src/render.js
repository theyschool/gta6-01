// The renderer: one canvas, one camera, everything the player sees. The city is drawn from the
// same data the world simulates — roads, buildings with height, parks, the beach — then the
// cars, the people, the effects, and the HUD with its minimap. Menus are drawn on the canvas
// too, so a screenshot always shows the game, not a web page.

import { FONT, PALETTE, RADIO, VIEW, WEAPONS, WORLD } from './config.js';
import { missionMarker, missionText, MISSIONS } from './missions.js';
import { unitCallsign } from './police.js';

export const SCREEN_TITLE = 0;
export const SCREEN_PLAY = 1;
export const SCREEN_PAUSED = 2;
export const SCREEN_WASTED = 3;
export const SCREEN_BUSTED = 4;
export const SCREEN_END = 5;

const MINIMAP = 188;

function starPath(ctx, x, y, r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 === 0 ? r : r * 0.45;
    const px = x + Math.cos(a) * rad;
    const py = y + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const camera = { x: 0, y: 0, zoom: 1 };
  let dpr = 1;

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.floor(VIEW.width * dpr);
    canvas.height = Math.floor(VIEW.height * dpr);
    canvas.style.width = '100%';
    canvas.style.height = '100%';
  }
  resize();
  window.addEventListener('resize', resize);

  function text(str, x, y, size, color, align, weight) {
    ctx.font = `${weight || 600} ${size}px ${FONT}`;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
  }

  function panel(x, y, w, h) {
    ctx.fillStyle = PALETTE.hudPanel;
    roundRect(ctx, x, y, w, h, 8);
    ctx.fill();
  }

  function drawGround(state) {
    const city = state.city;
    const vx0 = camera.x - VIEW.width / 2 / camera.zoom;
    const vy0 = camera.y - VIEW.height / 2 / camera.zoom;
    const vx1 = camera.x + VIEW.width / 2 / camera.zoom;
    const vy1 = camera.y + VIEW.height / 2 / camera.zoom;
    // Base grass, then the beach and the sea along the south edge.
    ctx.fillStyle = PALETTE.grass;
    ctx.fillRect(vx0, vy0, vx1 - vx0, vy1 - vy0);
    ctx.fillStyle = PALETTE.sand;
    ctx.fillRect(Math.max(vx0, 0), Math.max(vy0, city.sandY), Math.min(vx1, city.size) - Math.max(vx0, 0), Math.max(0, Math.min(vy1, city.waterY) - Math.max(vy0, city.sandY)));
    ctx.fillStyle = PALETTE.water;
    ctx.fillRect(Math.max(vx0, 0), Math.max(vy0, city.waterY), Math.min(vx1, city.size) - Math.max(vx0, 0), Math.max(0, vy1 - Math.max(vy0, city.waterY)));
    // Sunset on the water: a warm band where the sea meets the sand, with shimmer lines.
    if (vy1 > city.waterY && vy0 < city.waterY + 160) {
      const sun = ctx.createLinearGradient(0, city.waterY, 0, city.waterY + 150);
      sun.addColorStop(0, 'rgba(255, 170, 90, 0.34)');
      sun.addColorStop(1, 'rgba(255, 170, 90, 0)');
      ctx.fillStyle = sun;
      ctx.fillRect(Math.max(vx0, 0), city.waterY, Math.min(vx1, city.size) - Math.max(vx0, 0), 150);
      ctx.fillStyle = 'rgba(255, 205, 130, 0.28)';
      for (let i = 0; i < 4; i += 1) {
        const sy = city.waterY + 18 + i * 30;
        const off = ((i * 271) % 340) - 170;
        for (let x = Math.floor((vx0 + off) / 180) * 180; x < vx1; x += 180) ctx.fillRect(x, sy, 90 - i * 12, 3);
      }
    }
    // Parks.
    ctx.fillStyle = PALETTE.park;
    for (const park of city.parks) {
      if (park.x > vx1 || park.x + park.w < vx0 || park.y > vy1 || park.y + park.h < vy0) continue;
      ctx.fillRect(park.x, park.y, park.w, park.h);
    }
    // Sidewalks and roads.
    for (const line of city.lines) {
      if (line >= city.waterY) continue;
      if (line > vy0 - 60 && line < vy1 + 60) {
        ctx.fillStyle = PALETTE.sidewalk;
        ctx.fillRect(vx0, line - WORLD.roadHalf - 14, vx1 - vx0, 2 * (WORLD.roadHalf + 14));
        ctx.fillStyle = PALETTE.asphalt;
        ctx.fillRect(vx0, line - WORLD.roadHalf, vx1 - vx0, 2 * WORLD.roadHalf);
        ctx.fillStyle = PALETTE.asphaltLine;
        for (let x = Math.floor(vx0 / 46) * 46; x < vx1; x += 46) ctx.fillRect(x, line - 2, 24, 4);
      }
      if (line > vx0 - 60 && line < vx1 + 60) {
        ctx.fillStyle = PALETTE.sidewalk;
        ctx.fillRect(line - WORLD.roadHalf - 14, vy0, 2 * (WORLD.roadHalf + 14), vy1 - vy0);
        ctx.fillStyle = PALETTE.asphalt;
        ctx.fillRect(line - WORLD.roadHalf, vy0, 2 * WORLD.roadHalf, vy1 - vy0);
        ctx.fillStyle = PALETTE.asphaltLine;
        for (let y = Math.floor(vy0 / 46) * 46; y < vy1; y += 46) ctx.fillRect(line - 2, y, 4, 24);
      }
    }
    // Crosswalks at intersections.
    ctx.fillStyle = 'rgba(240, 238, 228, 0.85)';
    for (const lx of city.lines) {
      for (const ly of city.lines) {
        if (ly >= city.waterY || lx < vx0 - 60 || lx > vx1 + 60 || ly < vy0 - 60 || ly > vy1 + 60) continue;
        for (let i = -3; i <= 3; i += 1) {
          ctx.fillRect(lx + i * 9 - 3, ly - WORLD.roadHalf - 2, 5, 10);
          ctx.fillRect(lx + i * 9 - 3, ly + WORLD.roadHalf - 8, 5, 10);
        }
      }
    }
  }

  function drawBuildings(state) {
    const city = state.city;
    const vx0 = camera.x - VIEW.width / 2 / camera.zoom - 120;
    const vy0 = camera.y - VIEW.height / 2 / camera.zoom - 120;
    const vx1 = camera.x + VIEW.width / 2 / camera.zoom + 120;
    const vy1 = camera.y + VIEW.height / 2 / camera.zoom + 120;
    for (const b of city.buildings) {
      if (b.x > vx1 || b.x + b.w < vx0 || b.y > vy1 || b.y + b.h < vy0) continue;
      const ox = b.height * 0.55;
      const oy = b.height * 0.55;
      // Drop shadow, then the sunlit south and east walls, then the roof.
      ctx.fillStyle = PALETTE.buildingShadow;
      ctx.fillRect(b.x + 8, b.y + 12, b.w, b.h);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
      ctx.beginPath();
      ctx.moveTo(b.x, b.y + b.h);
      ctx.lineTo(b.x + b.w, b.y + b.h);
      ctx.lineTo(b.x + b.w + ox, b.y + b.h + oy);
      ctx.lineTo(b.x + ox, b.y + b.h + oy);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(b.x + b.w, b.y);
      ctx.lineTo(b.x + b.w + ox, b.y + oy);
      ctx.lineTo(b.x + b.w + ox, b.y + b.h + oy);
      ctx.lineTo(b.x + b.w, b.y + b.h);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.22)';
      ctx.lineWidth = 2;
      ctx.strokeRect(b.x + 2, b.y + 2, b.w - 4, b.h - 4);
      // Roof furniture: a couple of units and a skylight, so roofs read as places.
      ctx.fillStyle = b.roof;
      ctx.fillRect(b.x + 8, b.y + 8, Math.min(18, b.w / 4), Math.min(14, b.h / 4));
      ctx.fillRect(b.x + b.w - 26, b.y + b.h - 22, Math.min(18, b.w / 4), Math.min(14, b.h / 4));
      // Golden hour: a few windows glow amber. Positions come from the building's own
      // coordinates, so the same city always lights the same windows.
      const lit = 2 + ((b.x * 7 + b.y * 13) % 3);
      ctx.fillStyle = '#ffb347';
      for (let i = 0; i < lit; i += 1) {
        const wx = b.x + 10 + ((b.x * 31 + i * 47) % Math.max(20, b.w - 24));
        const wy = b.y + 10 + ((b.y * 17 + i * 61) % Math.max(20, b.h - 24));
        ctx.fillRect(wx, wy, 9, 7);
      }
      if (b.kind === 'tower') {
        ctx.fillStyle = '#f2c230';
        ctx.fillRect(b.x + b.w / 2 - 14, b.y + b.h / 2 - 14, 28, 28);
        text('H', b.x + b.w / 2, b.y + b.h / 2 + 6, 18, '#1c2b39', 'center', 800);
      }
      if (b.name) {
        ctx.font = '700 13px system-ui, sans-serif';
        const tw = ctx.measureText(b.name).width + 16;
        ctx.fillStyle = 'rgba(12, 16, 22, 0.55)';
        roundRect(ctx, b.x + b.w / 2 - tw / 2, b.y - 26, tw, 20, 5);
        ctx.fill();
        text(b.name, b.x + b.w / 2, b.y - 12, 13, '#f2efe4', 'center', 700);
      }
    }
    // Trees and lamps.
    for (const t of city.trees) {
      if (t.x < vx0 || t.x > vx1 || t.y < vy0 || t.y > vy1) continue;
      ctx.fillStyle = 'rgba(20, 16, 8, 0.25)';
      ctx.beginPath();
      ctx.ellipse(t.x + 5, t.y + 6, t.r, t.r * 0.8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#4d7a3a';
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#6aa84f';
      ctx.beginPath();
      ctx.arc(t.x - t.r * 0.25, t.y - t.r * 0.25, t.r * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#2c2f36';
    for (const lamp of city.lamps) {
      if (lamp.x < vx0 || lamp.x > vx1 || lamp.y < vy0 || lamp.y > vy1) continue;
      ctx.fillRect(lamp.x - 2, lamp.y - 2, 4, 4);
    }
  }

  function drawCar(car, time, isPlayer) {
    const len = car.radius * 2.3;
    const wid = car.radius * 1.5;
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    if (isPlayer) {
      ctx.strokeStyle = '#f2c230';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(0, 0, len / 2 + 8, wid / 2 + 8, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(20, 16, 8, 0.3)';
    ctx.beginPath();
    ctx.ellipse(3, 5, len / 2, wid / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    // Headlight beam: a warm cone ahead of the car, golden hour's own light.
    const beam = ctx.createLinearGradient(len / 2, 0, len / 2 + 150, 0);
    beam.addColorStop(0, 'rgba(255, 230, 160, 0.22)');
    beam.addColorStop(1, 'rgba(255, 230, 160, 0)');
    ctx.fillStyle = beam;
    ctx.beginPath();
    ctx.moveTo(len / 2, -8);
    ctx.lineTo(len / 2 + 150, -28);
    ctx.lineTo(len / 2 + 150, 28);
    ctx.lineTo(len / 2, 8);
    ctx.closePath();
    ctx.fill();
    // Wheels.
    ctx.fillStyle = '#16181c';
    const wx = len * 0.32;
    const wy = wid / 2 - 1;
    ctx.fillRect(-wx - 6, -wy - 3, 12, 6);
    ctx.fillRect(wx - 6, -wy - 3, 12, 6);
    ctx.fillRect(-wx - 6, wy - 3, 12, 6);
    ctx.fillRect(wx - 6, wy - 3, 12, 6);
    // Body.
    ctx.fillStyle = car.color;
    roundRect(ctx, -len / 2, -wid / 2, len, wid, 6);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1.5;
    roundRect(ctx, -len / 2, -wid / 2, len, wid, 6);
    ctx.stroke();
    // Windshield, roof, rear window.
    ctx.fillStyle = 'rgba(20, 40, 60, 0.85)';
    ctx.fillRect(len * 0.12, -wid / 2 + 3, len * 0.2, wid - 6);
    ctx.fillStyle = car.color === '#101418' ? '#e8e8e8' : 'rgba(255,255,255,0.16)';
    ctx.fillRect(-len * 0.12, -wid / 2 + 3, len * 0.24, wid - 6);
    ctx.fillStyle = 'rgba(20, 40, 60, 0.85)';
    ctx.fillRect(-len * 0.36, -wid / 2 + 3, len * 0.14, wid - 6);
    if (car.isPolice) {
      ctx.fillStyle = '#e8e8e8';
      ctx.fillRect(-len * 0.05, -wid / 2 + 2, len * 0.1, wid - 4);
      const flash = Math.floor(time * 6) % 2 === 0;
      ctx.fillStyle = flash ? '#ff2f2f' : '#2f7bff';
      ctx.fillRect(-len * 0.02, -wid / 2 - 2, len * 0.12, 5);
      ctx.fillStyle = flash ? '#2f7bff' : '#ff2f2f';
      ctx.fillRect(-len * 0.02, wid / 2 - 3, len * 0.12, 5);
    }
    if (car.isTaxi) {
      ctx.fillStyle = '#1c1c1c';
      for (let i = 0; i < 5; i += 1) ctx.fillRect(-len * 0.2 + i * 6, -wid / 2 + 2, 3, 4);
      ctx.fillStyle = '#f2c230';
      ctx.fillRect(len * 0.32, -wid / 2 + 2, 8, wid - 4);
    }
    if (car.isCashVan) {
      text('$', 0, 5, 15, '#f2efe4', 'center', 800);
    }
    // Headlights.
    ctx.fillStyle = '#ffe9a8';
    ctx.fillRect(len / 2 - 2, -wid / 2 + 4, 3, 5);
    ctx.fillRect(len / 2 - 2, wid / 2 - 9, 3, 5);
    // Damage: the worse the car, the darker the body.
    if (car.health < car.maxHealth * 0.5) {
      ctx.fillStyle = `rgba(20, 16, 10, ${0.5 - car.health / car.maxHealth})`;
      roundRect(ctx, -len / 2, -wid / 2, len, wid, 6);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawPerson(x, y, angle, color, down, walkPhase, isPlayer, weapon) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = 'rgba(20, 16, 8, 0.3)';
    ctx.beginPath();
    ctx.ellipse(2, 4, 11, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    if (down > 0) {
      ctx.rotate(angle + Math.PI / 2);
      ctx.fillStyle = color;
      roundRect(ctx, -12, -6, 24, 12, 5);
      ctx.fill();
      ctx.fillStyle = '#e8b98a';
      ctx.beginPath();
      ctx.arc(15, 0, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }
    if (isPlayer) {
      ctx.strokeStyle = '#f2c230';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, 0, 17, 0, Math.PI * 2);
      ctx.stroke();
    }
    const bob = Math.sin(walkPhase) * 1.5;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(0, bob * 0.3, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e8b98a';
    ctx.beginPath();
    ctx.arc(Math.cos(angle) * 3, Math.sin(angle) * 3 + bob * 0.3, 6.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(angle) * 8, Math.sin(angle) * 8);
    ctx.lineTo(Math.cos(angle) * 15, Math.sin(angle) * 15);
    ctx.stroke();
    if (weapon && weapon !== 'fists') {
      ctx.strokeStyle = '#222';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(Math.cos(angle) * 10, Math.sin(angle) * 10);
      ctx.lineTo(Math.cos(angle) * 20, Math.sin(angle) * 20);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawSkids(state) {
    ctx.strokeStyle = 'rgba(20, 18, 14, 0.45)';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    for (const s of state.skids) {
      ctx.globalAlpha = Math.min(1, s.life / 4);
      ctx.beginPath();
      ctx.moveTo(s.x1, s.y1);
      ctx.lineTo(s.x2, s.y2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function drawPickups(state, time) {
    const p = state.player;
    const px = p.car ? p.car.x : p.x;
    const py = p.car ? p.car.y : p.y;
    for (const pickup of state.pickups) {
      if (pickup.respawn > 0) continue;
      const pulse = 1 + Math.sin(time * 4) * 0.12;
      ctx.save();
      ctx.translate(pickup.x, pickup.y);
      ctx.scale(pulse, pulse);
      ctx.fillStyle = pickup.kind === 'health' ? '#2f9e44' : '#e8a13c';
      ctx.beginPath();
      ctx.arc(0, 0, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f2efe4';
      if (pickup.kind === 'health') {
        ctx.fillRect(-2.5, -8, 5, 16);
        ctx.fillRect(-8, -2.5, 16, 5);
      } else {
        text('A', 0, 5, 13, '#f2efe4', 'center', 800);
      }
      ctx.restore();
    }
    for (const pack of state.city.packages) {
      if (pack.taken) continue;
      if (Math.abs(pack.x - px) > 900 || Math.abs(pack.y - py) > 700) continue;
      const glow = 0.6 + Math.sin(time * 5) * 0.4;
      ctx.fillStyle = `rgba(78, 227, 255, ${glow})`;
      starPath(ctx, pack.x, pack.y, 11);
      ctx.fill();
    }
  }

  function drawMarker(state, time) {
    const marker = missionMarker(state);
    if (!marker) return;
    const vx0 = camera.x - VIEW.width / 2 / camera.zoom;
    const vy0 = camera.y - VIEW.height / 2 / camera.zoom;
    const vx1 = camera.x + VIEW.width / 2 / camera.zoom;
    const vy1 = camera.y + VIEW.height / 2 / camera.zoom;
    const pulse = 1 + Math.sin(time * 5) * 0.2;
    if (marker.x > vx0 && marker.x < vx1 && marker.y > vy0 && marker.y < vy1) {
      ctx.fillStyle = 'rgba(242, 194, 48, 0.18)';
      ctx.fillRect(marker.x - 14, marker.y - 120, 28, 120);
      ctx.save();
      ctx.translate(marker.x, marker.y);
      ctx.scale(pulse, pulse);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = '#f2c230';
      ctx.fillRect(-9, -9, 18, 18);
      ctx.strokeStyle = '#1c2b39';
      ctx.lineWidth = 2;
      ctx.strokeRect(-9, -9, 18, 18);
      ctx.restore();
    } else {
      // Off-screen: an arrow on the screen edge points the way.
      const cx = Math.max(vx0 + 40, Math.min(vx1 - 40, marker.x));
      const cy = Math.max(vy0 + 40, Math.min(vy1 - 40, marker.y));
      const angle = Math.atan2(marker.y - cy, marker.x - cx);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(angle);
      ctx.fillStyle = '#f2c230';
      ctx.beginPath();
      ctx.moveTo(16, 0);
      ctx.lineTo(-10, -11);
      ctx.lineTo(-10, 11);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  function drawHeli(state) {
    const h = state.heli;
    if (!h) return;
    const p = state.player;
    const px = p.car ? p.car.x : p.x;
    const py = p.car ? p.car.y : p.y;
    // The spotlight: a wide cone from the helicopter down onto the player.
    const cone = ctx.createLinearGradient(h.x, h.y, px, py);
    cone.addColorStop(0, 'rgba(255, 235, 160, 0.16)');
    cone.addColorStop(1, 'rgba(255, 235, 160, 0.05)');
    ctx.fillStyle = cone;
    const ang = Math.atan2(py - h.y, px - h.x);
    const perp = ang + Math.PI / 2;
    const spread = 46;
    ctx.beginPath();
    ctx.moveTo(h.x, h.y);
    ctx.lineTo(px + Math.cos(perp) * spread, py + Math.sin(perp) * spread);
    ctx.lineTo(px - Math.cos(perp) * spread, py - Math.sin(perp) * spread);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 240, 180, 0.20)';
    ctx.beginPath();
    ctx.arc(px, py, 52, 0, Math.PI * 2);
    ctx.fill();
    // Shadow, offset south-east by the low sun, then the airframe and the rotor blur.
    ctx.fillStyle = 'rgba(20, 16, 8, 0.30)';
    ctx.beginPath();
    ctx.ellipse(h.x + 16, h.y + 20, 30, 16, h.angle, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.translate(h.x, h.y);
    ctx.rotate(h.angle);
    ctx.fillStyle = '#20262e';
    roundRect(ctx, -26, -11, 52, 22, 9);
    ctx.fill();
    ctx.fillStyle = '#c8d4de';
    ctx.beginPath();
    ctx.arc(12, 0, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#20262e';
    ctx.fillRect(-40, -3, 16, 6);
    ctx.fillStyle = '#e5534b';
    ctx.fillRect(-42, -3, 4, 6);
    ctx.strokeStyle = 'rgba(230, 235, 240, 0.55)';
    ctx.lineWidth = 3;
    const r1 = h.rotor;
    const r2 = h.rotor + Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(r1) * -34, Math.sin(r1) * -34);
    ctx.lineTo(Math.cos(r1) * 34, Math.sin(r1) * 34);
    ctx.moveTo(Math.cos(r2) * -34, Math.sin(r2) * -34);
    ctx.lineTo(Math.cos(r2) * 34, Math.sin(r2) * 34);
    ctx.stroke();
    ctx.fillStyle = '#f2c230';
    ctx.beginPath();
    ctx.arc(0, 0, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawWrecks(state) {
    for (const w of state.wrecks) {
      ctx.save();
      ctx.translate(w.x, w.y);
      ctx.rotate(w.angle);
      ctx.fillStyle = 'rgba(20, 16, 8, 0.35)';
      ctx.beginPath();
      ctx.ellipse(4, 6, w.radius * 1.2, w.radius * 0.8, 0, 0, Math.PI * 2);
      ctx.fill();
      // Burnt husk: blackened body, a flicker of fire still in it.
      ctx.fillStyle = '#1c1a18';
      roundRect(ctx, -w.radius * 1.15, -w.radius * 0.75, w.radius * 2.3, w.radius * 1.5, 6);
      ctx.fill();
      const flicker = 0.5 + Math.sin(state.time * 9 + w.x) * 0.5;
      ctx.fillStyle = `rgba(255, ${110 + Math.floor(flicker * 60)}, 40, ${0.35 + flicker * 0.4})`;
      ctx.beginPath();
      ctx.arc(0, 0, 6 + flicker * 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawParticles(state) {
    for (const pt of state.particles) {
      const a = Math.max(0, pt.life / pt.max);
      if (pt.kind === 'muzzle') {
        ctx.fillStyle = `rgba(255, 215, 106, ${a})`;
        starPath(ctx, pt.x, pt.y, pt.size * a + 4);
        ctx.fill();
      } else if (pt.kind === 'flame') {
        ctx.fillStyle = `rgba(255, ${140 + Math.floor(a * 80)}, 40, ${a})`;
        starPath(ctx, pt.x, pt.y, pt.size * a + 3);
        ctx.fill();
      } else if (pt.kind === 'spark') {
        ctx.fillStyle = pt.color;
        ctx.globalAlpha = a;
        ctx.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
        ctx.globalAlpha = 1;
      } else {
        ctx.fillStyle = pt.color;
        ctx.globalAlpha = a * 0.55;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
  }

  function drawMinimap(state) {
    const city = state.city;
    const x0 = 16;
    const y0 = VIEW.height - MINIMAP - 16;
    const scale = MINIMAP / city.size;
    ctx.save();
    panel(x0 - 4, y0 - 4, MINIMAP + 8, MINIMAP + 8);
    ctx.beginPath();
    ctx.rect(x0, y0, MINIMAP, MINIMAP);
    ctx.clip();
    ctx.fillStyle = '#3f7d5a';
    ctx.fillRect(x0, y0, MINIMAP, MINIMAP);
    ctx.fillStyle = '#2b7d9e';
    ctx.fillRect(x0, y0 + city.waterY * scale, MINIMAP, MINIMAP - city.waterY * scale);
    ctx.fillStyle = '#e3cf9e';
    ctx.fillRect(x0, y0 + city.sandY * scale, MINIMAP, (city.waterY - city.sandY) * scale);
    ctx.strokeStyle = '#3b4048';
    ctx.lineWidth = 2;
    for (const line of city.lines) {
      ctx.beginPath();
      ctx.moveTo(x0 + line * scale, y0);
      ctx.lineTo(x0 + line * scale, y0 + MINIMAP);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x0, y0 + line * scale);
      ctx.lineTo(x0 + MINIMAP, y0 + line * scale);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(20, 24, 30, 0.55)';
    for (const b of city.buildings) ctx.fillRect(x0 + b.x * scale, y0 + b.y * scale, Math.max(1.5, b.w * scale), Math.max(1.5, b.h * scale));
    // Blips.
    const p = state.player;
    const px = p.car ? p.car.x : p.x;
    const py = p.car ? p.car.y : p.y;
    ctx.fillStyle = '#4ee3ff';
    for (const pack of city.packages) {
      if (!pack.taken) ctx.fillRect(x0 + pack.x * scale - 1, y0 + pack.y * scale - 1, 2.5, 2.5);
    }
    if (state.taxi.destination) {
      ctx.fillStyle = '#2f9e44';
      ctx.beginPath();
      ctx.arc(x0 + state.taxi.destination.x * scale, y0 + state.taxi.destination.y * scale, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    const marker = missionMarker(state);
    if (marker) {
      const pulse = 4 + Math.sin(state.time * 5) * 1.5;
      ctx.fillStyle = '#f2c230';
      ctx.beginPath();
      ctx.arc(x0 + marker.x * scale, y0 + marker.y * scale, pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#1c2b39';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.fillStyle = '#4aa3ff';
    for (const cop of state.cops) {
      ctx.beginPath();
      ctx.arc(x0 + cop.x * scale, y0 + cop.y * scale, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const car of state.policeCars) {
      ctx.fillStyle = '#4aa3ff';
      ctx.beginPath();
      ctx.arc(x0 + car.x * scale, y0 + car.y * scale, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#ff9f2f';
    for (const block of state.roadblocks) {
      ctx.beginPath();
      ctx.arc(x0 + block.x * scale, y0 + block.y * scale, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    if (state.heli) {
      ctx.fillStyle = '#c07bff';
      ctx.beginPath();
      ctx.arc(x0 + state.heli.x * scale, y0 + state.heli.y * scale, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // The player, as a white arrow.
    ctx.save();
    ctx.translate(x0 + px * scale, y0 + py * scale);
    ctx.rotate(p.car ? p.car.angle : p.angle);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(7, 0);
    ctx.lineTo(-5, -5);
    ctx.lineTo(-5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.restore();
    text('SOLARA BAY', x0 + MINIMAP / 2, y0 - 8, 11, PALETTE.hudMuted, 'center', 700);
  }

  function drawHUD(state, ui) {
    const p = state.player;
    // Top left: cash, health, armour.
    panel(16, 14, 240, 86);
    text(`$${state.cash.toLocaleString('en-US')}`, 30, 44, 26, PALETTE.hudGold, 'left', 800);
    text('CASH', 30, 62, 11, PALETTE.hudMuted, 'left', 700);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    roundRect(ctx, 30, 70, 150, 10, 5);
    ctx.fill();
    ctx.fillStyle = state.health > 50 ? '#3fae5a' : state.health > 25 ? '#e8a13c' : '#e5534b';
    roundRect(ctx, 30, 70, 150 * Math.max(0, state.health / 100), 10, 5);
    ctx.fill();
    text(`${Math.ceil(state.health)}`, 188, 80, 12, PALETTE.hudText, 'left', 700);
    if (p.weapon !== 'fists') {
      text(`${WEAPONS[p.weapon].name}  ${p.reload > 0 ? 'RELOADING' : `AMMO ${p.ammo}`}`, 30, 96, 12, PALETTE.hudText, 'left', 700);
    }
    // Mission panel, under the cash: chapter, stage, and the next step.
    const m = state.missions;
    const mission = m.index >= 0 ? MISSIONS[m.index] : MISSIONS[Math.min(m.done.length, MISSIONS.length - 1)];
    const mStep = m.index >= 0 ? mission.steps[m.step] : null;
    panel(16, 108, 320, 66);
    text(m.index >= 0 ? `CH ${mission.title}` : `NEXT — ${mission.title}`, 30, 132, 15, PALETTE.hudGold, 'left', 800);
    const nextText = m.index >= 0
      ? `STAGE ${m.step + 1}/${mission.steps.length}  ·  ${mStep ? mStep.text : ''}`
      : 'Press N to start it, or walk to Vera\'s Garage';
    text(nextText.length > 46 ? `${nextText.slice(0, 45)}…` : nextText, 30, 154, 12, PALETTE.hudText, 'left', 600);
    // SBPD RESPONSE: the five nearest units — callsign, distance, status.
    const pxx = p.car ? p.car.x : p.x;
    const pyy = p.car ? p.car.y : p.y;
    const units = [];
    for (const car of state.policeCars) {
      if (car.health <= 0) continue;
      const d = Math.hypot(car.x - pxx, car.y - pyy);
      units.push({ d, call: unitCallsign(car, 'car'), status: car.roadblock ? 'ROADBLOCK' : d < 130 ? 'RAMMING' : 'PURSUIT', color: car.roadblock ? '#ff9f2f' : d < 130 ? '#e5534b' : '#4aa3ff' });
    }
    for (const cop of state.cops) {
      if (cop.health <= 0) continue;
      const d = Math.hypot(cop.x - pxx, cop.y - pyy);
      units.push({ d, call: unitCallsign(cop, 'foot'), status: 'PURSUIT', color: '#4aa3ff' });
    }
    if (state.heli) {
      const d = Math.hypot(state.heli.x - pxx, state.heli.y - pyy);
      units.push({ d, call: 'AIR-1', status: 'HELI', color: '#c07bff' });
    }
    units.sort((a, b) => a.d - b.d);
    const showUnits = units.slice(0, 5);
    if (showUnits.length > 0) {
      const sy = 182;
      panel(16, sy, 320, 28 + showUnits.length * 19);
      text(`SBPD RESPONSE — ${showUnits.length} UNIT${showUnits.length === 1 ? '' : 'S'}`, 30, sy + 20, 12, '#ff9f8a', 'left', 800);
      showUnits.forEach((u, i) => {
        const ry = sy + 40 + i * 19;
        text(u.call, 30, ry, 12, PALETTE.hudText, 'left', 700);
        text(u.status, 120, ry, 12, u.color, 'left', 700);
        text(`${Math.round(u.d)}m`, 322, ry, 12, PALETTE.hudMuted, 'right', 600);
      });
    }
    // Top right: wanted stars and the clock.
    panel(VIEW.width - 256, 14, 240, 62);
    for (let i = 0; i < 5; i += 1) {
      starPath(ctx, VIEW.width - 232 + i * 26, 40, 11);
      ctx.fillStyle = i < state.wanted ? '#f2c230' : 'rgba(255,255,255,0.16)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    const hours = Math.floor(state.clock / 60) % 24;
    const minutes = Math.floor(state.clock % 60);
    text(`${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`, VIEW.width - 30, 68, 15, PALETTE.hudText, 'right', 700);
    text(state.wanted > 0 ? 'WANTED' : 'SOLARA BAY', VIEW.width - 30, 40, 11, state.wanted > 0 ? PALETTE.hudDanger : PALETTE.hudMuted, 'right', 700);
    // Weapon slots, under the wanted stars: the active one is gold, locked ones are dim.
    const slotDefs = [
      { key: 'fists', label: 'FISTS', unlocked: true, ammo: '—' },
      { key: 'pistol', label: 'P9', unlocked: state.unlocked.pistol, ammo: `${WEAPONS.pistol.ammo}` },
      { key: 'shotgun', label: 'SWEEPER', unlocked: state.unlocked.shotgun, ammo: `${WEAPONS.shotgun.ammo}` },
    ];
    panel(VIEW.width - 256, 82, 240, 54);
    slotDefs.forEach((slot, i) => {
      const sx = VIEW.width - 246 + i * 78;
      const active = p.weapon === slot.key;
      ctx.globalAlpha = slot.unlocked ? 1 : 0.45;
      ctx.fillStyle = active ? 'rgba(242, 194, 48, 0.22)' : 'rgba(255, 255, 255, 0.07)';
      roundRect(ctx, sx, 90, 70, 38, 6);
      ctx.fill();
      ctx.strokeStyle = active ? '#f2c230' : 'rgba(255, 255, 255, 0.25)';
      ctx.lineWidth = active ? 2 : 1;
      roundRect(ctx, sx, 90, 70, 38, 6);
      ctx.stroke();
      text(slot.label, sx + 35, 106, 11, active ? '#f2c230' : PALETTE.hudText, 'center', 800);
      text(slot.unlocked ? (active && p.weapon !== 'fists' ? `AMMO ${p.ammo}` : slot.ammo) : 'LOCKED', sx + 35, 121, 10, PALETTE.hudMuted, 'center', 600);
      ctx.globalAlpha = 1;
    });
    // Bottom centre: the mission objective.
    const mText = missionText(state);
    ctx.font = '700 15px system-ui, sans-serif';
    const tw = ctx.measureText(mText).width + 36;
    panel((VIEW.width - tw) / 2, VIEW.height - 46, tw, 34);
    ctx.fillStyle = '#f2c230';
    ctx.beginPath();
    ctx.arc((VIEW.width - tw) / 2 + 20, VIEW.height - 29, 5, 0, Math.PI * 2);
    ctx.fill();
    text(mText, (VIEW.width - tw) / 2 + 32, VIEW.height - 24, 15, PALETTE.hudText, 'left', 700);
    // Bottom right: speed and the car, with the NOS meter under the health bar.
    if (p.car) {
      panel(VIEW.width - 216, VIEW.height - 112, 200, 72);
      const mph = Math.round(Math.abs(p.car.speed) * 0.16);
      text(`${mph}`, VIEW.width - 92, VIEW.height - 52, 30, PALETTE.hudText, 'right', 800);
      text('MPH', VIEW.width - 84, VIEW.height - 52, 12, PALETTE.hudMuted, 'left', 700);
      text(p.car.name, VIEW.width - 200, VIEW.height - 52, 13, PALETTE.hudMuted, 'left', 700);
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      roundRect(ctx, VIEW.width - 200, VIEW.height - 102, 168, 6, 3);
      ctx.fill();
      ctx.fillStyle = p.car.health > 50 ? '#3fae5a' : '#e8a13c';
      roundRect(ctx, VIEW.width - 200, VIEW.height - 102, 168 * Math.max(0, p.car.health / p.car.maxHealth), 6, 3);
      ctx.fill();
      text('NOS', VIEW.width - 200, VIEW.height - 84, 10, p.car.nosActive ? '#ff9a2f' : PALETTE.hudGold, 'left', 800);
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      roundRect(ctx, VIEW.width - 168, VIEW.height - 90, 136, 6, 3);
      ctx.fill();
      ctx.fillStyle = p.car.nosActive ? '#ff9a2f' : '#f2c230';
      roundRect(ctx, VIEW.width - 168, VIEW.height - 90, 136 * Math.max(0, p.car.nos), 6, 3);
      ctx.fill();
      if (p.car.nosActive) text('BOOST', VIEW.width - 32, VIEW.height - 84, 10, '#ff9a2f', 'right', 800);
      // Radio widget, above the speed panel: station, track, and a live equalizer.
      const track = RADIO.tracks[Math.floor(state.time / RADIO.trackSeconds) % RADIO.tracks.length];
      panel(VIEW.width - 256, VIEW.height - 172, 240, 52);
      text(`♪  ${RADIO.station}`, VIEW.width - 242, VIEW.height - 150, 12, PALETTE.hudGold, 'left', 800);
      for (let i = 0; i < 10; i += 1) {
        const h = 4 + (Math.sin(state.time * 9 + i * 1.7) * 0.5 + 0.5) * 10;
        ctx.fillStyle = '#f2c230';
        ctx.fillRect(VIEW.width - 92 + i * 6, VIEW.height - 158 - h, 3, h);
      }
      text(`${track.title} — ${track.artist}`, VIEW.width - 242, VIEW.height - 132, 12, PALETTE.hudText, 'left', 600);
    }
    // Vera's dialog box, bottom left above the minimap: she talks when there is a
    // mission on, or when the heat is up.
    if (state.wanted >= 2 || m.index >= 0) {
      const line = state.wanted >= 3
        ? 'Lose them before the scanner closes.'
        : m.index >= 0 ? MISSIONS[m.index].briefing : 'Stay out of sight until the heat dies down.';
      panel(16, 440, 360, 58);
      ctx.fillStyle = '#7a4fd9';
      ctx.beginPath();
      ctx.arc(44, 469, 18, 0, Math.PI * 2);
      ctx.fill();
      text('VS', 44, 474, 13, '#ffffff', 'center', 800);
      text('VERA SOLANO', 72, 461, 12, PALETTE.hudGold, 'left', 800);
      text(line.length > 44 ? `${line.slice(0, 43)}…` : line, 72, 481, 13, PALETTE.hudText, 'left', 600);
    }
    drawMinimap(state);
    // Toast message.
    if (state.message) {
      ctx.font = '600 16px system-ui, sans-serif';
      const mw = ctx.measureText(state.message).width + 32;
      panel((VIEW.width - mw) / 2, 92, mw, 36);
      text(state.message, VIEW.width / 2, 116, 16, PALETTE.hudText, 'center', 600);
    }
    // Banner (mission complete, big score).
    if (ui.banner && state.time < ui.bannerUntil) {
      const alpha = Math.min(1, (ui.bannerUntil - state.time) / 0.8);
      ctx.globalAlpha = alpha;
      ctx.font = '800 44px system-ui, sans-serif';
      const bw = ctx.measureText(ui.banner).width;
      ctx.fillStyle = 'rgba(12, 16, 22, 0.6)';
      ctx.fillRect((VIEW.width - bw) / 2 - 24, 200, bw + 48, 64);
      text(ui.banner, VIEW.width / 2, 246, 44, '#f2c230', 'center', 800);
      ctx.globalAlpha = 1;
    }
    // Low-health vignette.
    if (state.health < 35 && !p.car) {
      const g = ctx.createRadialGradient(VIEW.width / 2, VIEW.height / 2, VIEW.height * 0.35, VIEW.width / 2, VIEW.height / 2, VIEW.height * 0.75);
      g.addColorStop(0, 'rgba(180, 20, 20, 0)');
      g.addColorStop(1, `rgba(180, 20, 20, ${0.45 - state.health * 0.008})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    }
  }

  function drawTitle(state, ui) {
    ctx.fillStyle = 'rgba(10, 14, 20, 0.55)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    text('SOLARA BAY', VIEW.width / 2, 190, 84, '#f2efe4', 'center', 900);
    text('AN OPEN-WORLD CRIME STORY', VIEW.width / 2, 228, 20, '#f2c230', 'center', 700);
    text('Steal cars. Lose the cops. Do the jobs. Own the city.', VIEW.width / 2, 262, 17, '#d8d2c0', 'center', 500);
    if (ui.showHelp) {
      panel(VIEW.width / 2 - 320, 300, 640, 300);
      text('HOW TO PLAY', VIEW.width / 2, 340, 22, '#f2c230', 'center', 800);
      const lines = [
        'You are Jax Marlowe, a getaway driver in debt to the fixer Vera Solano.',
        'Work through her 8 missions — the garage is your home base.',
        'Walk up to any car and press E to take it. Parked cars are free;',
        'jacking one from its driver brings the heat.',
        'Stars mean the police are coming. Lose them by staying out of sight.',
        'Yellow cabs pay fares. Green crosses heal. Cyan stars are hidden',
        'packages worth $100 each. The hospital patches you up for free.',
        'Busted or wasted costs you cash — and fails the mission you are on.',
      ];
      lines.forEach((line, i) => text(line, VIEW.width / 2, 378 + i * 26, 15, '#f2efe4', 'center', 500));
      text('Press Enter to go back', VIEW.width / 2, 580, 14, '#f2c230', 'center', 700);
      return;
    }
    const items = [];
    if (ui.saveExists) items.push('Continue — pick up where you left off');
    items.push('New game — start the story');
    items.push('How to play');
    const y0 = 330;
    items.forEach((item, i) => {
      const selected = ui.menuIndex === i;
      if (selected) {
        ctx.fillStyle = 'rgba(242, 194, 48, 0.9)';
        roundRect(ctx, VIEW.width / 2 - 260, y0 + i * 52 - 26, 520, 40, 8);
        ctx.fill();
        text(item, VIEW.width / 2, y0 + i * 52 + 2, 18, '#1c2b39', 'center', 700);
      } else {
        text(item, VIEW.width / 2, y0 + i * 52 + 2, 18, '#f2efe4', 'center', 600);
      }
    });
    text('WASD drive & walk · E steal / exit car · F punch · Mouse aim, click to shoot · Shift run / NOS boost in a car · Space handbrake', VIEW.width / 2, 560, 14, '#c9c2ae', 'center', 500);
    text('P pause · N next mission · M mute · your progress saves automatically', VIEW.width / 2, 586, 14, '#c9c2ae', 'center', 500);
  }

  function drawPaused(state) {
    ctx.fillStyle = 'rgba(10, 14, 20, 0.6)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    panel(VIEW.width / 2 - 300, 130, 600, 440);
    text('PAUSED', VIEW.width / 2, 180, 34, '#f2efe4', 'center', 800);
    const s = state.stats;
    const lines = [
      `Cash: $${state.cash.toLocaleString('en-US')}`,
      `Missions done: ${state.missions.done.length} / ${MISSIONS.length}   ($${state.stats.earned.toLocaleString('en-US')} earned)`,
      `Cars stolen: ${s.carsStolen}   Fares driven: ${s.fares}   Packages: ${s.packages}/15`,
      `Wanted level: ${state.wanted} star${state.wanted === 1 ? '' : 's'}`,
      '',
      'N — start the next mission      S — save now',
      'M — mute      Enter / P — keep playing',
    ];
    lines.forEach((line, i) => text(line, VIEW.width / 2, 224 + i * 34, 16, '#d8d2c0', 'center', 500));
  }

  function drawEndCard(big, small, color) {
    ctx.fillStyle = 'rgba(10, 14, 20, 0.72)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    text(big, VIEW.width / 2, 320, 72, color, 'center', 900);
    text(small, VIEW.width / 2, 372, 19, '#f2efe4', 'center', 600);
    text('Press Enter to keep playing in free roam', VIEW.width / 2, 420, 15, '#c9c2ae', 'center', 500);
  }

  function draw(state, screen, ui) {
    const p = state.player;
    const px = p.car ? p.car.x : p.x;
    const py = p.car ? p.car.y : p.y;
    camera.x = px;
    camera.y = py;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, VIEW.width, VIEW.height);
    // Screen shake: a fixed wobble of the clock, never Math.random, so two runs of the
    // same seed paint the same frame.
    const shx = state.shake > 0 ? Math.sin(state.time * 127.1) * state.shake * 0.5 : 0;
    const shy = state.shake > 0 ? Math.cos(state.time * 149.7) * state.shake * 0.5 : 0;
    ctx.save();
    ctx.translate(VIEW.width / 2 - camera.x * camera.zoom + shx, VIEW.height / 2 - camera.y * camera.zoom + shy);
    ctx.scale(camera.zoom, camera.zoom);
    drawGround(state);
    drawBuildings(state);
    drawSkids(state);
    drawPickups(state, state.time);
    drawMarker(state, state.time);
    // People and cars, in one pass sorted by depth (y).
    const drawables = [];
    for (const ped of state.peds) drawables.push({ y: ped.y, f: () => drawPerson(ped.x, ped.y, ped.angle, ped.color, ped.down, ped.walkPhase, false, null) });
    for (const cop of state.cops) drawables.push({ y: cop.y, f: () => drawPerson(cop.x, cop.y, cop.angle, cop.color, cop.down, cop.walkPhase, false, null) });
    for (const car of state.cars) drawables.push({ y: car.y, f: () => drawCar(car, state.time, car === state.player.car) });
    if (p.onFoot) drawables.push({ y: p.y, f: () => drawPerson(p.x, p.y, p.angle, '#2f9e8f', 0, p.runPhase, true, p.weapon) });
    drawables.sort((a, b) => a.y - b.y);
    for (const d of drawables) d.f();
    drawWrecks(state);
    drawHeli(state);
    drawParticles(state);
    ctx.restore();
    // Golden-hour wash over everything — stronger now, warm at the bottom of the frame.
    const wash = ctx.createLinearGradient(0, 0, 0, VIEW.height);
    wash.addColorStop(0, 'rgba(255, 190, 110, 0.09)');
    wash.addColorStop(1, 'rgba(255, 150, 60, 0.18)');
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    if (screen === SCREEN_TITLE) drawTitle(state, ui);
    else if (screen === SCREEN_PAUSED) drawPaused(state);
    else if (screen === SCREEN_WASTED) drawEndCard('WASTED', 'The hospital patched you up — $150 gone. The city is still out there.', '#e5534b');
    else if (screen === SCREEN_BUSTED) drawEndCard('BUSTED', 'The cops took $200 and your afternoon. Vera is not impressed.', '#4aa3ff');
    else if (screen === SCREEN_END) drawEndCard('THE BIG SCORE', 'Jax is square with Vera — and Solara Bay is his. Free roam unlocked.', '#f2c230');
    if (screen === SCREEN_PLAY || screen === SCREEN_PAUSED) drawHUD(state, ui);
  }

  return { draw, camera };
}
