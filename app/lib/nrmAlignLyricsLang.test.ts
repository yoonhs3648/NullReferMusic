import assert from 'node:assert/strict';

import { inferMelonAlignLyricsLanguage } from '@/lib/nrmAlignLyricsLang';

assert.equal(inferMelonAlignLyricsLanguage('사랑해 baby oh'), 'en');
assert.equal(inferMelonAlignLyricsLanguage('I love you more than yesterday'), 'en');
assert.equal(inferMelonAlignLyricsLanguage('ab가나'), 'en');
assert.equal(inferMelonAlignLyricsLanguage('   \n'), 'en');
assert.equal(inferMelonAlignLyricsLanguage('가'.repeat(50)), 'en');
assert.equal(inferMelonAlignLyricsLanguage('가'.repeat(51)), 'ko');
