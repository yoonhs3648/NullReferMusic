import assert from 'node:assert/strict';

import {
  buildTranslationSupportedLrc,
  extractDeepLTextsFromSlots,
  isNonTranslatableMusicLyric,
  mergeDeepLResponsesIntoLrc,
  normalizeDeepLLyricTranslation,
  normalizeLrcLines,
  planLrcTranslationSlots,
} from './nrmDeepLLrcFormat';

import {
  chunkLrcLinesForDeepL,
  DEEPL_MAX_LINES_PER_REQUEST,
  estimateTranslateJsonBytes,
} from './nrmDeepLTranslateBatch';

assert.equal(isNonTranslatableMusicLyric('[MUSIC]'), true);
assert.equal(isNonTranslatableMusicLyric('Hello'), false);

const lines = normalizeLrcLines(
  '[00:00.00] [MUSIC]\n[00:12.34] This is book\n[00:15.00] Hello world\n',
);
assert.equal(lines.length, 3);

const slots = planLrcTranslationSlots(lines);
assert.equal(slots.length, 3);
assert.equal(slots[0].deeplText, null);
assert.equal(slots[0].localTranslation, '음악');
assert.equal(slots[1].deeplText, 'This is book');
assert.equal(slots[1].lyricText, 'This is book');

const { texts, slotIndices } = extractDeepLTextsFromSlots(slots);
assert.equal(texts.length, 2);
assert.deepEqual(texts, ['This is book', 'Hello world']);
assert.deepEqual(slotIndices, [1, 2]);

assert.equal(normalizeDeepLLyricTranslation('이건 책이야'), '이건 책이야');
assert.equal(
  normalizeDeepLLyricTranslation('[00:12.34] 이건 책이야'),
  '이건 책이야',
);

const lrc = mergeDeepLResponsesIntoLrc(lines, slots, slotIndices, [
  '이건 책이야',
  '안녕 세계',
]);
assert.ok(lrc.includes('[00:00.00] [MUSIC]'));
assert.ok(lrc.includes('[00:00.00] (음악)'));
assert.ok(lrc.includes('[00:12.34] This is book'));
assert.ok(lrc.includes('[00:12.34] (이건 책이야)'));
assert.ok(lrc.includes('[00:15.00] Hello world'));
assert.ok(lrc.includes('[00:15.00] (안녕 세계)'));

const fiftyOne = Array.from({ length: 51 }, (_, i) => `line ${i}`);
const chunks = chunkLrcLinesForDeepL(fiftyOne);
assert.equal(chunks.length, 2);
assert.equal(chunks[0].length, DEEPL_MAX_LINES_PER_REQUEST);
assert.equal(chunks[1].length, 1);
for (const c of chunks) {
  assert.ok(c.length <= DEEPL_MAX_LINES_PER_REQUEST);
  assert.ok(estimateTranslateJsonBytes(c) <= 120 * 1024);
}

const byIndex = new Map<number, string>([[0, '번역']]);
const single = buildTranslationSupportedLrc(['[00:01.00] foo'], byIndex);
assert.equal(single, '[00:01.00] foo\n[00:01.00] (번역)');

// 영어 원문과 동일한 "번역"은 LRC에 추가하지 않음 (오프라인 en→ko 실패 폴백)
const englishLines = normalizeLrcLines('[00:01.00] Golden\n');
const englishSlots = planLrcTranslationSlots(englishLines);
const { texts: enTexts, slotIndices: enIdx } = extractDeepLTextsFromSlots(englishSlots);
const englishLrc = mergeDeepLResponsesIntoLrc(
  englishLines,
  englishSlots,
  enIdx,
  ['Golden'],
  ['EN'],
);
assert.equal(englishLrc, '[00:01.00] Golden');

// 오프라인 en→ko: DeepL과 같이 KO 감지 시 번역 줄 생략
const koLines = normalizeLrcLines('[00:01.00] 사랑해\n');
const koSlots = planLrcTranslationSlots(koLines);
const { texts: koTexts, slotIndices: koIdx } = extractDeepLTextsFromSlots(koSlots);
const koLrc = mergeDeepLResponsesIntoLrc(
  koLines,
  koSlots,
  koIdx,
  [''],
  ['KO'],
);
assert.equal(koLrc, '[00:01.00] 사랑해');

console.log('nrmDeepLLrcFormat.test.ts OK');
