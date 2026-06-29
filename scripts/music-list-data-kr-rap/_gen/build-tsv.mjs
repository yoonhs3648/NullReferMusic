/**
 * Build all-tracks.tsv from year pipe blocks.
 * Run: node scripts/music-list-data-kr-rap/_gen/build-tsv.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PIPES } from './seed-pipes.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(__dirname, 'all-tracks.tsv');
const lines = [];

for (const [year, block] of Object.entries(PIPES)) {
  const rows = block
    .trim()
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  if (rows.length !== 100) throw new Error(`year ${year}: expected 100 pipe rows, got ${rows.length}`);
  for (const row of rows) {
    const parts = row.split('|');
    if (parts.length < 3) throw new Error(`bad row ${year}: ${row}`);
    const artist = parts[0].trim();
    const title = parts[1].trim();
    const album = parts.slice(2).join('|').trim();
    lines.push(`${year}|${artist}|${title}|${album}`);
  }
}

if (lines.length !== 1600) throw new Error(`expected 1600 lines, got ${lines.length}`);
fs.writeFileSync(out, lines.join('\n') + '\n', 'utf8');
console.log(`Wrote ${lines.length} lines to all-tracks.tsv`);
