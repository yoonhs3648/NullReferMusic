/**
 * Generate catalog-data/*.mjs from embedded per-year track arrays.
 * Uses real Korean hip-hop/R&B discography entries.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { trackKey } from '../../music-list-shared.mjs';
import { RAW } from './raw-tracks.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, 'catalog-data');

function esc(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

const global = new Map();
for (const [year, tracks] of Object.entries(RAW)) {
  if (tracks.length !== 100) throw new Error(`${year}: need 100, got ${tracks.length}`);
  const lines = ['export default ['];
  for (const t of tracks) {
    const key = trackKey(t[0], t[1]);
    if (global.has(key)) throw new Error(`dup ${t[0]} - ${t[1]} in ${year} vs ${global.get(key)}`);
    global.set(key, year);
    lines.push(`  { artist: "${esc(t[0])}", title: "${esc(t[1])}", album: "${esc(t[2] ?? '')}" },`);
  }
  lines.push('];', '');
  fs.writeFileSync(path.join(outDir, `${year}.mjs`), lines.join('\n'), 'utf8');
}
console.log(`Generated ${Object.keys(RAW).length} catalog files, ${global.size} unique tracks.`);
