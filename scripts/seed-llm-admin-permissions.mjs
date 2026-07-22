#!/usr/bin/env node
/**
 * admin → ProviderID=1(Google) LLMUserPermission 시드 (무제한).
 * 정규화 후 Permission은 제공자 단위 — 모델별 시드는 더 이상 하지 않는다.
 * 전체 제공자 시드는 seed-llm-admin-permissions-all.mjs 사용.
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(join(dirname(fileURLToPath(import.meta.url)), '..', 'app', 'package.json'));
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://bwkiaapffroyveqqjhom.supabase.co';
const PUBLISHABLE_KEY = 'sb_publishable_NJwirVJ8KPm8ricLz6hBUQ_20SwCMoi';
const ADMIN_CALLER_SERIAL = 'admin';
const ADMIN_LLM_SERIAL_NO = 'admin';
const GOOGLE_PROVIDER_ID = 1;
const UNLIMITED_ALLOCATED_TOKEN = 0;

async function main() {
  const sb = createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const now = new Date().toISOString();
  const { error } = await sb.rpc('nrm_rpc_admin_upsert_llm_user_permissions', {
    p_caller_serial: ADMIN_CALLER_SERIAL,
    p_rows: [
      {
        SerialNo: ADMIN_LLM_SERIAL_NO,
        ProviderID: GOOGLE_PROVIDER_ID,
        IsApproved: true,
        AllocatedToken: UNLIMITED_ALLOCATED_TOKEN,
        ApprovedDate: now,
      },
    ],
  });
  if (error) throw new Error(error.message);
  console.log(`OK: admin permission for ProviderID=${GOOGLE_PROVIDER_ID} (unlimited)`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
