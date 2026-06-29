/**
 * 글로벌 랩/힙합 큐레이션 JSON → supabase/music_list_seed.sql
 *
 *   node scripts/generate-global-rap-music-list.mjs
 *
 * 입력: scripts/music-list-data/*.json (배열: { rank, year, artist, title, album? })
 * - year 2000~2025: 연도별 rank 1~100
 * - year <= 1999: ~2000 레거시 (rank 1~250+)
 * - album 생략/빈값 = 싱글
 * - genre는 스크립트에서 '글로벌 랩/힙합' 고정
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const dataDir = path.join(__dirname, 'music-list-data');
const outPath = path.join(repoRoot, 'supabase', 'music_list_seed.sql');
const GENRE = '글로벌 랩/힙합';

function sqlStr(v) {
  if (v === null || v === undefined) return "''";
  return `'${String(v).replace(/'/g, "''")}'`;
}

function sqlInt(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`invalid number: ${v}`);
  return String(Math.trunc(n));
}

function trackKey(artist, title) {
  const norm = (s) =>
    String(s ?? '')
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  return `${norm(artist)}|${norm(title)}`;
}

function loadAllEntries() {
  if (!fs.existsSync(dataDir)) {
    throw new Error(`data dir missing: ${dataDir}`);
  }
  const files = fs
    .readdirSync(dataDir)
    .filter((f) => f.endsWith('.json'))
    .sort();
  if (files.length === 0) {
    throw new Error(`no JSON in ${dataDir}`);
  }
  const all = [];
  for (const f of files) {
    const raw = JSON.parse(fs.readFileSync(path.join(dataDir, f), 'utf8'));
    if (!Array.isArray(raw)) throw new Error(`${f}: expected array`);
    for (const row of raw) {
      all.push({ ...row, _source: f });
    }
  }
  return all;
}

function validate(entries) {
  const globalKeys = new Map();
  const byYear = new Map();

  for (const e of entries) {
    const rank = Number(e.rank);
    const year = Number(e.year);
    const artist = String(e.artist ?? '').trim();
    const title = String(e.title ?? '').trim();
    const album = e.album == null ? '' : String(e.album).trim();

    if (!artist || !title) {
      throw new Error(`missing artist/title in ${e._source}: ${JSON.stringify(e)}`);
    }
    if (!Number.isFinite(rank) || rank < 1) {
      throw new Error(`invalid rank: ${artist} - ${title}`);
    }
    if (!Number.isFinite(year) || year < 1900 || year > 2025) {
      throw new Error(`invalid year ${year}: ${artist} - ${title}`);
    }

    const key = trackKey(artist, title);
    if (globalKeys.has(key)) {
      const prev = globalKeys.get(key);
      throw new Error(
        `duplicate track globally: "${artist} - ${title}" (${e._source}) vs (${prev._source}) year ${prev.year} vs ${year}`,
      );
    }
    globalKeys.set(key, { ...e, artist, title, album, rank, year });

    if (!byYear.has(year)) byYear.set(year, []);
    byYear.get(year).push({ rank, artist, title, album, year, _source: e._source });
  }

  for (let y = 2000; y <= 2025; y++) {
    const rows = byYear.get(y) ?? [];
    if (rows.length !== 100) {
      throw new Error(`year ${y}: expected 100 tracks, got ${rows.length}`);
    }
    const ranks = new Set(rows.map((r) => r.rank));
    for (let r = 1; r <= 100; r++) {
      if (!ranks.has(r)) throw new Error(`year ${y}: missing rank ${r}`);
    }
  }

  const legacy = [...byYear.entries()]
    .filter(([y]) => y <= 1999)
    .flatMap(([, rows]) => rows);
  if (legacy.length < 200) {
    throw new Error(`legacy (~2000): expected >= 200, got ${legacy.length}`);
  }
  const legacyRanks = new Set(legacy.map((r) => r.rank));
  for (let r = 1; r <= Math.min(200, legacy.length); r++) {
    if (!legacyRanks.has(r)) {
      throw new Error(`legacy: missing rank ${r}`);
    }
  }

  return [...globalKeys.values()].sort((a, b) => {
    if (a.year !== b.year) return b.year - a.year;
    return a.rank - b.rank;
  });
}

function main() {
  const entries = validate(loadAllEntries());
  const lines = [
    '-- Discover nrm_music_list seed (글로벌 랩/힙합 큐레이션)',
    `-- 생성: node scripts/generate-global-rap-music-list.mjs`,
    `-- 행 수: ${entries.length}`,
    'BEGIN;',
    'TRUNCATE public.nrm_music_list RESTART IDENTITY CASCADE;',
    '',
  ];

  for (const e of entries) {
    lines.push(
      `INSERT INTO public.nrm_music_list (rank, year, artist, title, album, genre) VALUES (${sqlInt(e.rank)}, ${sqlInt(e.year)}, ${sqlStr(e.artist)}, ${sqlStr(e.title)}, ${sqlStr(e.album)}, ${sqlStr(GENRE)});`,
    );
  }

  lines.push('', 'COMMIT;', '');
  fs.writeFileSync(outPath, lines.join('\n'), 'utf8');
  console.log(`OK: ${entries.length} rows → ${outPath}`);
}

main();
