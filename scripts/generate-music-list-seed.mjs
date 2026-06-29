/**
 * musicList.xlsx → supabase/music_list_seed.sql
 *   node scripts/generate-music-list-seed.mjs [xlsxPath]
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const require = createRequire(path.join(repoRoot, 'app/package.json'));
const XLSX = require('xlsx');
const defaultXlsx = 'C:\\Users\\hsyoon\\Desktop\\musicList.xlsx';
const xlsxPath = process.argv[2] ? path.resolve(process.argv[2]) : defaultXlsx;
const outPath = path.join(repoRoot, 'supabase', 'music_list_seed.sql');

function sqlStr(v) {
  if (v === null || v === undefined) return "''";
  return `'${String(v).replace(/'/g, "''")}'`;
}

function sqlInt(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`invalid number: ${v}`);
  return String(Math.trunc(n));
}

if (!fs.existsSync(xlsxPath)) {
  console.error(`xlsx not found: ${xlsxPath}`);
  process.exit(1);
}

const wb = XLSX.readFile(xlsxPath);
const ws = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
const header = rows[0];
const expected = ['Seq', '순위', '연도', '아티스트', '노래', '앨범', '장르'];
for (let i = 0; i < expected.length; i++) {
  if (String(header[i] ?? '').trim() !== expected[i]) {
    console.error('unexpected header', header, 'expected', expected);
    process.exit(1);
  }
}

const lines = [
  '-- Discover nrm_music_list seed',
  `-- 생성: node scripts/generate-music-list-seed.mjs`,
  `-- 원본: ${xlsxPath}`,
  'BEGIN;',
  'TRUNCATE public.nrm_music_list RESTART IDENTITY CASCADE;',
  '',
];

let count = 0;
for (let r = 1; r < rows.length; r++) {
  const row = rows[r];
  if (!row || row.every((c) => String(c ?? '').trim() === '')) continue;
  const [_seq, rank, year, artist, title, album, genre] = row;
  if (!rank && !artist && !title) continue;
  lines.push(
    `INSERT INTO public.nrm_music_list (rank, year, artist, title, album, genre) VALUES (${sqlInt(rank)}, ${sqlInt(year)}, ${sqlStr(artist)}, ${sqlStr(title)}, ${sqlStr(album)}, ${sqlStr(genre)});`,
  );
  count += 1;
}

lines.push('', 'COMMIT;', '');
fs.writeFileSync(outPath, lines.join('\n'), 'utf8');
console.log(`OK: ${count} rows → ${outPath}`);
