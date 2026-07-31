/**
 * Apply 20260730170000_llm_call_attempt_log_function_calls.sql via psql if NRM_SUPABASE_DATABASE_URL set.
 * Usage: node scripts/apply-llm-call-attempt-log-function-calls.mjs
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sqlPath = join(
  root,
  'supabase/migrations/20260730170000_llm_call_attempt_log_function_calls.sql',
);
const url = process.env.NRM_SUPABASE_DATABASE_URL;
if (!url) {
  console.error('NRM_SUPABASE_DATABASE_URL 이 없습니다. Dashboard SQL Editor에서 마이그레이션 파일을 실행하세요.');
  console.error(sqlPath);
  process.exit(1);
}
const r = spawnSync('psql', [url, '-v', 'ON_ERROR_STOP=1', '-f', sqlPath], { stdio: 'inherit' });
process.exit(r.status ?? 1);
