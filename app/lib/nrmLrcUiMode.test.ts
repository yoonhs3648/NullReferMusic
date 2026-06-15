import assert from 'node:assert/strict';

import {
  countDuplicateTimestampLyrics,
  detectLrcUiModeFromText,
  DUPLICATE_TS_TRANSLATION_THRESHOLD,
} from './nrmLrcUiMode';

function dualLineLrc(pairs: number): string {
  const lines: string[] = [];
  for (let i = 0; i < pairs; i++) {
    const ts = `[00:${String(i).padStart(2, '0')}.00]`;
    lines.push(`${ts} Original line ${i}`);
    lines.push(`${ts} Translation line ${i}`);
  }
  return lines.join('\n');
}

assert.equal(countDuplicateTimestampLyrics(''), 0);
assert.equal(
  countDuplicateTimestampLyrics(dualLineLrc(DUPLICATE_TS_TRANSLATION_THRESHOLD - 1)),
  DUPLICATE_TS_TRANSLATION_THRESHOLD - 1,
);
assert.equal(
  countDuplicateTimestampLyrics(dualLineLrc(DUPLICATE_TS_TRANSLATION_THRESHOLD)),
  DUPLICATE_TS_TRANSLATION_THRESHOLD,
);

assert.equal(detectLrcUiModeFromText(''), 'unset');
assert.equal(
  detectLrcUiModeFromText(dualLineLrc(DUPLICATE_TS_TRANSLATION_THRESHOLD - 1)),
  'configured',
);
assert.equal(
  detectLrcUiModeFromText(dualLineLrc(DUPLICATE_TS_TRANSLATION_THRESHOLD)),
  'translation',
);

// 괄호 없는 번역 줄도 동일 타임스탬프 기준으로 감지
const noParenPairs = Array.from({ length: 12 }, (_, i) => {
  const ts = `[01:${String(i).padStart(2, '0')}.00]`;
  return `${ts} Hello ${i}\n${ts} 안녕 ${i}`;
}).join('\n');
assert.equal(detectLrcUiModeFromText(noParenPairs), 'translation');

// 구 형식: 단일 줄 `원문 (번역)` — 동일 타임스탬프 중복 없어도 감지
const legacyLines = Array.from(
  { length: 12 },
  (_, i) => `[02:${String(i).padStart(2, '0')}.00] Line ${i} (번역 ${i})`,
).join('\n');
assert.equal(detectLrcUiModeFromText(legacyLines), 'translation');

// 일반 가사: 타임스탬프당 1줄
const singleLines = Array.from(
  { length: 20 },
  (_, i) => `[03:${String(i).padStart(2, '0')}.00] Only one line ${i}`,
).join('\n');
assert.equal(detectLrcUiModeFromText(singleLines), 'configured');

console.log('nrmLrcUiMode.test.ts: ok');
