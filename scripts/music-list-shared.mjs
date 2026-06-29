import fs from 'node:fs';
import path from 'node:path';

/** music_list 큐레이션 공통 — 트랙 키·검증 */
export function trackKey(artist, title) {
  const norm = (s) =>
    String(s ?? '')
      .toLowerCase()
      .normalize('NFKC')
      .replace(/&/g, ' and ')
      .replace(/\bfeat\.?\b|\bft\.?\b|\bfeaturing\b/g, ' ')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim()
      .replace(/\s+/g, ' ');
  return `${norm(artist)}|${norm(title)}`;
}

export function sqlStr(v) {
  if (v === null || v === undefined) return "''";
  return `'${String(v).replace(/'/g, "''")}'`;
}

export function sqlInt(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`invalid number: ${v}`);
  return String(Math.trunc(n));
}

/**
 * @param {Array<{rank,year,artist,title,album?,genre,_source?}>} entries
 * @param {{ genre: string, yearMin?: number, yearMax?: number, legacyMin?: number, legacyRankMax?: number }} opts
 */
export function validateGenreEntries(entries, opts) {
  const {
    genre,
    yearMin = 2000,
    yearMax = 2025,
    legacyMin = 100,
    legacyRankMax = 100,
  } = opts;
  const byYear = new Map();

  for (const e of entries) {
    const rank = Number(e.rank);
    const year = Number(e.year);
    const artist = String(e.artist ?? '').trim();
    const title = String(e.title ?? '').trim();
    const album = e.album == null ? '' : String(e.album).trim();

    if (!artist || !title) {
      throw new Error(`[${genre}] missing artist/title: ${JSON.stringify(e)}`);
    }
    if (!Number.isFinite(rank) || rank < 1) {
      throw new Error(`[${genre}] invalid rank: ${artist} - ${title}`);
    }
    if (!Number.isFinite(year) || year < 1900 || year > 2025) {
      throw new Error(`[${genre}] invalid year ${year}: ${artist} - ${title}`);
    }

    if (!byYear.has(year)) byYear.set(year, []);
    byYear.get(year).push({ rank, year, artist, title, album, genre, _source: e._source });
  }

  for (let y = yearMin; y <= yearMax; y++) {
    const rows = byYear.get(y) ?? [];
    if (rows.length !== 100) {
      throw new Error(`[${genre}] year ${y}: expected 100, got ${rows.length}`);
    }
    for (let r = 1; r <= 100; r++) {
      if (!rows.some((x) => x.rank === r)) {
        throw new Error(`[${genre}] year ${y}: missing rank ${r}`);
      }
    }
  }

  if (legacyMin > 0) {
    const legacy = [...byYear.entries()]
      .filter(([y]) => y <= 1999)
      .flatMap(([, rows]) => rows);
    if (legacy.length < legacyMin) {
      throw new Error(`[${genre}] legacy: expected >= ${legacyMin}, got ${legacy.length}`);
    }
    for (let r = 1; r <= legacyRankMax; r++) {
      if (!legacy.some((x) => x.rank === r)) {
        throw new Error(`[${genre}] legacy: missing rank ${r}`);
      }
    }
  }

  return entries.map((e) => ({
    rank: Number(e.rank),
    year: Number(e.year),
    artist: String(e.artist).trim(),
    title: String(e.title).trim(),
    album: e.album == null ? '' : String(e.album).trim(),
    genre,
  }));
}

export function loadJsonDir(dir) {
  if (!dir || !fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
  const all = [];
  for (const f of files) {
    const raw = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    if (!Array.isArray(raw)) throw new Error(`${f}: expected array`);
    for (const row of raw) all.push({ ...row, _source: f });
  }
  return all;
}
