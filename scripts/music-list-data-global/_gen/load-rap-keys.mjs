import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { trackKey } from '../../music-list-shared.mjs';

const rapDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'music-list-data');
const keys = new Set();
const byKey = new Map();
for (const f of fs.readdirSync(rapDir).filter((x) => x.endsWith('.json'))) {
  for (const row of JSON.parse(fs.readFileSync(path.join(rapDir, f), 'utf8'))) {
    const k = trackKey(row.artist, row.title);
    keys.add(k);
    byKey.set(k, row);
  }
}
export { keys as rapKeys, byKey as rapByKey };
