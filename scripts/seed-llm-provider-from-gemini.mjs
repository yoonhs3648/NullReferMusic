#!/usr/bin/env node
/**
 * Gemini API 모델 목록 → Supabase LLMModel 시드 (제공자 ProviderID=1 Google 가정).
 * ApiKey는 LLMProvider에만 두고, 모델 행에는 넣지 않는다.
 *
 * 환경변수:
 *   GEMINI_API_KEY — 모델 목록 조회용(이미 LLMProvider에 키가 있어도 목록 조회에 필요)
 *   NRM_SUPABASE_SERVICE_ROLE_KEY — 있으면 직접 upsert, 없으면 admin RPC
 *
 * RPC: nrm_rpc_admin_replace_llm_models
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
const GOOGLE_PROVIDER_ID = 1;
const GEMINI_MODELS_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const sqlOutPath = join(repoRoot, 'supabase', 'seed_llm_model_gemini.sql');

function sqlEscape(s) {
  return String(s ?? '').replace(/'/g, "''");
}

function classifyType(name) {
  const n = (name || '').toLowerCase();
  if (n.includes('embedding')) return 'Embedding';
  if (n.includes('tts')) return 'TTS';
  if (n.includes('imagen') || n.includes('image')) return 'Image';
  if (n.includes('veo') || n.includes('video')) return 'Video';
  return 'LLM';
}

function displayNameFromModel(model) {
  return (
    model.displayName ||
    String(model.name || '')
      .replace(/^models\//, '')
      .replace(/-/g, ' ')
  );
}

function toRow(model) {
  const name = String(model.name || '').trim();
  return {
    ProviderID: GOOGLE_PROVIDER_ID,
    Type: classifyType(name),
    ModelName: name,
    ModelDisplayName: displayNameFromModel(model),
    Version: String(model.version || '1'),
    Description: model.description ? String(model.description) : '',
    IsActive: false,
  };
}

async function fetchGeminiModels(apiKey) {
  const res = await fetch(`${GEMINI_MODELS_URL}?key=${encodeURIComponent(apiKey)}&pageSize=200`);
  if (!res.ok) throw new Error(`Gemini models list failed: ${res.status}`);
  const json = await res.json();
  return Array.isArray(json.models) ? json.models : [];
}

async function replaceViaServiceRole(rows, serviceRoleKey) {
  const sb = createClient(SUPABASE_URL, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await sb.rpc('nrm_rpc_admin_replace_llm_models', {
    p_caller_serial: ADMIN_CALLER_SERIAL,
    p_rows: rows,
  });
  if (error) throw new Error(error.message);
}

async function replaceViaAdminRpc(rows) {
  const sb = createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await sb.rpc('nrm_rpc_admin_replace_llm_models', {
    p_caller_serial: ADMIN_CALLER_SERIAL,
    p_rows: rows,
  });
  if (error) throw new Error(error.message);
}

function buildInsertSql(rows) {
  const lines = [
    '-- Gemini API 모델 목록 → LLMModel 시드 (ProviderID=1 Google)',
    '-- 생성: node scripts/seed-llm-provider-from-gemini.mjs',
    'DELETE FROM public."LLMModel";',
    '',
  ];
  for (const row of rows) {
    const desc = row.Description ? `'${sqlEscape(row.Description)}'` : 'NULL';
    lines.push(
      `INSERT INTO public."LLMModel" ("ProviderID","Type","ModelName","ModelDisplayName","Version","Description","IsActive") VALUES (${row.ProviderID},'${sqlEscape(row.Type)}','${sqlEscape(row.ModelName)}','${sqlEscape(row.ModelDisplayName)}','${sqlEscape(row.Version)}',${desc},${row.IsActive ? 'true' : 'false'});`,
    );
  }
  return lines.join('\n');
}

async function main() {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    console.error('GEMINI_API_KEY 가 필요합니다(모델 목록 조회용).');
    process.exit(1);
  }
  const models = await fetchGeminiModels(apiKey);
  const rows = models.map(toRow).filter((r) => r.ModelName);
  if (rows.length === 0) throw new Error('Gemini models empty');

  const serviceRoleKey = process.env.NRM_SUPABASE_SERVICE_ROLE_KEY?.trim();
  try {
    if (serviceRoleKey) {
      await replaceViaServiceRole(rows, serviceRoleKey);
      console.log(`OK: LLMModel seeded via service_role (${rows.length} rows, ProviderID=${GOOGLE_PROVIDER_ID}).`);
      return;
    }
    await replaceViaAdminRpc(rows);
    console.log(`OK: LLMModel seeded via RPC (${rows.length} rows, ProviderID=${GOOGLE_PROVIDER_ID}).`);
  } catch (e) {
    console.warn(String(e));
    writeFileSync(sqlOutPath, buildInsertSql(rows), 'utf8');
    console.error(`자동 시드 불가. SQL 생성: ${sqlOutPath}`);
    process.exit(2);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
