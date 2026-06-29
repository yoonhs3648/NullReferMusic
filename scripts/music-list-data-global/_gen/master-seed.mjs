/**
 * Write data/*.mjs from year-raw/*.mjs + pre2000-raw.mjs
 * Run after: node scripts/music-list-data-global/_gen/fetch-billboard-years.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { trackKey } from '../../music-list-shared.mjs';
import PRE2000_RAW from './pre2000-raw.mjs';

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

function parseLines(lines) {
  return lines
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const [artist, title, album = ''] = line.split('|');
      if (!artist || !title) throw new Error(`bad line: ${line}`);
      return { artist: artist.trim(), title: title.trim(), album: album.trim() };
    });
}

function parsePre2000Lines(lines) {
  return lines
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const [yearStr, artist, title, album = ''] = line.split('|');
      const year = Number(yearStr);
      if (!Number.isFinite(year) || year < 1960 || year > 1999) throw new Error(`bad year line: ${line}`);
      if (!artist || !title) throw new Error(`bad line: ${line}`);
      return { year, artist: artist.trim(), title: title.trim(), album: album.trim() };
    });
}

function esc(s) {
  return JSON.stringify(s);
}

function writeDefault(filePath, rows) {
  const body = rows
    .map(
      (t) =>
        `  { rank: ${t.rank}, year: ${t.year}, artist: ${esc(t.artist)}, title: ${esc(t.title)}, album: ${esc(t.album)} },`,
    )
    .join('\n');
  fs.writeFileSync(filePath, `export default [\n${body}\n];\n`, 'utf8');
}

function writePre2000(filePath, rows) {
  const body = rows
    .map(
      (t) =>
        `  { rank: ${t.rank}, year: ${t.year}, artist: ${esc(t.artist)}, title: ${esc(t.title)}, album: ${esc(t.album)} },`,
    )
    .join('\n');
  fs.writeFileSync(filePath, `export const pre2000 = [\n${body}\n];\n`, 'utf8');
}

async function main() {
  fs.mkdirSync(dataDir, { recursive: true });
  const rapKeys = loadRapKeys();
  const globalKeys = new Map();

  const check = (artist, title, ctx) => {
    const key = trackKey(artist, title);
    if (rapKeys.has(key)) throw new Error(`rap overlap [${ctx}]: ${artist} - ${title}`);
    if (globalKeys.has(key)) {
      throw new Error(`global dup [${ctx}]: ${artist} - ${title} (was ${globalKeys.get(key)})`);
    }
    globalKeys.set(key, ctx);
  };

  const preParsed = parsePre2000Lines(PRE2000_RAW.slice(0, 150));
  if (preParsed.length !== 150) throw new Error(`pre2000: expected 150, got ${preParsed.length}`);

  const pre2000Rows = preParsed.map((t, i) => {
    check(t.artist, t.title, `pre2000#${i + 1}`);
    return { rank: i + 1, year: t.year, artist: t.artist, title: t.title, album: t.album };
  });
  writePre2000(path.join(dataDir, 'pre2000.mjs'), pre2000Rows);

  for (let y = 2000; y <= 2025; y++) {
    const raw = (await import(`./year-raw/${y}.mjs`)).default;
    const parsed = parseLines(raw);
    if (parsed.length !== 100) throw new Error(`year ${y}: expected 100, got ${parsed.length}`);
    const rows = parsed.map((t, i) => {
      check(t.artist, t.title, `${y}#${i + 1}`);
      return { rank: i + 1, year: y, artist: t.artist, title: t.title, album: t.album };
    });
    writeDefault(path.join(dataDir, `${y}.mjs`), rows);
  }

  console.log(`Wrote 27 files → ${dataDir} (${globalKeys.size} tracks, rap pool ${rapKeys.size})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
