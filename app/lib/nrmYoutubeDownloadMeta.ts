import type { NrmDownloadFileNameFormat } from '@/lib/nrmDownloadSettings';

/**
 * 검색 결과(채널명·제목)에서 다운로드 파일명용 가수/곡 추정.
 */
export function guessArtistFromChannel(channelTitle: string): string {
  const t = channelTitle.trim();
  if (!t) return 'Unknown';
  return t.replace(/\s*-\s*Topic\s*$/i, '').trim() || t;
}

export function guessTrackTitle(videoTitle: string): string {
  let t = videoTitle.trim();
  if (!t) return 'Unknown';
  t = t.replace(/\s*\([^)]*(official\s*)?(music\s*)?(video|audio|lyric(s)?|mv)[^)]*\)\s*$/i, '').trim();
  t = t.replace(/\s*-\s*(official\s*)?(music\s*)?(video|audio|lyric(s)?|mv)\s*$/i, '').trim();
  return t || videoTitle.trim();
}

/** 제목 앞에 이미 `가수 - ` 가 붙어 있으면 제거 (파일명이 `가수 - 가수 - 곡` 이 되는 것 방지). 반복 접두도 처리 */
export function stripLeadingArtistPrefixFromTitle(
  artist: string,
  title: string,
): string {
  let t = title.trim();
  const a = artist.trim();
  if (!a || !t || /^unknown$/i.test(a)) return t;

  const escaped = a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`^${escaped}\\s*-\\s*`, 'i');
  let prev = '';
  while (prev !== t) {
    prev = t;
    t = t.replace(re, '').trim();
  }
  return t || title.trim();
}

/** 모달 초기값: 채널명으로 추정한 가수 + 제목에서 선행 가수 접두 제거 */
export function guessInitialDownloadFields(item: {
  channelTitle: string;
  title: string;
}): { artist: string; title: string } {
  const artist = guessArtistFromChannel(item.channelTitle);
  let title = guessTrackTitle(item.title);
  title = stripLeadingArtistPrefixFromTitle(artist, title);
  return {
    artist,
    title: title || 'Unknown',
  };
}

export function formatDownloadFileStem(
  artist: string,
  title: string,
  format: NrmDownloadFileNameFormat,
): string {
  const a = artist.trim() || 'Unknown';
  const t = title.trim() || 'Unknown';
  switch (format) {
    case 'title-artist':
      return `${t} - ${a}`;
    case 'title':
      return t;
    case 'artist-title':
    default:
      return `${a} - ${t}`;
  }
}

export function buildAudioFileName(
  artist: string,
  title: string,
  ext: string,
  format: NrmDownloadFileNameFormat = 'artist-title',
): string {
  const e = ext.startsWith('.') ? ext : `.${ext}`;
  const base = formatDownloadFileStem(artist, title, format);
  return `${sanitizeFileBase(base)}${e}`;
}

export function buildMp3FileName(
  artist: string,
  title: string,
  format: NrmDownloadFileNameFormat = 'artist-title',
): string {
  return buildAudioFileName(artist, title, '.mp3', format);
}

/** 알림·표시용: 오디오 확장자 제거한 `가수 - 제목` */
export function displayLabelFromAudioFileName(fileName: string): string {
  return (
    fileName
      .replace(/\.(mp3|m4a|opus|wav|flac|ogg|aac|webm|mp4)$/i, '')
      .trim() || fileName.trim()
  );
}

/** @deprecated displayLabelFromAudioFileName 사용 */
export function displayLabelFromMp3FileName(fileName: string): string {
  return displayLabelFromAudioFileName(fileName);
}

/** Windows·Android 등 공통 금지 문자 제거 */
export function sanitizeFileBase(name: string): string {
  const s = name
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);
  return s || 'track';
}
