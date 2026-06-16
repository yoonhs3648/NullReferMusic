/**
 * data/nrm-music-quotes.xlsx (또는 .csv) → app/lib/nrmMusicQuotes.generated.ts
 *
 * 사용법:
 *   npm run generate:music-quotes
 *
 * Excel에서 data/nrm-music-quotes.xlsx 를 수정한 뒤 위 명령을 실행하고 APK를 빌드하면
 * 명언이 반영됩니다. xlsx가 없으면 csv를 읽습니다.
 *
 * 릴리스 APK: npm run android:release / NullReferMusic-Build-Release-Apk.bat 가
 * assembleRelease 직전에 이 스크립트를 자동 실행합니다 (preandroid:release).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const csvPath = path.join(repoRoot, 'data/nrm-music-quotes.csv');
const xlsxPath = path.join(repoRoot, 'data/nrm-music-quotes.xlsx');
const outPath = path.join(repoRoot, 'app/lib/nrmMusicQuotes.generated.ts');

const COLUMNS = ['nameKo', 'nameEn', 'years', 'quoteEn', 'quoteKo'];

function parseCsvLine(line) {
  const fields = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ',') {
      fields.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  fields.push(cur);
  return fields;
}

function parseCsv(text) {
  const raw = text.replace(/^\uFEFF/, '');
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const header = parseCsvLine(lines[0]);
  const idx = Object.fromEntries(COLUMNS.map((c) => [c, header.indexOf(c)]));
  for (const c of COLUMNS) {
    if (idx[c] < 0) throw new Error(`CSV 헤더에 ${c} 열이 없습니다.`);
  }
  const rows = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cols = parseCsvLine(lines[i]);
    const row = Object.fromEntries(
      COLUMNS.map((c) => [c, (cols[idx[c]] ?? '').trim()]),
    );
    if (!row.quoteEn && !row.quoteKo) continue;
    rows.push(row);
  }
  return rows;
}

function readRowsFromCsv() {
  if (!fs.existsSync(csvPath)) {
    throw new Error(`CSV 없음: ${csvPath}`);
  }
  return parseCsv(fs.readFileSync(csvPath, 'utf8'));
}

async function loadXlsx() {
  const mod = await import('xlsx');
  return mod.default ?? mod;
}

async function readRowsFromXlsx() {
  const XLSX = await loadXlsx();
  const wb = XLSX.readFile(xlsxPath);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const json = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  return json
    .map((r) =>
      Object.fromEntries(COLUMNS.map((c) => [c, String(r[c] ?? '').trim()])),
    )
    .filter((r) => r.quoteEn || r.quoteKo);
}

async function writeXlsxFromRows(rows) {
  const XLSX = await loadXlsx();
  const ws = XLSX.utils.json_to_sheet(rows, { header: COLUMNS });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'quotes');
  XLSX.writeFile(wb, xlsxPath);
}

function refineQuoteEn(en) {
  let s = en.trim();
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    s = s.slice(1, -1).trim();
  }
  return s.replace(/\s+/g, ' ').replace(/\s+([,.;:!?])/g, '$1');
}

function refineQuoteKo(ko) {
  return ko
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/ 것이다\./g, '다.')
    .replace(/있는 것이 아니라/g, '있지 않고')
    .replace(/하는 것이 아니라/g, '하는 일이 아니라');
}

function refineRows(rows) {
  return rows.map((r) => ({
    ...r,
    quoteEn: refineQuoteEn(r.quoteEn),
    quoteKo: refineQuoteKo(r.quoteKo),
  }));
}

function escTs(s) {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function emitTs(rows) {
  const body = rows
    .map(
      (r) =>
        `  { nameKo: '${escTs(r.nameKo)}', nameEn: '${escTs(r.nameEn)}', years: '${escTs(r.years)}', quoteEn: '${escTs(r.quoteEn)}', quoteKo: '${escTs(r.quoteKo)}' },`,
    )
    .join('\n');
  return `/** 자동 생성 — data/nrm-music-quotes.xlsx|.csv 수정 후 npm run generate:music-quotes */\n\nexport type NrmMusicQuoteEntry = {\n  nameKo: string;\n  nameEn: string;\n  years: string;\n  quoteEn: string;\n  quoteKo: string;\n};\n\nexport const NRM_MUSIC_QUOTES: readonly NrmMusicQuoteEntry[] = [\n${body}\n] as const;\n`;
}

async function main() {
  const syncExcel = process.argv.includes('--sync-excel');
  let rows;

  if (syncExcel) {
    rows = readRowsFromCsv();
    await writeXlsxFromRows(rows);
    console.log(`Wrote ${rows.length} rows → ${xlsxPath}`);
  } else if (fs.existsSync(xlsxPath)) {
    rows = await readRowsFromXlsx();
    console.log(`Read ${rows.length} rows from ${xlsxPath}`);
  } else {
    rows = readRowsFromCsv();
    console.log(`Read ${rows.length} rows from ${csvPath}`);
    await writeXlsxFromRows(rows);
    console.log(`Created ${xlsxPath}`);
  }

  fs.writeFileSync(outPath, emitTs(refineRows(rows)), 'utf8');
  console.log(`Wrote ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
