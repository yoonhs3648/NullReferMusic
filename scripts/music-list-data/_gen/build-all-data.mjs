/**
 * Builds all 27 data/*.mjs modules.
 * Run: node scripts/music-list-data/_gen/build-all-data.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRE2000_TRACKS } from './pre2000-clean.mjs';
import { YEAR_DATA } from './year-data.mjs';

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

function fmt(t) {
  const album = t.album == null ? '' : String(t.album);
  return `  { rank: ${t.rank}, year: ${t.year}, artist: ${JSON.stringify(t.artist)}, title: ${JSON.stringify(t.title)}, album: ${JSON.stringify(album)} }`;
}

function dedupe(tracks) {
  const seen = new Set();
  const out = [];
  for (const t of tracks) {
    const k = trackKey(t.artist, t.title);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

function assignRanks(tracks, year) {
  return tracks.map((t, i) => ({ ...t, rank: i + 1, year: year ?? t.year }));
}

function main() {
  fs.mkdirSync(dataDir, { recursive: true });
  const globalKeys = new Map();

  const check = (t, file) => {
    const k = trackKey(t.artist, t.title);
    if (globalKeys.has(k)) {
      throw new Error(`duplicate "${t.artist} - ${t.title}" in ${file} vs ${globalKeys.get(k)}`);
    }
    globalKeys.set(k, file);
  };

  let pre2000 = dedupe(PRE2000_TRACKS).slice(0, 250);
  if (pre2000.length !== 250) {
    throw new Error(`pre2000: need 250 unique tracks, got ${pre2000.length}`);
  }
  pre2000 = assignRanks(pre2000);
  for (const t of pre2000) check(t, 'pre2000.mjs');
  fs.writeFileSync(
    path.join(dataDir, 'pre2000.mjs'),
    `export const pre2000 = [\n${pre2000.map(fmt).join(',\n')},\n];\n`,
    'utf8',
  );

  for (let y = 2000; y <= 2025; y++) {
    let rows = dedupe(YEAR_DATA[y] ?? []);
    if (rows.length !== 100) {
      throw new Error(`year ${y}: need 100 unique tracks, got ${rows.length}`);
    }
    rows = assignRanks(rows, y);
    for (const t of rows) check(t, `${y}.mjs`);
    fs.writeFileSync(
      path.join(dataDir, `${y}.mjs`),
      `export default [\n${rows.map(fmt).join(',\n')},\n];\n`,
      'utf8',
    );
  }

  console.log(`Created 27 modules, ${globalKeys.size} unique tracks.`);
}

main();
