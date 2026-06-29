/**
 * Generate complete global year-data from per-year source modules.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { trackKey } from '../../music-list-shared.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const yearsDir = path.join(__dirname, 'years');
const rapDir = path.join(__dirname, '..', '..', 'music-list-data');

function loadRapKeys() {
  const keys = new Set();
  for (const f of fs.readdirSync(rapDir).filter((x) => x.endsWith('.json'))) {
    for (const row of JSON.parse(fs.readFileSync(path.join(rapDir, f), 'utf8'))) {
      keys.add(trackKey(row.artist, row.title));
    }
  }
  return keys;
}

const rapKeys = loadRapKeys();
const globalKeys = new Map();
const YEAR_DATA = {};

for (let y = 2000; y <= 2025; y++) {
  const mod = await import(`./years/${y}.mjs`);
  const tracks = mod.default;
  if (tracks.length !== 100) {
    throw new Error(`${y}.mjs: expected 100, got ${tracks.length}`);
  }
  for (let i = 0; i < tracks.length; i++) {
    const t = tracks[i];
    const key = trackKey(t.artist, t.title);
    if (rapKeys.has(key)) throw new Error(`rap overlap ${y}#${i + 1}: ${t.artist} - ${t.title}`);
    if (globalKeys.has(key)) {
      const prev = globalKeys.get(key);
      throw new Error(`global dup ${y}#${i + 1}: ${t.artist} - ${t.title} (was ${prev})`);
    }
    globalKeys.set(key, `${y}#${i + 1}`);
  }
  YEAR_DATA[y] = tracks;
}

const out = `/** Auto-assembled global year data (2000–2025). */\nexport const YEAR_DATA = ${JSON.stringify(YEAR_DATA, null, 2)};\n`;
fs.writeFileSync(path.join(__dirname, 'year-data.mjs'), out, 'utf8');
console.log(`Assembled year-data.mjs: ${globalKeys.size} tracks, 0 rap overlaps.`);
