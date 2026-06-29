/**
 * Master catalog → years/*.mjs + data/*.mjs
 * Run: node scripts/music-list-data-kr-rap/_gen/gen-catalog.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { trackKey } from '../../music-list-shared.mjs';
import { CATALOG } from './catalog-data.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const yearsDir = path.join(__dirname, 'years');
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

for (const [yearStr, tracks] of Object.entries(CATALOG)) {
  const year = Number(yearStr);
  if (tracks.length !== 100) throw new Error(`year ${year}: expected 100, got ${tracks.length}`);

  const dataLines = ['export default ['];

  tracks.forEach((t, i) => {
    const rank = i + 1;
    const artist = Array.isArray(t) ? t[0] : t.artist;
    const title = Array.isArray(t) ? t[1] : t.title;
    const album = Array.isArray(t) ? (t[2] ?? '') : (t.album ?? '');
    const key = trackKey(artist, title);
    if (exclude.has(key)) throw new Error(`cross-list: ${artist} - ${title} (${year})`);
    if (globalKeys.has(key)) {
      throw new Error(`dup: ${artist} - ${title} (${year}) vs ${globalKeys.get(key)}`);
    }
    globalKeys.set(key, year);
    dataLines.push(
      `  { rank: ${rank}, year: ${year}, artist: "${esc(artist)}", title: "${esc(title)}", album: "${esc(album)}" },`,
    );
  });
  dataLines.push('];', '');

  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, `${year}.mjs`), dataLines.join('\n'), 'utf8');
}

console.log(`Catalog OK: ${globalKeys.size} tracks, ${Object.keys(CATALOG).length} years.`);
