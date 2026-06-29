/**
 * GitHub data/*.json → supabase/seed.sql
 *   node scripts/generate-supabase-seed.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const outPath = path.join(repoRoot, 'supabase', 'seed.sql');

function sqlStr(v) {
  if (v === null || v === undefined) return 'NULL';
  return `'${String(v).replace(/'/g, "''")}'`;
}

function sqlDate(v) {
  const s = String(v ?? '').trim();
  if (!s) return 'NULL';
  return `'${s}'::date`;
}

function sqlTimestamptz(v) {
  const s = String(v ?? '').trim();
  if (!s) return 'NULL';
  return `'${s}'::timestamptz`;
}

function readJson(rel) {
  const p = path.join(repoRoot, rel);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

const lines = [
  '-- NullReferMusic Supabase seed (GitHub JSON 마이그레이션)',
  '-- 생성: node scripts/generate-supabase-seed.mjs',
  'BEGIN;',
  '',
  'TRUNCATE public.nrm_apk_version, public.nrm_alarm, public.nrm_user_ban_list, public.nrm_inquiry, public.nrm_user_list RESTART IDENTITY CASCADE;',
  '',
];

const apkVersion = readJson('data/apkVersion.json');
lines.push(
  `INSERT INTO public.nrm_apk_version (version, created_date) VALUES (${sqlStr(apkVersion.version)}, ${sqlTimestamptz(apkVersion.createdDate)});`,
  '',
);

const alarm = readJson('data/alarm.json');
for (const row of alarm.alarm ?? []) {
  lines.push(
    `INSERT INTO public.nrm_alarm (id, is_noti, title, content, serial_no, alarm_date) VALUES (${row.id}, ${row.isNoti === true}, ${sqlStr(row.title)}, ${sqlStr(row.content)}, ${sqlStr(row.SerialNo ?? '')}, ${sqlDate(row.date)});`,
  );
}
lines.push('');

const ban = readJson('data/userBanList.json');
for (const row of ban.userBanList ?? []) {
  lines.push(
    `INSERT INTO public.nrm_user_ban_list (id, user_name, serial_no, content, is_banned, ban_date) VALUES (${row.id}, ${sqlStr(row.userName)}, ${sqlStr(row.SerialNo)}, ${sqlStr(row.content)}, ${row.isBanned === true}, ${sqlDate(row.date)});`,
  );
}
lines.push('');

const inquiry = readJson('data/inquiry.json');
for (const row of inquiry.inquiry ?? []) {
  lines.push(
    `INSERT INTO public.nrm_inquiry (id, user_name, serial_no, version, content, attached_file, is_answered, reply_content, created_date) VALUES (${row.id}, ${sqlStr(row.userName)}, ${sqlStr(row.SerialNo)}, ${sqlStr(row.version)}, ${sqlStr(row.content)}, ${sqlStr(row.attachedFile ?? '')}, ${row.isAnswered === true}, ${sqlStr(row.replyContent ?? '')}, ${sqlTimestamptz(row.Createddate)});`,
  );
}
lines.push('');

const userList = readJson('data/custom-apk/userList.json');
for (const row of userList.userList ?? []) {
  const deviceId =
    row.deviceId === null || row.deviceId === undefined ? 'NULL' : sqlStr(row.deviceId);
  const lastAccess = row.lastAccessDate ? sqlTimestamptz(row.lastAccessDate) : 'NULL';
  lines.push(
    `INSERT INTO public.nrm_user_list (id, app_name, user_name, serial_no, version, created_date, device_id, last_access_date) VALUES (${row.id}, ${sqlStr(row.appName)}, ${sqlStr(row.userName)}, ${sqlStr(row.SerialNo)}, ${sqlStr(row.version)}, ${sqlDate(row.Createddate)}, ${deviceId}, ${lastAccess});`,
  );
}

lines.push('');
lines.push('-- IDENTITY 시퀀스 동기화');
lines.push("SELECT setval(pg_get_serial_sequence('public.nrm_alarm', 'id'), COALESCE((SELECT MAX(id) FROM public.nrm_alarm), 1));");
lines.push("SELECT setval(pg_get_serial_sequence('public.nrm_user_ban_list', 'id'), COALESCE((SELECT MAX(id) FROM public.nrm_user_ban_list), 1));");
lines.push("SELECT setval(pg_get_serial_sequence('public.nrm_inquiry', 'id'), COALESCE((SELECT MAX(id) FROM public.nrm_inquiry), 1));");
lines.push("SELECT setval(pg_get_serial_sequence('public.nrm_user_list', 'id'), COALESCE((SELECT MAX(id) FROM public.nrm_user_list), 1));");
lines.push('COMMIT;');
lines.push('');

fs.writeFileSync(outPath, lines.join('\n'), 'utf8');
console.log(`Wrote ${outPath}`);
