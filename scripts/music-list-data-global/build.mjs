/**
 * 글로벌(팝·R&B·록 등, 힙합 제외) 큐레이션 → JSON
 * 글로벌 랩/힙합 트랙과 artist+title 중복 금지
 *
 * Run: node scripts/music-list-data-global/build.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { trackKey } from '../music-list-shared.mjs';
import { pre2000 } from './data/pre2000.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rapDir = path.join(__dirname, '..', 'music-list-data');

const yearModules = {};
for (let y = 2000; y <= 2025; y++) {
  yearModules[y] = (await import(`./data/${y}.mjs`)).default;
}

function loadRapExcludeKeys() {
  const keys = new Set();
  if (!fs.existsSync(rapDir)) return keys;
  for (const f of fs.readdirSync(rapDir).filter((x) => x.endsWith('.json'))) {
    for (const row of JSON.parse(fs.readFileSync(path.join(rapDir, f), 'utf8'))) {
      keys.add(trackKey(row.artist, row.title));
    }
  }
  return keys;
}

function validateBeforeWrite(all, rapExclude) {
  const globalKeys = new Map();
  const byYear = new Map();

  for (const e of all) {
    const key = trackKey(e.artist, e.title);
    if (rapExclude.has(key)) {
      throw new Error(`rap overlap: "${e.artist} - ${e.title}" (${e._file})`);
    }
    if (globalKeys.has(key)) {
      const prev = globalKeys.get(key);
      throw new Error(
        `duplicate: "${e.artist} - ${e.title}" (${e._file}) vs (${prev._file})`,
      );
    }
    globalKeys.set(key, e);
    if (!byYear.has(e.year)) byYear.set(e.year, []);
    byYear.get(e.year).push(e);
  }

  for (let y = 2000; y <= 2025; y++) {
    const rows = byYear.get(y) ?? [];
    if (rows.length !== 100) throw new Error(`year ${y}: expected 100, got ${rows.length}`);
    for (let r = 1; r <= 100; r++) {
      if (!rows.some((x) => x.rank === r)) throw new Error(`year ${y}: missing rank ${r}`);
    }
  }

  const legacy = [...byYear.entries()]
    .filter(([y]) => y <= 1999)
    .flatMap(([, rows]) => rows);
  if (legacy.length < 100) throw new Error(`pre2000: expected >= 100, got ${legacy.length}`);
  for (let r = 1; r <= 100; r++) {
    if (!legacy.some((x) => x.rank === r)) throw new Error(`pre2000: missing rank ${r}`);
  }
}

function writeJson(name, rows) {
  const out = rows.map(({ rank, year, artist, title, album }) => ({
    rank,
    year,
    artist,
    title,
    album: album ?? '',
  }));
  fs.writeFileSync(path.join(__dirname, name), JSON.stringify(out, null, 2) + '\n', 'utf8');
}

const rapExclude = loadRapExcludeKeys();
const all = [];
all.push(...pre2000.map((t) => ({ ...t, _file: 'pre2000.json' })));
for (let y = 2000; y <= 2025; y++) {
  const file = `${y}.json`;
  all.push(...yearModules[y].map((t) => ({ ...t, _file: file })));
}

validateBeforeWrite(all, rapExclude);
writeJson('pre2000.json', pre2000);
for (let y = 2000; y <= 2025; y++) {
  writeJson(`${y}.json`, yearModules[y]);
}

console.log(`Wrote global JSON (27 files, ${all.length} tracks, rap exclude ${rapExclude.size} keys).`);
