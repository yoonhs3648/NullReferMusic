import fs from 'node:fs';
import path from 'node:path';
import { trackKey } from '../../music-list-shared.mjs';

const rapDir = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')), '..', '..', 'music-list-data');
const rap = new Set();
for (const f of fs.readdirSync(rapDir).filter((x) => x.endsWith('.json'))) {
  for (const r of JSON.parse(fs.readFileSync(path.join(rapDir, f), 'utf8'))) rap.add(trackKey(r.artist, r.title));
}

function dec(s) {
  return s.replace(/&#8217;/g, "'").replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').trim();
}

async function bb(y) {
  const t = await (await fetch(`https://billboardtop100of.com/${y}-2/`)).text();
  const trRe = /<tr>\s*<td>(\d+)<\/td>\s*<td[^>]*>([^<]*)<\/td>\s*<td>([^<]*)<\/td>\s*<\/tr>/gi;
  let m;
  let ok = 0;
  while ((m = trRe.exec(t)) !== null) {
    if (!rap.has(trackKey(dec(m[2]), dec(m[3])))) ok++;
  }
  return ok;
}

for (let y = 2000; y <= 2012; y++) {
  console.log(y, await bb(y));
  await new Promise((r) => setTimeout(r, 150));
}
