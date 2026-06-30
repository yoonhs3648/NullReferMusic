/**
 * Kpop 큐레이션 (2015–2025) → JSON
 * Kpop 목록 내 artist+title 전역 유일. 타 장르(kr-rap 등)와 중복 허용.
 *
 * Run: node scripts/music-list-data-kpop/build.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { trackKey } from '../music-list-shared.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const YEAR_MIN = 2015;
const YEAR_MAX = 2025;

const yearModules = {};
for (let y = YEAR_MIN; y <= YEAR_MAX; y++) {
  yearModules[y] = (await import(`./data/${y}.mjs`)).default;
}

function validateBeforeWrite(all) {
  const globalKeys = new Map();
  const byYear = new Map();

  for (const e of all) {
    const key = trackKey(e.artist, e.title);
    if (globalKeys.has(key)) {
      const prev = globalKeys.get(key);
      throw new Error(
        `duplicate: "${e.artist} - ${e.title}" (${e._file}, y${e.year}) vs (${prev._file}, y${prev.year})`,
      );
    }
    globalKeys.set(key, e);
    if (e.year < YEAR_MIN || e.year > YEAR_MAX) {
      throw new Error(`year out of range: ${e.artist} - ${e.title} (${e.year})`);
    }
    if (!byYear.has(e.year)) byYear.set(e.year, []);
    byYear.get(e.year).push(e);
  }

  for (let y = YEAR_MIN; y <= YEAR_MAX; y++) {
    const rows = byYear.get(y) ?? [];
    if (rows.length !== 100) throw new Error(`year ${y}: expected 100, got ${rows.length}`);
    for (let r = 1; r <= 100; r++) {
      if (!rows.some((x) => x.rank === r)) throw new Error(`year ${y}: missing rank ${r}`);
    }
    for (const row of rows) {
      if (row.year !== y) {
        throw new Error(`year mismatch: rank ${row.rank} in ${y}.json has year ${row.year}`);
      }
    }
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

const all = [];
for (let y = YEAR_MIN; y <= YEAR_MAX; y++) {
  const file = `${y}.json`;
  all.push(...yearModules[y].map((t) => ({ ...t, _file: file })));
}

validateBeforeWrite(all);
for (let y = YEAR_MIN; y <= YEAR_MAX; y++) {
  writeJson(`${y}.json`, yearModules[y]);
}

console.log(`Wrote kpop JSON (${YEAR_MAX - YEAR_MIN + 1} files, ${all.length} tracks).`);
