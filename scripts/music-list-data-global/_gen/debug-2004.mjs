import fs from 'node:fs';
import path from 'node:path';
import { trackKey } from '../../music-list-shared.mjs';
import { SUPPLEMENT } from './supplements.mjs';

const rapDir = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')), '..', '..', 'music-list-data');
const rap = new Set();
for (const f of fs.readdirSync(rapDir).filter((x) => x.endsWith('.json'))) {
  for (const r of JSON.parse(fs.readFileSync(path.join(rapDir, f), 'utf8'))) rap.add(trackKey(r.artist, r.title));
}

function dec(s) {
  return s.replace(/&#8217;/g, "'").replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').trim();
}

async function chart(y) {
  const t = await (await fetch(`https://billboardtop100of.com/${y}-2/`)).text();
  const trRe = /<tr>\s*<td>(\d+)<\/td>\s*<td[^>]*>([^<]*)<\/td>\s*<td>([^<]*)<\/td>\s*<\/tr>/gi;
  const rows = [];
  let m;
  while ((m = trRe.exec(t)) !== null) rows.push({ artist: dec(m[2]), title: dec(m[3]) });
  return rows;
}

const globalUsed = new Set();
for (let y = 2000; y < 2004; y++) {
  const raw = fs.readFileSync(path.join('scripts/music-list-data-global/_gen/year-raw', `${y}.mjs`), 'utf8');
  for (const line of raw.match(/"([^"]+)"/g) ?? []) {
    const s = line.slice(1, -1);
    const [a, t] = s.split('|');
    globalUsed.add(trackKey(a, t));
  }
}

const y = 2004;
const rows = await chart(y);
let ok = 0;
const blocked = [];
for (const r of rows) {
  const k = trackKey(r.artist, r.title);
  if (rap.has(k)) blocked.push(['rap', r]);
  else if (globalUsed.has(k)) blocked.push(['dup', r]);
  else ok++;
}
console.log('2004 chart ok', ok, 'blocked', blocked.length);
console.log('supplement avail', (SUPPLEMENT[2004] ?? []).filter((r) => !rap.has(trackKey(r.artist, r.title)) && !globalUsed.has(trackKey(r.artist, r.title))).length);
