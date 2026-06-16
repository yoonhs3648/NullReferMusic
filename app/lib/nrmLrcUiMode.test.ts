import assert from 'node:assert/strict';

import {
  countDuplicateTimestampLyrics,
  detectLrcUiModeFromText,
  detectLyricsUiModeFromStoredText,
  DUPLICATE_TS_TRANSLATION_THRESHOLD,
  buildNrmLrcModeLine,
  parseLyricsModeFromLrcText,
  resolveLyricsSidecarAction,
  resolveStoredLyricsModeFromFlags,
  stripNrmLrcModeLine,
  withNrmLyricsModeHeader,
} from './nrmLrcUiMode';
import { inferMelonLyricsUiModeFromContext } from './nrmMelonLyrics';

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

const melonTagged = withNrmLyricsModeHeader(dualLineLrc(DUPLICATE_TS_TRANSLATION_THRESHOLD), 'melon_translation');
assert.equal(buildNrmLrcModeLine('translation'), '[re:NRM/translation]');
assert.ok(melonTagged.startsWith('[re:NRM/melon_translation]\n'));
assert.equal(parseLyricsModeFromLrcText(melonTagged), 'melon_translation');
assert.equal(parseLyricsModeFromLrcText('[nrm:melon]\n[00:01.00] test'), 'melon');
assert.equal(stripNrmLrcModeLine(melonTagged), dualLineLrc(DUPLICATE_TS_TRANSLATION_THRESHOLD));
assert.equal(detectLrcUiModeFromText(melonTagged), 'translation');

const embeddedMelonTagged = withNrmLyricsModeHeader(
  Array.from({ length: 20 }, (_, i) => `[03:${String(i).padStart(2, '0')}.00] Only one line ${i}`).join('\n'),
  'melon',
);
assert.deepEqual(detectLyricsUiModeFromStoredText(embeddedMelonTagged), {
  mode: 'melon',
  lrcModeFromTag: 'melon',
});
assert.deepEqual(detectLyricsUiModeFromStoredText('__AUTO_FROM_MELON__:melon'), {
  mode: 'melon',
  lrcModeFromTag: null,
});

assert.equal(
  resolveStoredLyricsModeFromFlags({
    sidecarLrcText: embeddedMelonTagged,
    metadataLyrics: '__AUTO_FROM_WHISPER__:configured',
  }),
  'melon',
);
assert.equal(
  resolveStoredLyricsModeFromFlags({
    metadataLyrics: '__AUTO_FROM_MELON__:melon_translation',
  }),
  'melon_translation',
);
assert.equal(
  resolveStoredLyricsModeFromFlags({
    embeddedLyricsMode: 'melon',
    metadataLyrics: '__AUTO_FROM_WHISPER__:configured',
  }),
  'melon',
);
assert.equal(
  resolveStoredLyricsModeFromFlags({
    embeddedLyricsMode: 'translation',
    metadataLyrics: '[00:01.00] hello',
  }),
  'translation',
);
assert.equal(
  resolveStoredLyricsModeFromFlags({
    sidecarLrcText: embeddedMelonTagged,
    embeddedLyricsMode: 'configured',
  }),
  'melon',
);
assert.equal(
  resolveStoredLyricsModeFromFlags({
    sidecarLrcText: singleLines,
  }),
  'configured',
);
assert.equal(
  resolveStoredLyricsModeFromFlags({
    sidecarLrcText: singleLines,
    website: 'https://www.melon.com/song/detail.htm?songId=123',
    melonPlainLyrics: '첫 줄\n둘째 줄',
  }),
  'melon',
);
assert.equal(
  resolveStoredLyricsModeFromFlags({
    sidecarLrcText: dualLineLrc(DUPLICATE_TS_TRANSLATION_THRESHOLD),
    website: 'https://www.melon.com/song/detail.htm?songId=123',
    melonPlainLyrics: '첫 줄\n둘째 줄',
  }),
  'melon_translation',
);

assert.equal(
  inferMelonLyricsUiModeFromContext(
    'translation',
    '',
    'https://www.melon.com/song/detail.htm?songId=123',
  ),
  'melon_translation',
);
assert.equal(
  inferMelonLyricsUiModeFromContext(
    'unset',
    '첫 줄\n둘째 줄',
    'https://www.melon.com/song/detail.htm?songId=123',
  ),
  'melon',
);
assert.equal(
  inferMelonLyricsUiModeFromContext('configured', '', 'https://example.com'),
  'configured',
);

assert.deepEqual(resolveLyricsSidecarAction('melon', 'melon', null), {
  kind: 'generate-melon',
  mode: 'melon',
});
assert.deepEqual(resolveLyricsSidecarAction('melon', 'melon', 'content://lrc'), {
  kind: 'none',
});
assert.deepEqual(resolveLyricsSidecarAction('unset', 'configured', null), {
  kind: 'generate',
  mode: 'configured',
});

console.log('nrmLrcUiMode.test.ts: ok');
