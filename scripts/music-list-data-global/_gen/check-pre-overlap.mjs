import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { trackKey } from '../../music-list-shared.mjs';
import PRE2000_RAW from './pre2000-raw.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const yearRawDir = path.join(__dirname, 'year-raw');

const preKeys = new Map();
for (const line of PRE2000_RAW.slice(0, 150)) {
  const [, artist, title] = line.split('|');
  preKeys.set(trackKey(artist, title), `${artist} - ${title}`);
}

const dups = [];
for (let y = 2000; y <= 2025; y++) {
  const p = path.join(yearRawDir, `${y}.mjs`);
  for (const line of fs.readFileSync(p, 'utf8').match(/"([^"]+)"/g) ?? []) {
    const [artist, title] = line.slice(1, -1).split('|');
    const k = trackKey(artist, title);
    if (preKeys.has(k)) dups.push({ year: y, artist, title, pre: preKeys.get(k) });
  }
}
console.log('pre2000 vs year-raw overlaps:', dups.length);
for (const d of dups) console.log(`  ${d.year}: ${d.artist} - ${d.title}`);
