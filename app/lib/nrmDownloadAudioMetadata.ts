import type { ChartTrackItem } from '@/lib/nrmChartsTypes';
import { normalizeCoverArtUrl } from '@/lib/nrmCoverArtUrl';
import type { NrmAudioExtension } from '@/lib/nrmDownloadSettings';
import { parseMelonLyricsMode } from '@/lib/nrmMelonLyrics';
import { parseWhisperLyricsMode } from '@/lib/nrmWhisperLyrics';

/** 오디오 파일에 쓸 ID3/컨테이너 메타데이터 (빈 문자열 = 태그 미설정) */
export type NrmAudioFileMetadata = {
  artist: string;
  title: string;
  album: string;
  genre: string;
  releaseDate: string;
  coverUrl: string;
  /** ffmpeg: album_artist */
  albumArtist?: string;
  /** ffmpeg: track */
  trackNumber?: string;
  /** ffmpeg: disc */
  discNumber?: string;
  /** ffmpeg: composer */
  composer?: string;
  /** ffmpeg: lyrics */
  lyrics?: string;
  /**
   * MP3 TXXX(NRM_LYRICS_MODE) / m4a nrm_lyrics_mode — 앱 전용 가사 UI 모드.
   * 플레이어에는 노출되지 않으며 readMetadata로만 복원한다.
   */
  nrmLyricsMode?: string;
  /**
   * 다운로드 파이프라인 전용 — 멜론 원문 가사(plain).
   * ffmpeg/파일 태그에는 기록하지 않는다.
   */
  melonLyricsPlain?: string;
  /**
   * 다운로드 파이프라인 전용 — 멜론 싱크 시 wav2vec2 KO/EN 팩 선택.
   * ffmpeg/파일 태그에는 기록하지 않는다.
   */
  melonAlignLang?: 'ko' | 'en';
  /**
   * 다운로드 팝업 표시용 — Melon·Last.fm·Spotify 등 플랫폼 API 원본 장르.
   * ffmpeg/파일 태그에는 기록하지 않는다.
   */
  platformGenreRaw?: string;
  /** ffmpeg: bpm */
  bpm?: string;
  /** ffmpeg: copyright */
  copyright?: string;
  /** ffmpeg: website / url */
  website?: string;
  /** ffmpeg: producer (일부 컨테이너) */
  producer?: string;
  /** ffmpeg: remixer (일부 컨테이너) */
  remixer?: string;
};

export type NrmDownloadMetadataSource =
  | 'mainSearch'
  | 'chart'
  | 'lastfm'
  | 'spotify'
  | 'apple';

function trimOpt(s: string | undefined): string {
  return (s ?? '').trim();
}

/** 플랫폼별 필드 → 다운로드용 메타 (커버 URL 정규화 포함) */
export function normalizeDownloadMetadata(
  meta: NrmAudioFileMetadata,
): NrmAudioFileMetadata {
  const base = {
    artist: meta.artist.trim(),
    title: meta.title.trim(),
    album: meta.album.trim(),
    genre: meta.genre.trim(),
    releaseDate: meta.releaseDate.trim(),
    coverUrl: normalizeCoverArtUrl(meta.coverUrl),
    albumArtist: trimOpt(meta.albumArtist),
    trackNumber: trimOpt(meta.trackNumber),
    discNumber: trimOpt(meta.discNumber),
    composer: trimOpt(meta.composer),
    lyrics: trimOpt(meta.lyrics),
    nrmLyricsMode: trimOpt(meta.nrmLyricsMode),
    melonLyricsPlain: trimOpt(meta.melonLyricsPlain),
    melonAlignLang:
      meta.melonAlignLang === 'en' || meta.melonAlignLang === 'ko'
        ? meta.melonAlignLang
        : undefined,
    platformGenreRaw: trimOpt(meta.platformGenreRaw),
    bpm: trimOpt(meta.bpm),
    copyright: trimOpt(meta.copyright),
    website: trimOpt(meta.website),
    producer: trimOpt(meta.producer),
    remixer: trimOpt(meta.remixer),
  };
  const out: NrmAudioFileMetadata = { ...base };
  for (const k of [
    'albumArtist',
    'trackNumber',
    'discNumber',
    'composer',
    'lyrics',
    'nrmLyricsMode',
    'melonLyricsPlain',
    'platformGenreRaw',
    'bpm',
    'copyright',
    'website',
    'producer',
    'remixer',
  ] as const) {
    if (!out[k]) delete out[k];
  }
  return out;
}

