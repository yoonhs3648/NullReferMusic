import fs from 'node:fs';
import path from 'node:path';
import { trackKey } from '../../music-list-shared.mjs';

const rapDir = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')), '..', '..', 'music-list-data');
const rap = new Set();
for (const f of fs.readdirSync(rapDir).filter((x) => x.endsWith('.json'))) {
  for (const r of JSON.parse(fs.readFileSync(path.join(rapDir, f), 'utf8'))) rap.add(trackKey(r.artist, r.title));
}

const KNOWN_RAP = ['eminem', 'jay z', 'jay-z', 'kendrick', 'drake', 'kanye', 'lil ', "lil'", 'nelly', 'ludacris', 'missy', 'ja rule', 'outkast', 'mystikal', 'trick daddy', 'lil romeo', "qb's finest", 'eve feat', 'murder remix', '50 cent', 'snoop', '2pac', 'nas', 'dmx', 'fabolous', "cam'ron", 'method man', 'redman', 'wu-tang', 'three 6', 'playboi carti', 'future', 'metro boomin', '21 savage', 'travis scott', 'post malone', 'jack harlow', 'megan thee', 'cardi b', 'nicki minaj', 'j. cole', 'j cole', 'lil wayne', 'lil kim', "lil' kim", 'lil uzi', 'lil baby', 'bad bunny', 'chief keef', 'asap', 'pusha t', 'clipse', 'migos', 'gunna', 'young thug', 'polo g', 'pop smoke', 'juice wrld', 'xxxtentacion'];

function isRap(a, t) {
  const x = `${a} ${t}`.toLowerCase();
  return KNOWN_RAP.some((k) => x.includes(k)) || /murder remix/i.test(t);
}

function decodeHtml(s) {
  return s.replace(/&#8217;/g, "'").replace(/<[^>]+>/g, '').trim();
}

async function count(y) {
  const r = await fetch(`https://billboardtop100of.com/${y}-2/`);
  const html = await r.text();
  const trRe = /<tr>\s*<td>(\d+)<\/td>\s*<td[^>]*>([^<]*)<\/td>\s*<td>([^<]*)<\/td>\s*<\/tr>/gi;
  let m;
  let c = 0;
  let ok = 0;
  while ((m = trRe.exec(html)) !== null) {
    c++;
    const artist = decodeHtml(m[2]);
    const title = decodeHtml(m[3]);
    if (!isRap(artist, title) && !rap.has(trackKey(artist, title))) ok++;
  }
  return { c, ok };
}

for (let y = 2000; y <= 2025; y++) {
  const { c, ok } = await count(y);
  console.log(`${y}: ${ok} non-rap of ${c}`);
  await new Promise((r) => setTimeout(r, 200));
}
