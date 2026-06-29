/**
 * Build year-raw/*.mjs from Billboard (billboardtop100of + Wikipedia API),
 * exclude rap JSON overlaps + primary hip-hop, backfill from supplements.
 * Run: node scripts/music-list-data-global/_gen/fetch-billboard-years.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { trackKey } from '../../music-list-shared.mjs';
import { SUPPLEMENT } from './supplements.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const yearRawDir = path.join(__dirname, 'year-raw');
const rapDir = path.join(__dirname, '..', '..', 'music-list-data');

const PRIMARY_RAP = [
  'eminem', 'jay-z', 'jay z', 'kendrick lamar', 'drake', 'kanye west', 'lil wayne',
  "lil' wayne", 'lil kim', "lil' kim", 'lil jon', 'lil uzi vert', 'lil baby', 'lil durk',
  'lil nas x', '50 cent', 'snoop dogg', 'snoop doggy', 'tupac', '2pac', 'the notorious b.i.g',
  'nas', 'outkast', 'outkast', 'nelly', 'ludacris', 'missy elliott', 'missy "misdemeanor" elliott',
  'ja rule', 'dmx', 'ice cube', 'wu-tang clan', 'mobb deep', 'ugk', 'three 6 mafia',
  'bone thugs-n-harmony', 'd12', 'g-unit', 'fabolous', "cam'ron", 'method man', 'redman',
  'ghostface killah', 'mf doom', 'run-d.m.c', 'run-dmc', 'public enemy', 'beastie boys',
  'cypress hill', 'playboi carti', 'future', 'metro boomin', '21 savage', 'travis scott',
  'post malone', 'jack harlow', 'megan thee stallion', 'cardi b', 'nicki minaj',
  'j. cole', 'j cole', 'big sean', 'wiz khalifa', 'mac miller', 'asap rocky', 'a$ap rocky',
  'pusha t', 'clipse', 'migos', 'gunna', 'young thug', 'polo g', 'pop smoke', 'juice wrld',
  'xxxtentacion', 'chief keef', 'fetty wap', 'desiigner', 'macklemore', 'macklemore & ryan lewis',
  'bad bunny', 'latto', 'glorilla', 'sexxy red', 'ice spice', 'tommy richman', 'yung gravy',
  'central cee', 'dave', 'stormzy', 'skepta', 'lil romeo', 'lil bow wow', 'qb\'s finest',
  'trick daddy', 'mystikal', 'city high', 'doctrine', 'yung lean',
];

function loadRapKeys() {
  const keys = new Set();
  for (const f of fs.readdirSync(rapDir).filter((x) => x.endsWith('.json'))) {
    for (const row of JSON.parse(fs.readFileSync(path.join(rapDir, f), 'utf8'))) {
      keys.add(trackKey(row.artist, row.title));
    }
  }
  return keys;
}

function decodeHtml(s) {
  return s
    .replace(/&#8217;/g, "'")
    .replace(/&#8216;/g, "'")
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/<[^>]+>/g, '')
    .replace(/\[[^\]]*\]/g, '')
    .trim();
}

function isPrimaryHipHop(artist, title) {
  const a = decodeHtml(artist).toLowerCase();
  const t = decodeHtml(title).toLowerCase();
  if (/murder remix/i.test(t)) return true;
  for (const name of PRIMARY_RAP) {
    if (a === name || a.startsWith(`${name} `) || a.startsWith(`${name} feat`) || a.includes(`${name} featuring`)) {
      return true;
    }
  }
  if (/^lil[\s'-]/i.test(a.split(/\bfeat/i)[0])) return true;
  return false;
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
  const trRe = /<tr>\s*<td[^>]*>(\d+)[\s\S]*?<\/td>\s*<td>([\s\S]*?)<\/td>\s*<td>([\s\S]*?)<\/td>\s*<\/tr>/gi;
  let m;
  while ((m = trRe.exec(html)) !== null) {
    const rank = Number(m[1]);
    if (rank < 1 || rank > 100) continue;
    const title = decodeHtml(m[2]).replace(/^["']|["']$/g, '');
    const artist = decodeHtml(m[3]);
    if (artist && title) rows.push({ rank, artist, title });
  }
  return rows.sort((a, b) => a.rank - b.rank);
}

async function fetchBillboardTop100Of(year) {
  for (const suf of [`${year}-2/`, `${year}/`]) {
    const res = await fetch(`https://billboardtop100of.com/${suf}`, {
      headers: { 'User-Agent': 'NullReferMusic/1.0' },
    });
    if (!res.ok) continue;
    const rows = parseBillboardHtml(await res.text());
    if (rows.length >= 90) return rows;
  }
  return [];
}

async function fetchWiki(year) {
  const page = encodeURIComponent(`Billboard_Year-End_Hot_100_singles_of_${year}`);
  const url = `https://en.wikipedia.org/w/api.php?action=parse&page=${page}&prop=text&format=json`;
  const res = await fetch(url, { headers: { 'User-Agent': 'NullReferMusic/1.0' } });
  if (!res.ok) return [];
  const j = await res.json();
  if (!j.parse?.text?.['*']) return [];
  return parseWikiHtml(j.parse.text['*']);
}

async function fetchYearChart(year) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const bb = await fetchBillboardTop100Of(year);
    if (bb.length >= 90) return bb;
    await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
    const wiki = await fetchWiki(year);
    if (wiki.length >= 90) return wiki;
    await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
  }
  const bb = await fetchBillboardTop100Of(year);
  if (bb.length >= 90) return bb;
  const wiki = await fetchWiki(year);
  if (wiki.length >= 90) return wiki;
  throw new Error(`no chart source for ${year} (bb=${bb.length}, wiki=${wiki.length})`);
}

function esc(s) {
  return JSON.stringify(s);
}

function tryAdd(picked, row, rapKeys, globalUsed) {
  if (picked.length >= 100) return false;
  const artist = row.artist.trim();
  const title = row.title.trim();
  if (!artist || !title) return false;
  const key = trackKey(artist, title);
  if (rapKeys.has(key) || globalUsed.has(key)) return false;
  globalUsed.add(key);
  picked.push({ artist, title, album: row.album ?? '' });
  return true;
}

function loadExistingYearRaw(year) {
  const p = path.join(yearRawDir, `${year}.mjs`);
  if (!fs.existsSync(p)) return null;
  const lines = fs.readFileSync(p, 'utf8').match(/"([^"]+)"/g);
  if (!lines || lines.length !== 100) return null;
  return lines.map((line) => {
    const [artist, title, album = ''] = line.slice(1, -1).split('|');
    return { artist, title, album };
  });
}

function ingestExisting(picked, rows, rapKeys, globalUsed) {
  for (const row of rows) tryAdd(picked, row, rapKeys, globalUsed);
}

async function main() {
  fs.mkdirSync(yearRawDir, { recursive: true });
  const rapKeys = loadRapKeys();
  const globalUsed = new Set();

  for (let year = 2000; year <= 2025; year++) {
    const existing = loadExistingYearRaw(year);
    if (existing) {
      ingestExisting([], existing, rapKeys, globalUsed);
      console.log(`${year}: skip (existing ${existing.length})`);
      continue;
    }

    const chart = await fetchYearChart(year);
    const picked = [];

    for (const row of chart) tryAdd(picked, row, rapKeys, globalUsed);

    const extras = [...(SUPPLEMENT[year] ?? [])];
    for (let yy = 2000; yy <= 2025; yy++) {
      if (yy === year) continue;
      extras.push(...(SUPPLEMENT[yy] ?? []));
    }
    for (const row of extras) {
      if (picked.length >= 100) break;
      tryAdd(picked, row, rapKeys, globalUsed);
    }

    if (picked.length < 100) {
      throw new Error(`${year}: only ${picked.length} tracks (chart ${chart.length}, supplement ${extras.length})`);
    }

    const body = picked
      .slice(0, 100)
      .map((r) => `  ${esc(`${r.artist}|${r.title}|${r.album}`)},`)
      .join('\n');
    fs.writeFileSync(path.join(yearRawDir, `${year}.mjs`), `export default [\n${body}\n];\n`, 'utf8');
    console.log(`${year}: ${picked.length} tracks`);
    await new Promise((r) => setTimeout(r, 400));
  }
  console.log(`Done: ${globalUsed.size} unique tracks`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
