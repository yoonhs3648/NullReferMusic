#!/usr/bin/env node
/**
 * admin APK(SerialNo varchar="admin") → LLMUserPermission 시드.
 * 대상: LLMProvider 중 IsActive=true 이고 ModelName 이 지정된 2종.
 *
 * LLMUserPermission.SerialNo 는 varchar — 앱 SerialNo 원문("admin")을 그대로 저장한다.
 * (과거엔 bigint 여서 "admin" → 0 으로 매핑했었음. 더 이상 형 변환하지 않음)
 *
 * 환경변수:
 *   NRM_SUPABASE_SERVICE_ROLE_KEY — 있으면 PostgREST 직접 upsert
 *
 * RPC(nrm_rpc_admin_upsert_llm_user_permissions) 없으면
 * supabase/seed_llm_admin_permissions.sql 생성 후 종료 코드 2.
 */
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(join(dirname(fileURLToPath(import.meta.url)), '..', 'app', 'package.json'));
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://bwkiaapffroyveqqjhom.supabase.co';
const PUBLISHABLE_KEY = 'sb_publishable_NJwirVJ8KPm8ricLz6hBUQ_20SwCMoi';
const ADMIN_CALLER_SERIAL = 'admin';
/** LLMUserPermission.SerialNo(varchar) — admin APK 원문 그대로 */
const ADMIN_LLM_SERIAL_NO = 'admin';
/** 0 = 무제한 (LLMProvider DailyLimit/MonthlyLimit 과 동일 규칙) */
const UNLIMITED_ALLOCATED_TOKEN = 0;

const TARGET_MODELS = ['models/gemini-2.5-flash', 'models/gemini-embedding-2'];

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const sqlOutPath = join(repoRoot, 'supabase', 'seed_llm_admin_permissions.sql');

const PROVIDER_SELECT =
  'ProviderID,ModelName,ModelDisplayName,Type,IsActive';

function buildPermissionRows(providers) {
  const now = new Date().toISOString();
  return providers.map((p) => ({
    SerialNo: ADMIN_LLM_SERIAL_NO,
    ProviderID: p.ProviderID,
    IsApproved: true,
    AllocatedToken: UNLIMITED_ALLOCATED_TOKEN,
    ApprovedDate: now,
  }));
}

function buildInsertSql(providers) {
  const lines = [
    '-- admin APK LLMUserPermission 시드 (SerialNo=\'admin\', varchar)',
    '-- 생성: node scripts/seed-llm-admin-permissions.mjs',
    '-- AllocatedToken=0 → 무제한',
    '',
  ];
  for (const p of providers) {
    lines.push(
      `INSERT INTO public."LLMUserPermission" ("SerialNo","ProviderID","IsApproved","AllocatedToken","ApprovedDate")`,
      `SELECT '${ADMIN_LLM_SERIAL_NO}', p."ProviderID", true, ${UNLIMITED_ALLOCATED_TOKEN}, now()`,
      `FROM public."LLMProvider" p`,
      `WHERE p."ModelName" = '${p.ModelName.replace(/'/g, "''")}' AND p."IsActive" = true`,
      `ON CONFLICT ("SerialNo","ProviderID") DO UPDATE SET`,
      `  "IsApproved" = EXCLUDED."IsApproved",`,
      `  "AllocatedToken" = EXCLUDED."AllocatedToken",`,
      `  "ApprovedDate" = EXCLUDED."ApprovedDate",`,
      `  "UpdateDate" = now();`,
      '',
    );
  }
  return lines.join('\n');
}

async function fetchActiveTargetProviders(sb) {
  const { data, error } = await sb
    .from('LLMProvider')
    .select(PROVIDER_SELECT)
    .eq('IsActive', true)
    .in('ModelName', TARGET_MODELS);
  if (error) throw new Error(error.message);
  const rows = Array.isArray(data) ? data : [];
  if (rows.length !== TARGET_MODELS.length) {
    const found = new Set(rows.map((r) => r.ModelName));
    const missing = TARGET_MODELS.filter((m) => !found.has(m));
    throw new Error(`LLMProvider active row missing: ${missing.join(', ')}`);
  }
  return rows.sort((a, b) => a.ModelName.localeCompare(b.ModelName));
}

async function upsertViaServiceRole(rows, serviceRoleKey) {
  const sb = createClient(SUPABASE_URL, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const providers = await fetchActiveTargetProviders(sb);
  const permissions = buildPermissionRows(providers);
  const { error } = await sb.from('LLMUserPermission').upsert(permissions, {
    onConflict: 'SerialNo,ProviderID',
  });
  if (error) throw new Error(`upsert failed: ${error.message}`);
  return { providers, permissions };
}

async function upsertViaAdminRpc(rows) {
  const sb = createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const providers = await fetchActiveTargetProviders(sb);
  const permissions = buildPermissionRows(providers);
  const { error } = await sb.rpc('nrm_rpc_admin_upsert_llm_user_permissions', {
    p_caller_serial: ADMIN_CALLER_SERIAL,
    p_rows: permissions,
  });
  if (error) throw new Error(`RPC failed: ${error.message}`);
  return { providers, permissions };
}

async function main() {
  const serviceRoleKey = process.env.NRM_SUPABASE_SERVICE_ROLE_KEY?.trim();

  try {
    let result;
    if (serviceRoleKey) {
      console.log('Upserting via service_role...');
      result = await upsertViaServiceRole(null, serviceRoleKey);
    } else {
      console.log('Upserting via admin RPC...');
      result = await upsertViaAdminRpc();
    }
    for (const p of result.providers) {
      console.log(`OK: ${p.ModelDisplayName} (${p.ModelName}) ProviderID=${p.ProviderID}`);
    }
    console.log(`OK: ${result.permissions.length} LLMUserPermission rows for admin SerialNo=${ADMIN_LLM_SERIAL_NO}`);
    return;
  } catch (e) {
    console.warn(String(e));
  }

  const sb = createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  let providers;
  try {
    providers = await fetchActiveTargetProviders(sb);
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  }

  writeFileSync(sqlOutPath, buildInsertSql(providers), 'utf8');
  console.error(`자동 INSERT 불가. SQL 생성: ${sqlOutPath}`);
  console.error('Supabase Dashboard → SQL Editor에서 실행하거나 service_role/RPC 마이그레이션 후 재실행.');
  process.exit(2);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
