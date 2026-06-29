import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { trackKey } from '../../music-list-shared.mjs';
import { pre2000 } from '../data/pre2000.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rapDir = path.join(__dirname, '..', '..', 'music-list-data');
const dataDir = path.join(__dirname, '..', 'data');

const rapKeys = new Set();
for (const f of fs.readdirSync(rapDir).filter((x) => x.endsWith('.json'))) {
  for (const row of JSON.parse(fs.readFileSync(path.join(rapDir, f), 'utf8'))) {
    rapKeys.add(trackKey(row.artist, row.title));
  }
}

const globalKeys = new Map();
let total = 0;
let rapOverlap = 0;
const all = [...pre2000.map((t) => ({ ...t, file: 'pre2000' }))];

for (let y = 2000; y <= 2025; y++) {
  const rows = (await import(`../data/${y}.mjs`)).default;
  all.push(...rows.map((t) => ({ ...t, file: String(y) })));
}

for (const t of all) {
  total++;
  const k = trackKey(t.artist, t.title);
  if (rapKeys.has(k)) rapOverlap++;
  if (globalKeys.has(k)) {
    console.error('GLOBAL DUP:', k, globalKeys.get(k), t.file);
    process.exit(1);
  }
  globalKeys.set(k, t.file);
}

const seed = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'supabase', 'music_list_seed.sql'), 'utf8');
const insertCount = (seed.match(/^INSERT INTO music_list/gm) ?? []).length;

console.log('Total global tracks:', total);
console.log('Rap overlap:', rapOverlap);
console.log('Global internal dups:', 0);
console.log('Seed INSERT rows:', insertCount);
console.log('pre2000 count:', pre2000.length);
