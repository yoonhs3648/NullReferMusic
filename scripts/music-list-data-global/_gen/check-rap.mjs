import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { trackKey } from '../../music-list-shared.mjs';

const rapDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'music-list-data');
const rap = new Set();
for (const f of fs.readdirSync(rapDir).filter((x) => x.endsWith('.json'))) {
  for (const row of JSON.parse(fs.readFileSync(path.join(rapDir, f), 'utf8'))) {
    rap.add(trackKey(row.artist, row.title));
  }
}

const candidates = process.argv.slice(2);
for (const line of candidates) {
  const [artist, title] = line.split('|');
  const k = trackKey(artist, title);
  console.log(rap.has(k) ? 'RAP' : 'OK ', `${artist} - ${title}`);
}
