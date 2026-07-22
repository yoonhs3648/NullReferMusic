#!/usr/bin/env node
/**
 * LLMUserPermission.SerialNo 값 정정: 과거 bigint 시절 admin=0 으로 들어간 행을
 * varchar 전환 후 'admin' 문자열로 고친다.
 *
 * 환경변수:
 *   NRM_SUPABASE_SERVICE_ROLE_KEY — 있으면 PostgREST 직접 UPDATE 실행
 *
 * 서비스 롤 키가 없으면 supabase/seed_llm_admin_permissions.sql (UPDATE 포함)을
 * Supabase Dashboard → SQL Editor에서 직접 실행하라는 안내만 출력하고 종료 코드 2.
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(join(dirname(fileURLToPath(import.meta.url)), '..', 'app', 'package.json'));
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://bwkiaapffroyveqqjhom.supabase.co';

async function main() {
  const serviceRoleKey = process.env.NRM_SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!serviceRoleKey) {
    console.error('NRM_SUPABASE_SERVICE_ROLE_KEY 미설정 — 직접 실행 불가.');
    console.error('supabase/seed_llm_admin_permissions.sql 하단 UPDATE 문을 Supabase Dashboard → SQL Editor에서 실행하세요.');
    process.exit(2);
  }

  const sb = createClient(SUPABASE_URL, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await sb
    .from('LLMUserPermission')
    .update({ SerialNo: 'admin', UpdateDate: new Date().toISOString() })
    .eq('SerialNo', '0')
    .select('PermissionID,SerialNo,ProviderID');

  if (error) {
    console.error(`UPDATE 실패: ${error.message}`);
    process.exit(1);
  }

  const rows = Array.isArray(data) ? data : [];
  if (rows.length === 0) {
    console.log('OK: SerialNo=\'0\'인 LLMUserPermission 행이 없습니다 (이미 정정됨 또는 대상 없음).');
    return;
  }
  for (const row of rows) {
    console.log(`OK: PermissionID=${row.PermissionID} ProviderID=${row.ProviderID} → SerialNo='admin'`);
  }
  console.log(`OK: ${rows.length}건 정정 완료.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
