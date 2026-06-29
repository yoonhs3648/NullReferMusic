/**
 * music_list 시드 SQL 생성 — 글로벌 랩/힙합 + 글로벌 + 한국 랩/힙합 (전 테이블 트랙 유일)
 *
 *   node scripts/generate-music-list-seed.mjs
 *
 * 사전: node scripts/music-list-data/build.mjs
 *       node scripts/music-list-data-global/build.mjs
 *       node scripts/music-list-data-kr-rap/build.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  trackKey,
  sqlStr,
  sqlInt,
  validateGenreEntries,
  loadJsonDir,
} from './music-list-shared.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const rapDir = path.join(__dirname, 'music-list-data');
const globalDir = path.join(__dirname, 'music-list-data-global');
const krRapDir = path.join(__dirname, 'music-list-data-kr-rap');
const outPath = path.join(repoRoot, 'supabase', 'music_list_seed.sql');

const GENRE_RAP = '글로벌 랩/힙합';
const GENRE_GLOBAL = '글로벌';
const GENRE_KR_RAP = '한국 랩/힙합';

function main() {
  const rapRaw = loadJsonDir(rapDir).map((e) => ({ ...e, genre: GENRE_RAP }));
  const globalRaw = loadJsonDir(globalDir).map((e) => ({ ...e, genre: GENRE_GLOBAL }));
  const krRapRaw = loadJsonDir(krRapDir).map((e) => ({ ...e, genre: GENRE_KR_RAP }));

  const rap = validateGenreEntries(rapRaw, {
    genre: GENRE_RAP,
    legacyMin: 200,
    legacyRankMax: 200,
  });
  const global = validateGenreEntries(globalRaw, {
    genre: GENRE_GLOBAL,
    legacyMin: 100,
    legacyRankMax: 100,
  });
  const krRap = validateGenreEntries(krRapRaw, {
    genre: GENRE_KR_RAP,
    yearMin: 2010,
    yearMax: 2025,
    legacyMin: 0,
    legacyRankMax: 0,
  });

  const allKeys = new Map();
  const merged = [];
  for (const e of [...rap, ...global, ...krRap]) {
    const key = trackKey(e.artist, e.title);
    if (allKeys.has(key)) {
      const prev = allKeys.get(key);
      throw new Error(
        `cross-genre duplicate: "${e.artist} - ${e.title}" (${e.genre}) vs (${prev.genre})`,
      );
    }
    allKeys.set(key, e);
    merged.push(e);
  }

  merged.sort((a, b) => {
    if (a.genre !== b.genre) return a.genre.localeCompare(b.genre, 'ko');
    if (a.year !== b.year) return b.year - a.year;
    return a.rank - b.rank;
  });

  const lines = [
    '-- Discover nrm_music_list seed',
    `-- 생성: node scripts/generate-music-list-seed.mjs`,
    `-- ${GENRE_RAP}: ${rap.length} | ${GENRE_GLOBAL}: ${global.length} | ${GENRE_KR_RAP}: ${krRap.length} | total: ${merged.length}`,
    'BEGIN;',
    'TRUNCATE public.nrm_music_list RESTART IDENTITY CASCADE;',
    '',
  ];

  for (const e of merged) {
    lines.push(
      `INSERT INTO public.nrm_music_list (rank, year, artist, title, album, genre) VALUES (${sqlInt(e.rank)}, ${sqlInt(e.year)}, ${sqlStr(e.artist)}, ${sqlStr(e.title)}, ${sqlStr(e.album)}, ${sqlStr(e.genre)});`,
    );
  }

  lines.push('', 'COMMIT;', '');
  fs.writeFileSync(outPath, lines.join('\n'), 'utf8');
  console.log(
    `OK: ${merged.length} rows (${GENRE_RAP} ${rap.length}, ${GENRE_GLOBAL} ${global.length}, ${GENRE_KR_RAP} ${krRap.length}) → ${outPath}`,
  );
}

main();
