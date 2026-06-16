import assert from 'node:assert/strict';

import {
  NRM_EMBEDDED_LYRICS_MODE_KEY,
  NRM_EMBEDDED_LYRICS_MODE_TXXX_DESC,
  lyricsUiModeToEmbeddedToken,
  parseEmbeddedLyricsModeToken,
} from './nrmEmbeddedLyricsMode';

assert.equal(NRM_EMBEDDED_LYRICS_MODE_KEY, 'nrm_lyrics_mode');
assert.equal(NRM_EMBEDDED_LYRICS_MODE_TXXX_DESC, 'NRM_LYRICS_MODE');

assert.equal(lyricsUiModeToEmbeddedToken('melon'), 'melon');
assert.equal(lyricsUiModeToEmbeddedToken('melon_translation'), 'melon_translation');

assert.equal(parseEmbeddedLyricsModeToken('melon'), 'melon');
assert.equal(parseEmbeddedLyricsModeToken('MELON'), 'melon');
assert.equal(parseEmbeddedLyricsModeToken('translation'), 'translation');
assert.equal(parseEmbeddedLyricsModeToken(''), null);
assert.equal(parseEmbeddedLyricsModeToken('invalid_mode'), null);

console.log('nrmEmbeddedLyricsMode.test.ts: ok');
