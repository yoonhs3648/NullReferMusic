/**
 * Assembles curated source arrays into data/*.mjs modules.
 * Run: node scripts/music-list-data/_gen/assemble.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pre2000Tracks } from './pre2000-source.mjs';
import { yearTracks } from './years-source.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');

function trackKey(artist, title) {
  const norm = (s) =>
    String(s ?? '')
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  return `${norm(artist)}|${norm(title)}`;
}

function formatEntry(e) {
  const album = e.album == null ? '' : String(e.album);
  const parts = [
    `  { rank: ${e.rank}, year: ${e.year}, artist: ${JSON.stringify(e.artist)}, title: ${JSON.stringify(e.title)}, album: ${JSON.stringify(album)} }`,
  ];
  return parts.join('');
}

function validateAll(pre2000, years) {
  const globalKeys = new Map();
  const check = (e, file) => {
    const key = trackKey(e.artist, e.title);
    if (globalKeys.has(key)) {
      throw new Error(`duplicate: "${e.artist} - ${e.title}" (${file}) vs (${globalKeys.get(key)})`);
    }
    globalKeys.set(key, file);
  };

  for (const e of pre2000) check(e, 'pre2000.mjs');
  for (let y = 2000; y <= 2025; y++) {
    const rows = years[y];
    if (rows.length !== 100) throw new Error(`year ${y}: expected 100, got ${rows.length}`);
    for (const e of rows) {
      if (e.year !== y) throw new Error(`year ${y}: entry has year ${e.year}: ${e.artist} - ${e.title}`);
      check(e, `${y}.mjs`);
    }
  }

  if (pre2000.length !== 250) throw new Error(`pre2000: expected 250, got ${pre2000.length}`);
  for (let r = 1; r <= 250; r++) {
    if (!pre2000.some((x) => x.rank === r)) throw new Error(`pre2000: missing rank ${r}`);
  }
  for (let y = 2000; y <= 2025; y++) {
    for (let r = 1; r <= 100; r++) {
      if (!years[y].some((x) => x.rank === r)) throw new Error(`year ${y}: missing rank ${r}`);
    }
  }

  return globalKeys.size;
}

function writePre2000(rows) {
  const lines = rows.map(formatEntry).join(',\n');
  fs.writeFileSync(
    path.join(dataDir, 'pre2000.mjs'),
    `export const pre2000 = [\n${lines},\n];\n`,
    'utf8',
  );
}

function writeYear(y, rows) {
  const lines = rows.map(formatEntry).join(',\n');
  fs.writeFileSync(path.join(dataDir, `${y}.mjs`), `export default [\n${lines},\n];\n`, 'utf8');
}

// Assign ranks
const pre2000 = pre2000Tracks.map((t, i) => ({ ...t, rank: i + 1 }));
const years = {};
for (let y = 2000; y <= 2025; y++) {
  years[y] = yearTracks[y].map((t, i) => ({ ...t, rank: i + 1, year: y }));
}

const total = validateAll(pre2000, years);
fs.mkdirSync(dataDir, { recursive: true });
writePre2000(pre2000);
for (let y = 2000; y <= 2025; y++) writeYear(y, years[y]);
console.log(`Wrote 27 data modules, ${total} unique tracks.`);
