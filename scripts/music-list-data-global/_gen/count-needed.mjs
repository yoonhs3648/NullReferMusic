/** Resume fetch from 2022+; count chart picks per year */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { trackKey } from '../../music-list-shared.mjs';
import { SUPPLEMENT } from './supplements.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const yearRawDir = path.join(__dirname, 'year-raw');
const rapDir = path.join(__dirname, '..', '..', 'music-list-data');

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

const rap = new Set();
for (const f of fs.readdirSync(rapDir).filter((x) => x.endsWith('.json'))) {
  for (const r of JSON.parse(fs.readFileSync(path.join(rapDir, f), 'utf8'))) {
    rap.add(trackKey(r.artist, r.title));
  }
}

const globalUsed = new Set();
for (let y = 2000; y <= 2025; y++) {
  const p = path.join(yearRawDir, `${y}.mjs`);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, 'utf8').match(/"([^"]+)"/g) ?? []) {
    const [a, t] = line.slice(1, -1).split('|');
    globalUsed.add(trackKey(a, t));
  }
}

for (const year of [2022, 2023, 2024, 2025]) {
  const page = encodeURIComponent(`Billboard_Year-End_Hot_100_singles_of_${year}`);
  const j = await (
    await fetch(`https://en.wikipedia.org/w/api.php?action=parse&page=${page}&prop=text&format=json`, {
      headers: { 'User-Agent': 'NullReferMusic/1.0' },
    })
  ).json();
  const chart = parseWiki(j.parse.text['*']);
  let ok = 0;
  for (const r of chart) {
    const k = trackKey(r.artist, r.title);
    if (!rap.has(k) && !globalUsed.has(k)) ok++;
  }
  const sup = (SUPPLEMENT[year] ?? []).filter(
    (r) => !rap.has(trackKey(r.artist, r.title)) && !globalUsed.has(trackKey(r.artist, r.title)),
  );
  console.log(`${year}: chart ok=${ok} sup=${sup.length} total=${ok + sup.length} need=${100 - ok - sup.length}`);
  await new Promise((r) => setTimeout(r, 300));
}
