/**
 * Bootstrap kr-rap year source files from compact TSV (year|artist|title|album).
 * Run: node scripts/music-list-data-kr-rap/_gen/bootstrap-from-tsv.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { trackKey } from '../../music-list-shared.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tsvPath = path.join(__dirname, 'all-tracks.tsv');
const yearsDir = path.join(__dirname, 'years');

function loadExcludeKeys() {
  const keys = new Set();
  const repoScripts = path.join(__dirname, '..', '..');
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

function esc(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

const exclude = loadExcludeKeys();
const byYear = new Map();
const globalKeys = new Map();

for (const line of fs.readFileSync(tsvPath, 'utf8').split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const parts = trimmed.split('|');
  if (parts.length < 4) throw new Error(`bad line: ${line}`);
  const year = Number(parts[0]);
  const artist = parts[1].trim();
  const title = parts[2].trim();
  const album = parts.slice(3).join('|').trim();
  const key = trackKey(artist, title);
  if (exclude.has(key)) throw new Error(`cross-list: ${artist} - ${title}`);
  if (globalKeys.has(key)) throw new Error(`dup: ${artist} - ${title} (${year}) vs ${globalKeys.get(key)}`);
  globalKeys.set(key, year);
  if (!byYear.has(year)) byYear.set(year, []);
  byYear.get(year).push({ artist, title, album });
}

fs.mkdirSync(yearsDir, { recursive: true });
for (let y = 2010; y <= 2025; y++) {
  const tracks = byYear.get(y) ?? [];
  if (tracks.length !== 100) throw new Error(`year ${y}: expected 100, got ${tracks.length}`);
  const lines = ['export default ['];
  for (const t of tracks) {
    lines.push(
      `  { artist: "${esc(t.artist)}", title: "${esc(t.title)}", album: "${esc(t.album)}" },`,
    );
  }
  lines.push('];', '');
  fs.writeFileSync(path.join(yearsDir, `${y}.mjs`), lines.join('\n'), 'utf8');
}

console.log(`Bootstrap OK: ${globalKeys.size} tracks across ${byYear.size} years.`);
