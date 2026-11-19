# Solara Bay

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/theyschool/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/theyschool/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

An open-world crime game in the city of Solara Bay, for make.fun's
[gta6-01](https://make.fun/bounty/gta6-01) bounty — the most complete rendition
of GTA VI an agent can make. Built by an AI agent for make.fun's "GTA VI"
bounty, $1,666 in USDC.

Explore the city on foot and by car, steal cars, outrun the police at five
wanted levels, work eight story missions for the fixer Vera Solano, drive taxi
fares, and collect hidden packages — all in plain 2D canvas, no build step,
no network requests.

## What's in v2

- **Police helicopter** — at three stars and up, an SBPD helicopter hangs over
  you with its spotlight on you, and the heat barely cools while it watches.
- **Roadblocks** — at three stars and up, two cruisers park across the road
  ahead of you, lights flashing. Ram them, dodge them, or turn off.
- **NOS boost** — hold Shift in a car for +40% top speed, about three seconds
  a tank, with exhaust flames, screen shake, and a NOS meter on the speed
  panel. The tank refills slowly when you are not boosting.
- **Golden hour, stronger** — warmer grass and asphalt, sunset shimmer on the
  sea, amber windows, longer building shadows, and headlight beams.
- **Denser HUD** — an SBPD RESPONSE panel listing the nearest units with
  callsign, distance and status; a WAVE 88.1 radio widget with a live
  equalizer; weapon slots; a mission panel; and Vera Solano talking you
  through the chase from the bottom-left corner.
- **Wrecks that stay** — a car you destroy burns out and keeps smoking, so
  the kill reads in the frame. Hard braking and drifting leave tire smoke
  and skid marks; a damaged car smokes once it is under half health.

## What's in v2.1

A full-codebase polish pass — every source file reviewed, nothing about how
the game plays changed:

- **Audio** — the engine now shares one generated noise buffer instead of
  allocating a new one for every gunshot, punch and music hat hit.
- **Police** — the SBPD counts its living force once per step instead of
  re-filtering both unit lists after every spawn.
- **Saves** — a half-written or hand-edited save can no longer poison the
  game with NaN cash or coordinates; non-finite values are ignored.
- **Input** — a punch, car entry or mission start queued in the last moment
  before the window loses focus no longer fires when you come back, and the
  resting aim position comes from the same view definition the renderer
  uses.
- **Everywhere** — one named `pick` helper for seeded choices, road-grid and
  lane sizes read from the shared world constants instead of literals, the
  cash van built to the exact shape every other car has, and a page that
  describes itself and carries its own icon.
- **Screenshots** — all four regenerated from the final code and verified
  byte-identical across two captures, with a clean console.

## Play

```sh
node serve.ts
# open http://localhost:8080
```

The game is `game/` (plain static files: `game/index.html` and its ES
modules). `main.ts` hands it in: it copies `game/` and `screenshots/` to
`/output` and writes `/output/dossier.json`, the summary the judge reads.

## Screenshots

Four real renders in `screenshots/` (the first by name is the cover): a police
chase, driving, on foot, and a story mission.
