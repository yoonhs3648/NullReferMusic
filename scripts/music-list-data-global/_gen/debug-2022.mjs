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

function parseWiki(html) {
  const rows = [];
  const trRe = /<tr>\s*<td[^>]*>(\d+)[\s\S]*?<\/td>\s*<td>([\s\S]*?)<\/td>\s*<td>([\s\S]*?)<\/td>\s*<\/tr>/gi;
  let m;
  while ((m = trRe.exec(html)) !== null) {
    rows.push({ artist: dec(m[3]), title: dec(m[2]).replace(/^"|"$/g, '') });
  }
  return rows;
}

const globalUsed = new Set();
for (let y = 2000; y < 2022; y++) {
  const p = path.join('scripts/music-list-data-global/_gen/year-raw', `${y}.mjs`);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, 'utf8').match(/"([^"]+)"/g) ?? []) {
    const [a, t] = line.slice(1, -1).split('|');
    globalUsed.add(trackKey(a, t));
  }
}

const page = encodeURIComponent('Billboard_Year-End_Hot_100_singles_of_2022');
const j = await (await fetch(`https://en.wikipedia.org/w/api.php?action=parse&page=${page}&prop=text&format=json`, { headers: { 'User-Agent': 'NRM/1' } })).json();
const chart = parseWiki(j.parse.text['*']);
let ok = 0;
const miss = [];
for (const r of chart) {
  const k = trackKey(r.artist, r.title);
  if (rap.has(k)) miss.push(['rap', r]);
  else if (globalUsed.has(k)) miss.push(['dup', r]);
  else ok++;
}
console.log('2022 chart', chart.length, 'ok', ok, 'miss', miss.length);
console.log('sample miss', miss.slice(0, 10));
