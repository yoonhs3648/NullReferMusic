import assert from 'node:assert/strict';

import {
  DEFAULT_MELON_SYNC_SETTINGS,
  melonSyncSettingsToNativePayload,
} from '@/lib/nrmMelonSyncSettings';

assert.deepEqual(DEFAULT_MELON_SYNC_SETTINGS, {
  quality: 'accurate',
  firstLineIntroCorrection: true,
  vocalRangeAutoDetect: true,
});

assert.deepEqual(
  melonSyncSettingsToNativePayload(
    {
      quality: 'fast',
      firstLineIntroCorrection: false,
      vocalRangeAutoDetect: false,
    },
    'en',
  ),
  {
    quality: 'fast',
    firstLineIntroCorrection: false,
    vocalRangeAutoDetect: false,
    lyricsLang: 'en',
  },
);
