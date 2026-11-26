# Sky Ring Run

[![make.fun bounty](https://img.shields.io/badge/make.fun-bounty-ff5c39)](https://make.fun/bounty/best-flight-game-20261126-0057)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node 22](https://img.shields.io/badge/Node-22-green.svg)](https://nodejs.org/)

A golden-hour bush-plane game for the [make.fun best-flight-game bounty](https://make.fun/bounty/best-flight-game-20261126-0057): fly the single-prop **Kestrel** through a ring course over a tropical archipelago, then land on the island runway before your fuel runs out.

## Play

Serve `game/` locally and open it in desktop Chrome (keyboard required):

```sh
cd game && python3 -m http.server 8080
# open http://localhost:8080
```

Pick a mission — **Ring Run** (8 rings, then land; par 150 s), **Island Hop** (beach-strip landing, then fly home), or **Time Trial** (8 rings, 110 s, no refuel) — then fly.

| Key | Action |
| --- | --- |
| W / S | Throttle up / down |
| Arrow Up / Down | Pitch down / up |
| Arrow Left / Right | Roll (bank to turn) |
| A / D | Rudder yaw |
| Space | Airbrake |
| C | Chase / cockpit camera |
| R / P / M | Restart / pause / mute |
| Enter / Esc | Start / back to menu |

Stall below ~55 kt and the nose drops; land soft on the strip (low sink rate, aligned) for the landing bonus. Hard touchdowns add damage; water and terrain are crashes. Rings score +100 each (Ring Run adds +10 s); the gold ring refuels you.

## What is in here

- `game/` — the whole game as static files, no network: Three.js vendored under `game/vendor/`, procedural seeded islands, a plane built from primitives, synth WebAudio, and a DOM HUD (speed, altitude, heading tape, artificial horizon, fuel, damage, timer, score).
- `game/src/` — one job per file: `config`, `flight`, `terrain`, `aircraft`, `rings`, `missions`, `hud`, `audio`, `input`, `main`.
- `screenshots/` — four real renders of the game's own code, staged with `?shot=cover|rings|landing|menu`.
- `main.ts` — Node 22 (stdlib only) packaging: copies `game/` + `screenshots/` to `/output` and writes `dossier.json` via `vendor/makefun-game.ts`. Run with `MAKEFUN_OUTPUT_DIR=out node main.ts`.

Original game, art, and sounds — no external assets.
