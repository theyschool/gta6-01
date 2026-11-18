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
