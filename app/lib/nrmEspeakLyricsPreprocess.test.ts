import assert from 'node:assert/strict';

import {
  restoreLrcWithOriginalLyrics,
  splitPlainLyricLines,
} from '@/lib/nrmEspeakLyricsPreprocess';

assert.deepEqual(splitPlainLyricLines('a\n\n b '), ['a', 'b']);

const mappings = [
  { originalLine: '나는 바보다.', phoneticLine: '나는 바보다.' },
  { originalLine: 'hello world', phoneticLine: '헬로우 월드' },
];

const lrcIn = '[00:01.00]나는 바보다.\n[00:05.20]헬로우 월드';
const lrcOut = restoreLrcWithOriginalLyrics(lrcIn, mappings);
assert.equal(lrcOut, '[00:01.00]나는 바보다.\n[00:05.20]hello world');
