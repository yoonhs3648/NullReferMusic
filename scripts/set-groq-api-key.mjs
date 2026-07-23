#!/usr/bin/env node
/**
 * Groq LLMProvider.ApiKey 설정 (마이그레이션에 키를 넣지 않기 위함).
 *
 * 환경변수:
 *   GROQ_API_KEY — 필수
 *   NRM_SUPABASE_SERVICE_ROLE_KEY — 필수 (ApiKey 컬럼은 anon에 REVOKE)
 *
 * 예:
 *   $env:GROQ_API_KEY='gsk_...'; $env:NRM_SUPABASE_SERVICE_ROLE_KEY='...'; node scripts/set-groq-api-key.mjs
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(join(dirname(fileURLToPath(import.meta.url)), '..', 'app', 'package.json'));
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://bwkiaapffroyveqqjhom.supabase.co';
const GROQ_PROVIDER_ID = 2;

async function main() {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  const serviceRoleKey = process.env.NRM_SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!apiKey) {
    console.error('GROQ_API_KEY 가 필요합니다.');
    process.exit(1);
  }
  if (!serviceRoleKey) {
    console.error('NRM_SUPABASE_SERVICE_ROLE_KEY 가 필요합니다(ApiKey 컬럼 갱신).');
    process.exit(1);
  }

  const sb = createClient(SUPABASE_URL, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await sb
    .from('LLMProvider')
    .update({ ApiKey: apiKey })
    .eq('ProviderID', GROQ_PROVIDER_ID)
    .eq('ProviderName', 'Groq')
    .select('ProviderID,ProviderName');

  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error('Groq ProviderID=2 행을 찾지 못했습니다. 마이그레이션을 먼저 적용하세요.');
  console.log(`OK: Groq ApiKey updated (ProviderID=${data[0].ProviderID})`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
