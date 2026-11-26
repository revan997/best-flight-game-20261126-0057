// main.ts — package "Sky Ring Run" for make.fun (Node 22, standard library only).
//
// Copies this repo's game/ and screenshots/ beside this file into the output
// directory and writes dossier.json there with the vendored make.fun library.
// The scorer re-runs this same program, so the output must be deterministic:
// the same game/ and screenshots/ always produce the same /output bytes.
//
// Run outside the grader's container with:
//   MAKEFUN_OUTPUT_DIR=out node main.ts
// (without the variable it writes to /output, as the grader expects).

import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// This file's directory: the repo root, holding game/ and screenshots/.
const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const gameSource = join(repoRoot, 'game');
const shotsSource = join(repoRoot, 'screenshots');
const gameDest = join(outputDir, 'game');
const shotsDest = join(outputDir, 'screenshots');

if (!existsSync(gameSource)) throw new Error('main.ts: no game/ beside this file');
if (!existsSync(shotsSource)) throw new Error('main.ts: no screenshots/ beside this file');

mkdirSync(outputDir, { recursive: true });

// Start clean so a stale file from an earlier run can never leak into the
// hand-in; the copy below is then exactly game/ + screenshots/ as they stand.
rmSync(gameDest, { recursive: true, force: true });
rmSync(shotsDest, { recursive: true, force: true });
cpSync(gameSource, gameDest, { recursive: true });
cpSync(shotsSource, shotsDest, { recursive: true });

// The competition's caps (gate.json): only text_max_bytes shapes the dossier
// bytes; the rest refuse an entry the scorer would refuse — more than 4
// screenshots, one over 256 KiB, more than 993 entries in game/, more than
// 48 MiB of game files, or a game path over 1000 bytes.
writeFileSync(
  join(outputDir, 'dossier.json'),
  buildDossier(outputDir, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);

console.log(`sky-ring-run: packaged game/ + screenshots/ into ${outputDir} (dossier.json written)`);