/** m4a 등 MP4 계열 컨테이너에는 가사 태그를 넣지 않음 */
export function metadataForAudioExtension(
  meta: NrmAudioFileMetadata | undefined,
  extension: NrmAudioExtension,
): NrmAudioFileMetadata | undefined {
  if (!meta) return undefined;
  if (extension !== '.m4a') return meta;
  // m4a: Whisper sentinel(__AUTO_FROM_WHISPER__:...)은 보존해야 splitMetadataForDownloadStages가 whisperMode를 추출할 수 있음
  // 실제 가사 텍스트(sentinel이 아닌 경우)만 제거 (m4a 메타에 직접 embed하지 않음)
  if (
    parseWhisperLyricsMode(meta.lyrics) !== null ||
    parseMelonLyricsMode(meta.lyrics) !== null
  ) {
    return meta;
  }
  const { lyrics: _lyrics, ...rest } = meta;
  return normalizeDownloadMetadata(rest);
}

/** 메인 검색: 가수·곡 제목만 사용자 입력 */
export function buildMainSearchAudioMetadata(
  userArtist: string,
  userTitle: string,
): NrmAudioFileMetadata {
  return normalizeDownloadMetadata({
    artist: userArtist,
    title: userTitle,
    album: '',
    genre: '',
    releaseDate: '',
    coverUrl: '',
  });
}

/** 차트(Apple·Spotify·Last.fm 차트에서 YouTube 유입) 트랙 — Spotify 등 기존 동작 유지 */
export function buildChartAudioMetadata(
  track: ChartTrackItem,
  userArtist: string,
  userTitle: string,
): NrmAudioFileMetadata {
  return normalizeDownloadMetadata({
    artist: userArtist,
    title: userTitle,
    album: track.album ?? '',
    genre: track.genre ?? '',
    platformGenreRaw: (track.genre ?? '').trim(),
    releaseDate: track.releaseDate ?? '',
    coverUrl: track.imageUrl ?? '',
  });
}

/** Last.fm 검색 유입(차트 아님) — 시드 필드만 (enrich 전) */
export function buildLastfmSeedAudioMetadata(
  fields: {
    album?: string;
    genre?: string;
    releaseDate?: string;
    imageUrl?: string;
  },
  userArtist: string,
  userTitle: string,
): NrmAudioFileMetadata {
  return normalizeDownloadMetadata({
    artist: userArtist,
    title: userTitle,
    album: fields.album ?? '',
    genre: fields.genre ?? '',
    releaseDate: fields.releaseDate ?? '',
    coverUrl: fields.imageUrl ?? '',
  });
}

/** @deprecated Last.fm 검색 시드 — buildLastfmSeedAudioMetadata 사용 */
export function buildPlatformTrackAudioMetadata(
  fields: {
    album?: string;
    genre?: string;
    releaseDate?: string;
    imageUrl?: string;
  },
  userArtist: string,
  userTitle: string,
): NrmAudioFileMetadata {
  return buildLastfmSeedAudioMetadata(fields, userArtist, userTitle);
}

export function metadataNeedsPostProcess(
  meta: NrmAudioFileMetadata | undefined,
): meta is NrmAudioFileMetadata {
  if (!meta) return false;
  return (
    hasEmbeddableAudioMetadata(meta) ||
    !!parseWhisperLyricsMode(meta.lyrics) ||
    !!parseMelonLyricsMode(meta.lyrics)
  );
}

export function hasEmbeddableAudioMetadata(meta: NrmAudioFileMetadata): boolean {
  return !!(
    meta.artist ||
    meta.title ||
    meta.album ||
    meta.genre ||
    meta.releaseDate ||
    meta.coverUrl ||
    meta.albumArtist ||
    meta.trackNumber ||
    meta.website
  );
}

export function hasAlbumCoverUrl(meta: NrmAudioFileMetadata): boolean {
  return !!meta.coverUrl.trim();
}
