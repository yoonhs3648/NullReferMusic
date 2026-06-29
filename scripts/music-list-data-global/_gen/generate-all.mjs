/**
 * Generate global music list .mjs files from curated year data.
 * Run: node scripts/music-list-data-global/_gen/generate-all.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { trackKey } from '../../music-list-shared.mjs';
import { PRE2000 } from './sources/pre2000.mjs';
import { YEAR_DATA } from './sources/year-data.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');
const rapDir = path.join(__dirname, '..', '..', 'music-list-data');

function loadRapKeys() {
  const keys = new Set();
  for (const f of fs.readdirSync(rapDir).filter((x) => x.endsWith('.json'))) {
    for (const row of JSON.parse(fs.readFileSync(path.join(rapDir, f), 'utf8'))) {
      keys.add(trackKey(row.artist, row.title));
    }
  }
  return keys;
}

function esc(s) {
  return JSON.stringify(s);
}

function writeMjsDefault(filePath, rows) {
  const lines = rows.map(
    (t) =>
      `  { rank: ${t.rank}, year: ${t.year}, artist: ${esc(t.artist)}, title: ${esc(t.title)}, album: ${esc(t.album ?? '')} },`,
  );
  fs.writeFileSync(filePath, `export default [\n${lines.join('\n')}\n];\n`, 'utf8');
}

function writePre2000(filePath, rows) {
  const lines = rows.map(
    (t) =>
      `  { rank: ${t.rank}, year: ${t.year}, artist: ${esc(t.artist)}, title: ${esc(t.title)}, album: ${esc(t.album ?? '')} },`,
  );
  fs.writeFileSync(filePath, `export const pre2000 = [\n${lines.join('\n')}\n];\n`, 'utf8');
}

function main() {
  fs.mkdirSync(dataDir, { recursive: true });
  const rapKeys = loadRapKeys();
  const globalKeys = new Map();

  const check = (artist, title, ctx) => {
    const key = trackKey(artist, title);
    if (rapKeys.has(key)) throw new Error(`rap overlap [${ctx}]: ${artist} - ${title}`);
    if (globalKeys.has(key)) {
      const prev = globalKeys.get(key);
      throw new Error(`global dup [${ctx}]: ${artist} - ${title} vs ${prev}`);
    }
    globalKeys.set(key, ctx);
  };

  const pre2000Rows = PRE2000.map((t, i) => {
    check(t.artist, t.title, `pre2000#${i + 1}`);
    return { rank: i + 1, year: t.year, artist: t.artist, title: t.title, album: t.album ?? '' };
  });
  if (pre2000Rows.length !== 150) throw new Error(`pre2000: expected 150, got ${pre2000Rows.length}`);
  writePre2000(path.join(dataDir, 'pre2000.mjs'), pre2000Rows);

  for (let y = 2000; y <= 2025; y++) {
    const src = YEAR_DATA[y];
    if (!src || src.length !== 100) throw new Error(`year ${y}: expected 100 source tracks, got ${src?.length ?? 0}`);
    const rows = src.map((t, i) => {
      check(t.artist, t.title, `${y}#${i + 1}`);
      return { rank: i + 1, year: y, artist: t.artist, title: t.title, album: t.album ?? '' };
    });
    writeMjsDefault(path.join(dataDir, `${y}.mjs`), rows);
  }

  console.log(`Generated ${27} .mjs files, ${globalKeys.size} unique global tracks, rap exclude ${rapKeys.size}.`);
}

main();
