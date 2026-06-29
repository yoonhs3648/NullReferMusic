/**
 * kr-rap year source → data/YYYY.mjs
 * Run: node scripts/music-list-data-kr-rap/_gen/write-years.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { trackKey } from '../../music-list-shared.mjs';
import { YEAR_TRACKS } from './year-tracks.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');
const repoScripts = path.join(__dirname, '..', '..');

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

function esc(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

const exclude = loadExcludeKeys();
const globalKeys = new Map();

for (const [year, tracks] of Object.entries(YEAR_TRACKS)) {
  if (tracks.length !== 100) {
    throw new Error(`year ${year}: expected 100 tracks, got ${tracks.length}`);
  }
  const lines = ['export default ['];
  tracks.forEach((t, i) => {
    const rank = i + 1;
    const key = trackKey(t.artist, t.title);
    if (exclude.has(key)) {
      throw new Error(`cross-list overlap: ${t.artist} - ${t.title} (${year})`);
    }
    if (globalKeys.has(key)) {
      throw new Error(`duplicate: ${t.artist} - ${t.title} (${year}) vs ${globalKeys.get(key)}`);
    }
    globalKeys.set(key, year);
    const album = t.album ?? '';
    lines.push(
      `  { rank: ${rank}, year: ${year}, artist: "${esc(t.artist)}", title: "${esc(t.title)}", album: "${esc(album)}" },`,
    );
  });
  lines.push('];', '');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, `${year}.mjs`), lines.join('\n'), 'utf8');
}

console.log(`Wrote ${Object.keys(YEAR_TRACKS).length} year files, ${globalKeys.size} unique tracks.`);
