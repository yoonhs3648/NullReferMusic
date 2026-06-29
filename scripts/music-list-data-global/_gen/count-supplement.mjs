import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { trackKey } from '../../music-list-shared.mjs';
import { SUPPLEMENT } from './supplements.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const yearRawDir = path.join(__dirname, 'year-raw');
const rapDir = path.join(__dirname, '..', '..', 'music-list-data');

const rap = new Set();
for (const f of fs.readdirSync(rapDir).filter((x) => x.endsWith('.json'))) {
  for (const r of JSON.parse(fs.readFileSync(path.join(rapDir, f), 'utf8'))) {
    rap.add(trackKey(r.artist, r.title));
  }
}

const globalUsed = new Set();
for (let y = 2000; y <= 2025; y++) {
  const p = path.join(yearRawDir, `${y}.mjs`);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, 'utf8').match(/"([^"]+)"/g) ?? []) {
    const [a, t] = line.slice(1, -1).split('|');
    globalUsed.add(trackKey(a, t));
  }
}

for (const year of [2022, 2023, 2024, 2025]) {
  const avail = (SUPPLEMENT[year] ?? []).filter(
    (r) => !rap.has(trackKey(r.artist, r.title)) && !globalUsed.has(trackKey(r.artist, r.title)),
  );
  console.log(`${year}: supplement avail ${avail.length} / ${(SUPPLEMENT[year] ?? []).length}`);
  for (const r of avail) console.log(`  ${r.artist} - ${r.title}`);
}
