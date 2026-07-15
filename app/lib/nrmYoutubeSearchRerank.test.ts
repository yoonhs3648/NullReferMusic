import assert from 'node:assert/strict';

import {
  diceCoefficient,
  normalizeYoutubeSearchText,
  parseArtistTitleFromSearchQuery,
  rerankYoutubeSearchItems,
} from '@/lib/nrmYoutubeSearchRerank';
import type { YoutubeSearchItem } from '@/lib/youtubeSearchTypes';

assert.equal(
  normalizeYoutubeSearchText('Lose Yourself (Official Audio)'),
  'lose yourself',
);
assert.equal(
  normalizeYoutubeSearchText('Lose Yourself [Explicit]'),
  'lose yourself',
);
assert.equal(
  normalizeYoutubeSearchText('Lose Yourself (Lyrics Video)'),
  'lose yourself',
);
assert.equal(
  normalizeYoutubeSearchText('Lose Yourself - Topic', { keepTopic: true }),
  'lose yourself topic',
);
assert.equal(
  normalizeYoutubeSearchText('Lose Yourself - Topic', { keepTopic: false }),
  'lose yourself',
);

assert.deepEqual(parseArtistTitleFromSearchQuery('Eminem - Lose Yourself'), {
  artist: 'Eminem',
  title: 'Lose Yourself',
});
assert.deepEqual(
  parseArtistTitleFromSearchQuery('Eminem - Lose Yourself topic'),
  {
    artist: 'Eminem',
    title: 'Lose Yourself',
  },
);

const items: YoutubeSearchItem[] = [
  {
    videoId: 'other',
    title: 'Random Cover Song',
    channelTitle: 'Someone',
    thumbnailUrl: '',
  },
  {
    videoId: 'official',
    title: 'Lose Yourself (Official Audio)',
    channelTitle: 'EminemVEVO',
    thumbnailUrl: '',
  },
  {
    videoId: 'topic',
    title: 'Lose Yourself',
    channelTitle: 'Eminem - Topic',
    thumbnailUrl: '',
  },
  {
    videoId: 'dot',
    title: 'Lose Yourself · Eminem - Topic',
    channelTitle: 'Various Artists',
    thumbnailUrl: '',
  },
];

const ranked = rerankYoutubeSearchItems(
  items,
  'Eminem - Lose Yourself',
  'topic',
);
assert.equal(ranked[0]!.videoId, 'topic');
assert.equal(ranked[1]!.videoId, 'dot');
assert.equal(ranked[2]!.videoId, 'official');
assert.equal(ranked[3]!.videoId, 'other');

assert.ok(diceCoefficient('lose yourself', 'lose yourself') === 1);
assert.ok(diceCoefficient('lose yourself', 'lose yoursel') > 0.7);

console.log('nrmYoutubeSearchRerank.test.ts: ok');
