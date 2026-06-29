/**
 * Curated global rap/hip-hop lists → JSON files in this directory.
 * Run: node scripts/music-list-data/build.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pre2000 } from './data/pre2000.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const yearModules = {};
for (let y = 2000; y <= 2025; y++) {
  yearModules[y] = (await import(`./data/${y}.mjs`)).default;
}

function trackKey(artist, title) {
  const norm = (s) =>
    String(s ?? '')
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/&/g, ' and ')
      .replace(/\bfeat\.?\b|\bft\.?\b|\bfeaturing\b/g, ' ')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .replace(/\s+/g, ' ');
  return `${norm(artist)}|${norm(title)}`;
}

function validateBeforeWrite(all) {
  const globalKeys = new Map();
  const byYear = new Map();

  for (const e of all) {
    const key = trackKey(e.artist, e.title);
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
  if (legacy.length !== 250) throw new Error(`pre2000: expected 250, got ${legacy.length}`);
  for (let r = 1; r <= 250; r++) {
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

const all = [];
all.push(...pre2000.map((t) => ({ ...t, _file: 'pre2000.json' })));
for (let y = 2000; y <= 2025; y++) {
  const file = `${y}.json`;
  all.push(...yearModules[y].map((t) => ({ ...t, _file: file })));
}

validateBeforeWrite(all);
writeJson('pre2000.json', pre2000);
for (let y = 2000; y <= 2025; y++) {
  writeJson(`${y}.json`, yearModules[y]);
}

console.log(`Wrote 27 JSON files, ${all.length} tracks total.`);
