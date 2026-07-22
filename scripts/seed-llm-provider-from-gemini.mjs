#!/usr/bin/env node
/**
 * Gemini API 모델 목록 → Supabase LLMProvider 시드.
 *
 * 환경변수:
 *   GEMINI_API_KEY              — Gemini API 키 (--input-json 없을 때 필수)
 *   NRM_SUPABASE_SERVICE_ROLE_KEY — service_role 키 (있으면 PostgREST 직접 INSERT)
 *
 * 옵션:
 *   --input-json <path>  로컬 models JSON 사용 (API 재호출 생략)
 *
 * service_role 없으면 admin RPC(nrm_rpc_admin_replace_llm_providers) 시도.
 * RPC도 없으면 supabase/seed_llm_provider_gemini.sql 생성 후 종료 코드 2.
 *
 * 사용:
 *   node scripts/seed-llm-provider-from-gemini.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(join(dirname(fileURLToPath(import.meta.url)), '..', 'app', 'package.json'));
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://bwkiaapffroyveqqjhom.supabase.co';
const PUBLISHABLE_KEY = 'sb_publishable_NJwirVJ8KPm8ricLz6hBUQ_20SwCMoi';
const ADMIN_SERIAL = 'admin';
const ACTIVE_MODELS = new Set(['models/gemini-2.5-flash', 'models/gemini-embedding-2']);
const PROVIDER_NAME = 'Gemini';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const sqlOutPath = join(repoRoot, 'supabase', 'seed_llm_provider_gemini.sql');

function inferType(model) {
  const methods = model.supportedGenerationMethods ?? [];
  const name = model.name.toLowerCase();
  if (methods.includes('embedContent')) return 'Embedding';
  if (name.includes('tts')) return 'TTS';
  if (name.includes('veo') || name.includes('video')) return 'Video';
  if (
    name.includes('imagen') ||
    ((methods.includes('predict') || methods.includes('predictLongRunning')) &&
      !methods.includes('generateContent') &&
      !methods.includes('bidiGenerateContent'))
  ) {
    return 'Image';
  }
  if (
    methods.includes('generateContent') ||
    methods.includes('bidiGenerateContent') ||
    methods.includes('generateAnswer')
  ) {
    return 'LLM';
  }
  return 'LLM';
}

function sqlEscape(value) {
  return String(value ?? '').replace(/'/g, "''");
}

function toRow(model, apiKey) {
  return {
    ProviderName: PROVIDER_NAME,
    Type: inferType(model),
    ModelName: model.name,
    ModelDisplayName: model.displayName ?? model.name.replace(/^models\//, ''),
    Version: model.version ?? '',
    Description: model.description ?? null,
    ApiKey: apiKey,
    IsActive: ACTIVE_MODELS.has(model.name),
    DailyLimit: 0,
    MonthlyLimit: 0,
  };
}

function buildInsertSql(rows) {
  const lines = [
    '-- Gemini API 모델 목록 → LLMProvider 시드 (Supabase SQL Editor에서 실행)',
    '-- 생성: node scripts/seed-llm-provider-from-gemini.mjs',
    '',
    'DELETE FROM public."LLMProvider";',
    '',
  ];
  for (const row of rows) {
    const desc = row.Description == null ? 'NULL' : `'${sqlEscape(row.Description)}'`;
    lines.push(
      `INSERT INTO public."LLMProvider" ("ProviderName","Type","ModelName","ModelDisplayName","Version","Description","ApiKey","IsActive","DailyLimit","MonthlyLimit") VALUES ('${sqlEscape(row.ProviderName)}','${sqlEscape(row.Type)}','${sqlEscape(row.ModelName)}','${sqlEscape(row.ModelDisplayName)}','${sqlEscape(row.Version)}',${desc},'${sqlEscape(row.ApiKey)}',${row.IsActive ? 'true' : 'false'},0,0);`,
    );
  }
  lines.push('');
  return lines.join('\n');
}

async function fetchGeminiModels(apiKey) {
  const all = [];
  let pageToken;
  do {
    const qs = new URLSearchParams({ key: apiKey });
    if (pageToken) qs.set('pageToken', pageToken);
    const url = `https://generativelanguage.googleapis.com/v1beta/models?${qs}`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Gemini API ${res.status}: ${body.slice(0, 300)}`);
    }
    const json = await res.json();
    if (!Array.isArray(json.models)) {
      throw new Error('Gemini API 응답에 models 배열이 없습니다.');
    }
    all.push(...json.models);
    pageToken = json.nextPageToken;
  } while (pageToken);
  return all;
}

function loadModelsFromJson(path) {
  const json = JSON.parse(readFileSync(path, 'utf8'));
  if (Array.isArray(json.models)) return json.models;
  if (Array.isArray(json)) return json;
  throw new Error(`Invalid models JSON: ${path}`);
}

function parseArgs(argv) {
  const inputJsonIdx = argv.indexOf('--input-json');
  return {
    inputJson: inputJsonIdx >= 0 ? argv[inputJsonIdx + 1] : undefined,
  };
}

async function insertViaServiceRole(rows, serviceRoleKey) {
  const sb = createClient(SUPABASE_URL, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: delErr } = await sb.from('LLMProvider').delete().neq('ProviderID', 0);
  if (delErr) throw new Error(`DELETE failed: ${delErr.message}`);
  const { error: insErr } = await sb.from('LLMProvider').insert(rows);
  if (insErr) throw new Error(`INSERT failed: ${insErr.message}`);
}

async function insertViaAdminRpc(rows) {
  const sb = createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await sb.rpc('nrm_rpc_admin_replace_llm_providers', {
    p_caller_serial: ADMIN_SERIAL,
    p_rows: rows,
  });
  if (error) throw new Error(`RPC failed: ${error.message}`);
}

async function main() {
  const { inputJson } = parseArgs(process.argv.slice(2));
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  let models;
  if (inputJson) {
    console.log(`Loading models from ${inputJson}...`);
    models = loadModelsFromJson(inputJson);
  } else {
    if (!apiKey) {
      console.error('GEMINI_API_KEY 환경변수 또는 --input-json 이 필요합니다.');
      process.exit(1);
    }
    console.log('Fetching Gemini models...');
    models = await fetchGeminiModels(apiKey);
  }
  const effectiveApiKey = apiKey ?? process.env.GEMINI_API_KEY?.trim() ?? '';
  if (!effectiveApiKey) {
    console.error('ApiKey 컬럼용 GEMINI_API_KEY 가 필요합니다.');
    process.exit(1);
  }
  const rows = models.map((m) => toRow(m, effectiveApiKey));
  console.log(`Models: ${rows.length}, active: ${rows.filter((r) => r.IsActive).length}`);

  const serviceRoleKey = process.env.NRM_SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (serviceRoleKey) {
    console.log('Inserting via service_role...');
    await insertViaServiceRole(rows, serviceRoleKey);
    console.log('OK: LLMProvider seeded via service_role.');
    return;
  }

  try {
    console.log('Inserting via admin RPC...');
    await insertViaAdminRpc(rows);
    console.log('OK: LLMProvider seeded via RPC.');
    return;
  } catch (rpcErr) {
    console.warn(String(rpcErr));
  }

  const sql = buildInsertSql(rows);
  writeFileSync(sqlOutPath, sql, 'utf8');
  console.error(`RLS/RPC로 자동 INSERT 불가. SQL 생성: ${sqlOutPath}`);
  console.error('Supabase Dashboard → SQL Editor에서 위 파일을 실행하세요.');
  console.error(
    '또는 NRM_SUPABASE_SERVICE_ROLE_KEY 를 설정한 뒤 이 스크립트를 다시 실행하세요.',
  );
  process.exit(2);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
