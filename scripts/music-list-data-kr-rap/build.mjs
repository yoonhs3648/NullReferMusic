/**
 * 한국 랩/힙합 큐레이션 (2010–2025) → JSON
 * 글로벌 랩/힙합·글로벌과 artist+title 중복 금지
 *
 * Run: node scripts/music-list-data-kr-rap/build.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { trackKey } from '../music-list-shared.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoScripts = path.join(__dirname, '..');
const YEAR_MIN = 2010;
const YEAR_MAX = 2025;

const yearModules = {};
for (let y = YEAR_MIN; y <= YEAR_MAX; y++) {
  yearModules[y] = (await import(`./data/${y}.mjs`)).default;
}

function loadExcludeKeys() {
  const keys = new Set();
  for (const dir of ['music-list-data', 'music-list-data-global']) {
    const full = path.join(repoScripts, dir);
    if (!fs.existsSync(full)) continue;
    for (const f of fs.readdirSync(full).filter((x) => x.endsWith('.json'))) {
      for (const row of JSON.parse(fs.readFileSync(path.join(full, f), 'utf8'))) {
        keys.add(trackKey(row.artist, row.title));
      }
    }
  }
  return keys;
}

const MAX_PER_ARTIST = 2;
const MIN_ARTISTS = 45;
const MIN_HANGUL_RATIO = 0.15;

function hasHangul(s) {
  return /[가-힣]/.test(String(s ?? ''));
}

function validateBeforeWrite(all, exclude) {
  const globalKeys = new Map();
  const byYear = new Map();

  for (const e of all) {
    const key = trackKey(e.artist, e.title);
    if (exclude.has(key)) {
      throw new Error(`cross-list overlap: "${e.artist} - ${e.title}" (${e._file})`);
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

  for (let y = YEAR_MIN; y <= YEAR_MAX; y++) {
    const rows = byYear.get(y) ?? [];
    if (rows.length !== 100) throw new Error(`year ${y}: expected 100, got ${rows.length}`);
    for (let r = 1; r <= 100; r++) {
      if (!rows.some((x) => x.rank === r)) throw new Error(`year ${y}: missing rank ${r}`);
    }

    const artistCount = new Map();
    let hangul = 0;
    for (const row of rows) {
      artistCount.set(row.artist, (artistCount.get(row.artist) ?? 0) + 1);
      if (hasHangul(row.title)) hangul++;
    }
    for (const [artist, count] of artistCount) {
      if (count > MAX_PER_ARTIST) {
        throw new Error(`year ${y}: ${artist} has ${count} tracks (max ${MAX_PER_ARTIST})`);
      }
    }
    if (artistCount.size < MIN_ARTISTS) {
      throw new Error(`year ${y}: only ${artistCount.size} artists (min ${MIN_ARTISTS})`);
    }
    if (hangul / rows.length < MIN_HANGUL_RATIO) {
      throw new Error(
        `year ${y}: hangul title ratio ${((hangul / rows.length) * 100).toFixed(0)}% (min ${MIN_HANGUL_RATIO * 100}%)`,
      );
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

const exclude = loadExcludeKeys();
const all = [];
for (let y = YEAR_MIN; y <= YEAR_MAX; y++) {
  const file = `${y}.json`;
  all.push(...yearModules[y].map((t) => ({ ...t, _file: file })));
}

validateBeforeWrite(all, exclude);
for (let y = YEAR_MIN; y <= YEAR_MAX; y++) {
  writeJson(`${y}.json`, yearModules[y]);
}

console.log(
  `Wrote kr-rap JSON (${YEAR_MAX - YEAR_MIN + 1} files, ${all.length} tracks, exclude ${exclude.size} keys).`,
);
