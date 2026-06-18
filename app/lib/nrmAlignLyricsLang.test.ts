import assert from 'node:assert/strict';

import { inferMelonAlignLyricsLanguage } from '@/lib/nrmAlignLyricsLang';

assert.equal(inferMelonAlignLyricsLanguage('사랑해 baby oh'), 'ko');
assert.equal(inferMelonAlignLyricsLanguage('I love you more than yesterday'), 'en');
assert.equal(inferMelonAlignLyricsLanguage('ab가나'), 'ko');
assert.equal(inferMelonAlignLyricsLanguage('   \n'), 'ko');
