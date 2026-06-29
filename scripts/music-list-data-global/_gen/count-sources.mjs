import fs from 'node:fs';
import path from 'node:path';
import { trackKey } from '../../music-list-shared.mjs';

const rapDir = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')), '..', '..', 'music-list-data');
const rap = new Set();
for (const f of fs.readdirSync(rapDir).filter((x) => x.endsWith('.json'))) {
  for (const r of JSON.parse(fs.readFileSync(path.join(rapDir, f), 'utf8'))) rap.add(trackKey(r.artist, r.title));
}

const KNOWN_RAP = ['eminem', 'jay z', 'jay-z', 'kendrick', 'drake', 'kanye', 'lil ', "lil'", 'nelly', 'ludacris', 'missy', 'ja rule', 'outkast', 'mystikal', 'trick daddy', 'lil romeo', "qb's finest", 'eve feat', 'murder remix', '50 cent', 'snoop', '2pac', 'nas', 'dmx', 'fabolous', "cam'ron", 'method man', 'redman', 'wu-tang', 'three 6', 'playboi carti', 'future', 'metro boomin', '21 savage', 'travis scott', 'post malone', 'jack harlow', 'megan thee', 'cardi b', 'nicki minaj', 'j. cole', 'j cole', 'lil wayne', 'lil kim', "lil' kim", 'lil uzi', 'lil baby', 'bad bunny', 'chief keef', 'asap', 'pusha t', 'clipse', 'migos', 'gunna', 'young thug', 'polo g', 'pop smoke', 'juice wrld', 'xxxtentacion', 'macklemore', 'yung gravy', 'latto', 'glorilla', 'sexxy red', 'ice spice', 'tommy richman'];

function isRap(a, t) {
  const x = `${a} ${t}`.toLowerCase();
  return KNOWN_RAP.some((k) => x.includes(k)) || /murder remix/i.test(t);
}

function decodeHtml(s) {
  return s
    .replace(/&#8217;/g, "'")
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/<[^>]+>/g, '')
    .trim();
}

function parseBillboardHtml(html) {
  const rows = [];
  const trRe = /<tr>\s*<td>(\d+)<\/td>\s*<td[^>]*>([^<]*)<\/td>\s*<td>([^<]*)<\/td>\s*<\/tr>/gi;
  let m;
  while ((m = trRe.exec(html)) !== null) {
    rows.push({ rank: Number(m[1]), artist: decodeHtml(m[2]), title: decodeHtml(m[3]) });
  }
  return rows;
}

function parseWikiHtml(html) {
  const rows = [];
  const rowRe = /<tr>\s*<td>(\d+)<\/td>\s*<td>[\s\S]*?<\/td>\s*<td>([\s\S]*?)<\/td>\s*<td>([\s\S]*?)<\/td>\s*<\/tr>/gi;
  let m;
  while ((m = rowRe.exec(html)) !== null) {
    const rank = Number(m[1]);
    const title = decodeHtml(m[2]).replace(/^"|"$/g, '');
    const artist = decodeHtml(m[3]);
    if (rank >= 1 && rank <= 100 && artist && title) rows.push({ rank, artist, title });
  }
  return rows;
}

async function fetchBillboardTop100Of(year) {
  for (const suf of [`${year}-2/`, `${year}/`]) {
    const res = await fetch(`https://billboardtop100of.com/${suf}`, { headers: { 'User-Agent': 'NullReferMusic/1.0' } });
    if (!res.ok) continue;
    const rows = parseBillboardHtml(await res.text());
    if (rows.length >= 90) return rows;
  }
  return [];
}

async function fetchWiki(year) {
  const title = encodeURIComponent(`Billboard_Year-End_Hot_100_singles_of_${year}`);
  const url = `https://en.wikipedia.org/w/api.php?action=parse&page=${title}&prop=text&format=json`;
  const res = await fetch(url, { headers: { 'User-Agent': 'NullReferMusic/1.0' } });
  if (!res.ok) return [];
  const j = await res.json();
  if (!j.parse?.text?.['*']) return [];
  return parseWikiHtml(j.parse.text['*']);
}

async function fetchYear(year) {
  const bb = await fetchBillboardTop100Of(year);
  if (bb.length >= 90) return bb;
  const wiki = await fetchWiki(year);
  if (wiki.length >= 90) return wiki;
  throw new Error(`no source for ${year}: bb=${bb.length} wiki=${wiki.length}`);
}

for (let y = 2000; y <= 2025; y++) {
  const chart = await fetchYear(y);
  let ok = 0;
  for (const row of chart) {
    if (!isRap(row.artist, row.title) && !rap.has(trackKey(row.artist, row.title))) ok++;
  }
  console.log(`${y}: chart=${chart.length} nonrap=${ok}`);
  await new Promise((r) => setTimeout(r, 200));
}
