#!/usr/bin/env node
/**
 * admin APK(SerialNo="admin") → LLMProvider(제공자) 전체에 대해 LLMUserPermission upsert.
 * 정규화 후 Permission은 모델이 아니라 **제공자** 단위다.
 *
 * 환경변수: 없음(publishable key + admin RPC).
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
const UNLIMITED_ALLOCATED_TOKEN = 0;

async function main() {
  const sb = createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: providers, error: selectError } = await sb
    .from('LLMProvider')
    .select('ProviderID,ProviderName')
    .order('ProviderID', { ascending: true });
  if (selectError) throw new Error(`LLMProvider select failed: ${selectError.message}`);
  if (!providers || providers.length === 0) throw new Error('LLMProvider 테이블에 행이 없습니다.');

  const now = new Date().toISOString();
  const rows = providers.map((p) => ({
    SerialNo: ADMIN_LLM_SERIAL_NO,
    ProviderID: p.ProviderID,
    IsApproved: true,
    AllocatedToken: UNLIMITED_ALLOCATED_TOKEN,
    ApprovedDate: now,
  }));

  const { error } = await sb.rpc('nrm_rpc_admin_upsert_llm_user_permissions', {
    p_caller_serial: ADMIN_CALLER_SERIAL,
    p_rows: rows,
  });
  if (error) throw new Error(`RPC failed: ${error.message}`);

  for (const p of providers) {
    console.log(`OK: ${p.ProviderName} ProviderID=${p.ProviderID}`);
  }
  console.log(`OK: ${rows.length} LLMUserPermission rows for admin (provider-level, unlimited)`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
