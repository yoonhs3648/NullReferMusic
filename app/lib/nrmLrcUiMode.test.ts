import assert from 'node:assert/strict';

import {
  countDuplicateTimestampLyrics,
  detectLrcUiModeFromText,
  detectLyricsUiModeFromStoredText,
  DUPLICATE_TS_TRANSLATION_THRESHOLD,
  buildNrmLrcModeLine,
  isEmbeddedSyncLyricsText,
  parseLyricsModeFromLrcText,
  resolveLyricsSidecarAction,
  resolveStoredLyricsModeFromFlags,
  preparePureSidecarLrcText,
  prepareSidecarLrcTextForPersist,
  stripNrmLrcModeLine,
  withNrmLyricsModeHeader,
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

const singleLines = Array.from(
  { length: 20 },
  (_, i) => `[03:${String(i).padStart(2, '0')}.00] Only one line ${i}`,
).join('\n');
assert.equal(detectLrcUiModeFromText(singleLines), 'configured');

const melonTagged = withNrmLyricsModeHeader(dualLineLrc(DUPLICATE_TS_TRANSLATION_THRESHOLD), 'melon_translation');
assert.equal(buildNrmLrcModeLine('translation'), '[re:NRM/translation]');
assert.equal(parseLyricsModeFromLrcText(melonTagged), 'melon_translation');
assert.equal(preparePureSidecarLrcText(melonTagged), dualLineLrc(DUPLICATE_TS_TRANSLATION_THRESHOLD));

assert.ok(isEmbeddedSyncLyricsText(singleLines));
assert.equal(isEmbeddedSyncLyricsText('첫 줄\n둘째 줄'), false);
assert.equal(isEmbeddedSyncLyricsText('__AUTO_FROM_MELON__:melon'), false);

assert.deepEqual(detectLyricsUiModeFromStoredText('__AUTO_FROM_MELON__:melon'), {
  mode: 'melon',
  lrcModeFromTag: null,
});

assert.equal(resolveStoredLyricsModeFromFlags({}), 'unset');
assert.equal(
  resolveStoredLyricsModeFromFlags({
    hasSidecarLrc: true,
    sidecarLrcText: withNrmLyricsModeHeader(singleLines, 'melon_translation'),
  }),
  'configured',
);
assert.equal(
  resolveStoredLyricsModeFromFlags({
    hasSidecarLrc: true,
    sidecarLrcText: singleLines,
  }),
  'configured',
);
assert.equal(
  resolveStoredLyricsModeFromFlags({
    embeddedSyncLyrics: singleLines,
  }),
  'configured',
);
assert.equal(
  resolveStoredLyricsModeFromFlags({
    hasSidecarLrc: true,
    sidecarLrcText: dualLineLrc(DUPLICATE_TS_TRANSLATION_THRESHOLD),
  }),
  'translation',
);
assert.equal(
  resolveStoredLyricsModeFromFlags({
    hasSidecarLrc: true,
    sidecarLrcText: singleLines,
    melonTrackUrl: 'https://www.melon.com/song/detail.htm?songId=12345',
  }),
  'melon',
);
assert.equal(
  resolveStoredLyricsModeFromFlags({
    embeddedSyncLyrics: singleLines,
    melonTrackUrl: 'https://www.melon.com/song/detail.htm?songId=12345',
  }),
  'melon',
);
assert.equal(prepareSidecarLrcTextForPersist(singleLines, 'melon'), withNrmLyricsModeHeader(singleLines, 'melon'));
assert.equal(
  resolveStoredLyricsModeFromFlags({
    hasSidecarLrc: true,
    sidecarLrcText: dualLineLrc(DUPLICATE_TS_TRANSLATION_THRESHOLD),
    melonTrackUrl: 'https://www.melon.com/song/detail.htm?songId=12345',
  }),
  'melon_translation',
);

assert.deepEqual(resolveLyricsSidecarAction('unset', 'melon', null), {
  kind: 'generate-melon',
  mode: 'melon',
});
assert.deepEqual(resolveLyricsSidecarAction('unset', 'melon_translation', null), {
  kind: 'generate-melon',
  mode: 'melon_translation',
});

assert.deepEqual(resolveLyricsSidecarAction('melon', 'melon', null), {
  kind: 'generate-melon',
  mode: 'melon',
});
assert.deepEqual(resolveLyricsSidecarAction('unset', 'configured', null), {
  kind: 'generate',
  mode: 'configured',
});

console.log('nrmLrcUiMode.test.ts: ok');
