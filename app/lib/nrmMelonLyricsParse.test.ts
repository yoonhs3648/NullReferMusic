import assert from 'node:assert/strict';

import {
  isMelonLyricsSectionAdultAuthRequired,
  isMelonLyricsSectionPending,
  parseMelonSongDetailHtml,
} from '@/lib/nrmMelonSearchParse';

const adultHtml = `<div class="section_lyric">
<div class="wrap_lyric" id="lyricArea"><div class="lyric_none">청소년 보호법에 따라 성인 인증이 필요한 콘텐츠 입니다. 성인 인증 후 이용해 주세요.<button class="btn_base02 adult_register"></button></div></div>
</div>`;

const pendingHtml = `<div class="section_lyric">
<div class="wrap_lyric" id="lyricArea"><div class="lyric_none">[가사 준비중] 멜론 회원 여러분! 가사 등록을 기다리고 있어요.<button class="d_register"></button></div></div>
</div>`;

assert.equal(isMelonLyricsSectionAdultAuthRequired(adultHtml), true);
assert.equal(isMelonLyricsSectionPending(adultHtml), false);

assert.equal(isMelonLyricsSectionAdultAuthRequired(pendingHtml), false);
assert.equal(isMelonLyricsSectionPending(pendingHtml), true);

const adult = parseMelonSongDetailHtml(adultHtml, '1030601');
assert.equal(adult.info.lyricsAdultAuthRequired, true);
assert.equal(adult.info.lyricsNotRegistered, false);
assert.equal(adult.info.lyrics, '');

const pending = parseMelonSongDetailHtml(pendingHtml, '1');
assert.equal(pending.info.lyricsAdultAuthRequired, false);
assert.equal(pending.info.lyricsNotRegistered, true);
assert.equal(pending.info.lyrics, '');

console.log('nrmMelonLyricsParse.test.ts ok');
