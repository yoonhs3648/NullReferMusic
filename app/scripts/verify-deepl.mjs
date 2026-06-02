#!/usr/bin/env node
/**
 * DeepL API 연동 검증 (로컬).
 * 사용: set NRM_DEEPL_API_KEY=your-key && node scripts/verify-deepl.mjs
 */
const key = (process.env.NRM_DEEPL_API_KEY || process.env.DEEPL_AUTH_KEY || '').trim();
if (!key) {
  console.error('NRM_DEEPL_API_KEY 또는 DEEPL_AUTH_KEY 환경 변수를 설정하세요.');
  process.exit(1);
}

const TIMEOUT_MS = 120_000;

async function fetchWithTimeout(url, init) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function translate(base, texts) {
  const res = await fetchWithTimeout(`${base}/translate`, {
    method: 'POST',
    headers: {
      Authorization: `DeepL-Auth-Key ${key}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      text: texts,
      target_lang: 'KO',
      preserve_formatting: true,
      split_sentences: 'nonewlines',
    }),
  });
  return res;
}

const samples = [
  '[00:12.34] This is book',
  '[00:15.00] Hello world',
  '[00:18.00] Thank you.',
];
let res = await translate('https://api-free.deepl.com/v2', samples);
let api = 'free';
if (res.status === 403 || res.status === 404) {
  res = await translate('https://api.deepl.com/v2', samples);
  api = 'pro';
}
if (!res.ok) {
  const errText = await res.text();
  console.error(`DeepL HTTP ${res.status} (${api}):`, errText.slice(0, 400));
  process.exit(2);
}
const json = await res.json();
const out = (json.translations || []).map((t) => t.text);
console.log('DeepL verify OK', { api, count: out.length, samples: out });
if (out.length !== samples.length || out.some((t) => !String(t).trim())) {
  console.error('번역 결과 개수/내용 이상');
  process.exit(3);
}
process.exit(0);
