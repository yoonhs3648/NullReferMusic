/**
 * Fetch Billboard year-end Hot 100 from Wikipedia, filter non-rap, dedupe vs rap JSON.
 * Run: node scripts/music-list-data-global/_gen/fetch-wiki-years.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { trackKey } from '../../music-list-shared.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const yearRawDir = path.join(__dirname, 'year-raw');
const rapDir = path.join(__dirname, '..', '..', 'music-list-data');

const RAP_ARTIST_RE =
  /\b(rap|hip hop|hip-hop|drill|grime|trap|mc\b|m\.c\.|feat\.|featuring|&)\b/i;
const RAP_TITLE_RE = /\b(freestyle|cypher|diss|mixtape)\b/i;
const KNOWN_RAP_ARTISTS = new Set(
  [
    'eminem', 'jay z', 'jay-z', 'kendrick lamar', 'drake', 'kanye west', 'ye',
    'lil', '50 cent', 'snoop', 'tupac', '2pac', 'notorious', 'nas', 'outkast',
    'nelly', 'ludacris', 'missy', 'ja rule', 'dmx', 'ice cube', 'wu-tang',
    'mobb deep', 'scarface', 'ugk', 'three 6 mafia', 'bone thugs', 'd12',
    'g unit', 'g-unit', 'fabolous', 'camron', 'cam\'ron', 'method man', 'redman',
    'ghostface', 'rza', 'gza', 'odb', 'mf doom', 'aesop rock', 'atmosphere',
    'del tha', 'deltron', 'black eyed peas', 'will.i.am', 'fugees', 'lauryn hill',
    'queen latifah', 'salt-n-pepa', 'run-dmc', 'run dmc', 'public enemy',
    'beastie boys', 'beastie', 'house of pain', 'cypress hill', 'onyx',
    'warren g', 'nate dogg', 'doggy', 'dogg', 'snoop dogg', 'snoop doggy',
    'lil wayne', 'lil kim', 'lil\' kim', 'lil jon', 'lil uzi', 'lil baby',
    'lil durk', 'lil nas', 'lil peep', 'lil tjay', 'lil tecca', 'lil yachty',
    'playboi carti', 'future', 'metro boomin', '21 savage', 'travis scott',
    'post malone', 'jack harlow', 'doja cat', 'megan thee', 'cardi b', 'nicki minaj',
    'tyler the creator', 'tyler, the creator', 'childish gambino', 'logic',
    'joyner lucas', 'j cole', 'j. cole', 'big sean', 'wiz khalifa', 'mac miller',
    'asap rocky', 'a$ap rocky', 'a$ap ferg', 'schoolboy q', 'schoolboy',
    'pusha t', 'clipse', 'french montana', 'migos', 'quavo', 'offset', 'takeoff',
    'gunna', 'young thug', 'youngboy', 'nba youngboy', 'polo g', 'pop smoke',
    'juice wrld', 'xxxtentacion', 'trippie redd', 'lil xan', 'soundcloud',
    'chief keef', 'fetty wap', 'desiigner', 'bobby shmurda', 'rowdy rebel',
    'city girls', 'saweetie', 'latto', 'glorilla', 'sexxy red', 'ice spice',
    'central cee', 'dave', 'stormzy', 'skepta', 'slowthai', 'little simz',
    'eve', 'foxxy brown', 'foxy brown', 'remy ma', 'trina', 'da brat',
    'krs-one', 'krs one', 'rakim', 'eric b', 'big daddy kane', 'spice 1',
    'too short', 'e-40', 'mac dre', '_andre 3000', 'big boi',
  ].map((s) => s.toLowerCase()),
);

function loadRapKeys() {
  const keys = new Set();
  for (const f of fs.readdirSync(rapDir).filter((x) => x.endsWith('.json'))) {
    for (const row of JSON.parse(fs.readFileSync(path.join(rapDir, f), 'utf8'))) {
      keys.add(trackKey(row.artist, row.title));
    }
  }
  return keys;
}

function isLikelyRap(artist, title) {
  const a = artist.toLowerCase();
  const t = title.toLowerCase();
  if (RAP_TITLE_RE.test(t)) return true;
  for (const token of KNOWN_RAP_ARTISTS) {
    if (a.includes(token)) return true;
  }
  // Lil prefix artists
  if (/\blil[\s'-]/i.test(a)) return true;
  // Featured rap collabs often in artist string
  if (/\b(feat\.|featuring|with)\b/i.test(a)) {
    const parts = a.split(/\b(feat\.|featuring|with)\b/i);
    for (const p of parts) {
      for (const token of KNOWN_RAP_ARTISTS) {
        if (p.includes(token)) return true;
      }
      if (/\blil[\s'-]/i.test(p)) return true;
    }
  }
  return false;
}

function stripHtml(s) {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\[[^\]]+\]/g, '')
    .trim();
}

async function fetchYear(year) {
  const url = `https://en.wikipedia.org/wiki/Billboard_Year-End_Hot_100_singles_of_${year}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'NullReferMusicBot/1.0 (music-list curation)' },
  });
  if (!res.ok) throw new Error(`fetch ${year}: ${res.status}`);
  const html = await res.text();
  const rows = [];
  // Parse wikitable rows: | N | "[Title]" | [Artist] |
  const rowRe =
    /\|\s*(\d+)\s*\|\s*"([^"]+)"\s*\|\s*(?:\[\[([^\]|]+)(?:\|[^\]]+)?\]\]|([^\|]+?))\s*\|/g;
  let m;
  while ((m = rowRe.exec(html)) !== null) {
    const rank = Number(m[1]);
    const title = stripHtml(m[2]);
    const artist = stripHtml(m[3] || m[4] || '').replace(/\[\[|\]\]/g, '');
    if (rank >= 1 && rank <= 100 && artist && title) {
      rows.push({ rank, artist, title, album: '' });
    }
  }
  if (rows.length < 80) {
    // fallback: simpler pattern
    const altRe = /\|\s*(\d+)\s*\|\s*"?([^"|]+)"?\s*\|\s*\[\[([^\]|]+)/g;
    rows.length = 0;
    while ((m = altRe.exec(html)) !== null) {
      const rank = Number(m[1]);
      const title = stripHtml(m[2]).replace(/^"|"$/g, '');
      const artist = stripHtml(m[3]);
      if (rank >= 1 && rank <= 100 && artist && title && !title.startsWith('http')) {
        rows.push({ rank, artist, title, album: '' });
      }
    }
  }
  return rows.sort((a, b) => a.rank - b.rank);
}

function esc(s) {
  return JSON.stringify(s);
}

async function main() {
  fs.mkdirSync(yearRawDir, { recursive: true });
  const rapKeys = loadRapKeys();
  const globalUsed = new Set();

  for (let year = 2000; year <= 2025; year++) {
    const chart = await fetchYear(year);
    if (chart.length < 50) throw new Error(`${year}: only parsed ${chart.length} wiki rows`);

    const picked = [];
    for (const row of chart) {
      if (picked.length >= 100) break;
      if (isLikelyRap(row.artist, row.title)) continue;
      const key = trackKey(row.artist, row.title);
      if (rapKeys.has(key)) continue;
      if (globalUsed.has(key)) continue;
      globalUsed.add(key);
      picked.push(`${row.artist}|${row.title}|${row.album}`);
    }

    // Fill from lower ranks / extras if needed
    if (picked.length < 100) {
      for (const row of chart) {
        if (picked.length >= 100) break;
        const key = trackKey(row.artist, row.title);
        if (rapKeys.has(key) || globalUsed.has(key)) continue;
        if (isLikelyRap(row.artist, row.title)) continue;
        globalUsed.add(key);
        picked.push(`${row.artist}|${row.title}|${row.album}`);
      }
    }

    if (picked.length < 100) {
      throw new Error(`${year}: only ${picked.length} non-rap tracks after filter (chart ${chart.length})`);
    }

    const body = picked.map((l) => `  ${esc(l)},`).join('\n');
    fs.writeFileSync(path.join(yearRawDir, `${year}.mjs`), `export default [\n${body}\n];\n`, 'utf8');
    console.log(`${year}: ${picked.length} tracks (wiki ${chart.length})`);
    await new Promise((r) => setTimeout(r, 300));
  }
  console.log(`Done. Global unique so far: ${globalUsed.size}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
