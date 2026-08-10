/**
 * AI Lab — Melon 전용 검색·다운로드·가사 후속 도구.
 * 파이프라인: Melon 검색 → (선택) → Melon 메타 → YouTube → 오디오 → (선택) 가사
 */
import { Platform } from 'react-native';

import {
  aiLabNonMelonSearchMessage,
  DEFAULT_AI_LAB_MUSIC_PLATFORM_ID,
  getAiLabMusicPlatformLabel,
  MELON_SEARCH_YES_NO_CHOICES,
  MusicPlatformId,
  normalizeMusicPlatformArg,
  type MusicPlatformId as MusicPlatformIdType,
} from '@/lib/nrmAiLabMusicPlatform';
import {
  AI_LAB_MELON_LYRICS_PRELOAD,
  getAiLabLyricsCapability,
  LYRICS_YES_NO_CHOICES,
  maybeAskTranslationAfterAiLabLyrics,
  registerAiLabDownload,
  startAiLabLyrics,
  TRANSLATE_YES_NO_CHOICES,
  translateAiLabLyrics,
  updateAiLabDownloadAudio,
} from '@/lib/nrmAiLabLyricsFollowup';
import {
  AI_LAB_YOUTUBE_CONFIRM_MAX,
  createAiLabYoutubeConfirmSession,
  currentCandidateVideoId,
  getAiLabYoutubeConfirmSession,
  markAiLabYoutubeConfirmConfirmed,
  prepareAiLabYoutubeConfirmStream,
} from '@/lib/nrmAiLabYoutubeConfirm';
import {
  nrmBackgroundWorkAcquire,
  nrmBackgroundWorkRelease,
  nrmDownloadBackgroundWorkToken,
  nrmLyricsBackgroundWorkToken,
} from '@/lib/nrmBackgroundWork';
import type { NrmAudioFileMetadata } from '@/lib/nrmDownloadAudioMetadata';
import {
  applyDownloadExtension,
  loadAlignModelPreference,
  loadDownloadEncodeSettings,
  loadDownloadFileNameFormat,
} from '@/lib/nrmDownloadSettings';
import {
  buildLyricsSentinel,
  type NrmLyricsUiMode,
} from '@/lib/nrmMelonLyrics';
import {
  buildMelonSeedAudioMetadata,
  buildMelonTrackAudioMetadata,
} from '@/lib/nrmMelonDownloadMetadata';
import { fetchMelonTrackDetail } from '@/lib/nrmMelonSearchClient';
import {
  nrmNotifyDownloadFinished,
  nrmNotifyDownloadQueued,
  nrmNotifyDownloadStarted,
  nrmNotifyLyricsFailed,
  setupNrmMobileDownloadNotifications,
} from '@/lib/nrmMobileDownloadNotifications';
import { scheduleNativeDownloadJob } from '@/lib/nrmNativeDownloadOrchestrator';
import {
  MelonProvider,
  searchMelonAlbumsViaProvider,
  searchMelonArtistsViaProvider,
  searchViaMusicMetadataProvider,
} from '@/lib/nrmMusicMetadataProvider';
import { searchMelonChartForAiLab } from '@/lib/nrmMelonAiLabChartSearch';
import { splitMetadataForDownloadStages } from '@/lib/nrmWhisperLyrics';
import { buildAudioFileName, displayLabelFromAudioFileName } from '@/lib/nrmYoutubeDownloadMeta';
import { searchYoutube } from '@/lib/youtubeSearchClient';
import { logNrmDev, logNrmRunError } from '@/lib/nrmDevLog';

export type NrmAiLabDownloadPlatformId = 'melon' | 'spotify' | 'lastfm' | 'appleMusic';

export type NrmAiLabReadyPlatform = {
  id: MusicPlatformIdType;
  label: string;
};

export type NrmAiLabTrackHit = {
  ref: string;
  platform: NrmAiLabDownloadPlatformId;
  title: string;
  artist: string;
  album: string;
  imageUrl: string;
  externalUrl: string;
  releaseDate: string;
  genre: string;
  /** Melon 차트 순위 (search_melon_chart) */
  rank?: number;
};

export type NrmAiLabChoice = { id: string; label: string };

const TRACK_HIT_CACHE_MAX = 48;
const recentTrackHitsByRef = new Map<string, NrmAiLabTrackHit>();

/** 검색 hits를 칩 선택용으로 캐시 (앱 프로세스 내) */
export function cacheAiLabTrackHits(hits: NrmAiLabTrackHit[]): void {
  for (const h of hits) {
    const ref = String(h?.ref ?? '').trim();
    if (!ref || !h.title || !h.artist) continue;
    recentTrackHitsByRef.set(ref, h);
  }
  while (recentTrackHitsByRef.size > TRACK_HIT_CACHE_MAX) {
    const first = recentTrackHitsByRef.keys().next().value;
    if (first == null) break;
    recentTrackHitsByRef.delete(first);
  }
}

export function getCachedAiLabTrackHit(ref: string): NrmAiLabTrackHit | undefined {
  const key = String(ref ?? '').trim();
  if (!key) return undefined;
  return recentTrackHitsByRef.get(key);
}

/** 트랙 칩(id=melon ref)인지 — 가사 예/아니요·다운로드 예/아니요·다른 목록 등과 구분 */
export function isAiLabTrackChoiceId(id: string): boolean {
  const key = String(id ?? '').trim();
  if (!key) return false;
  if (isAiLabDownloadChoiceId(key)) return false;
  if (key === 'lyrics_yes' || key === 'lyrics_no') return false;
  if (key === 'translate_yes' || key === 'translate_no') return false;
  if (key === 'melon_search_yes' || key === 'melon_search_no') return false;
  if (key === 'ailab_more_music_list') return false;
  if (key.startsWith('melon-artist:') || key.startsWith('melon-album:')) return false;
  return key.startsWith('melon:') || recentTrackHitsByRef.has(key);
}

export const DOWNLOAD_NO_CHOICE: NrmAiLabChoice = { id: 'download_no', label: '아니요' };

export function buildDownloadAskChoices(hitRef: string): NrmAiLabChoice[] {
  const ref = String(hitRef ?? '').trim();
  if (!ref) return [DOWNLOAD_NO_CHOICE];
  return [
    { id: `download_yes:${ref}`, label: '예' },
    DOWNLOAD_NO_CHOICE,
  ];
}

export function isAiLabDownloadChoiceId(id: string): boolean {
  const key = String(id ?? '').trim();
  return key === 'download_no' || key.startsWith('download_yes:');
}

export function isAiLabDownloadYesChoiceId(id: string): boolean {
  return String(id ?? '').trim().startsWith('download_yes:');
}

export function hitRefFromDownloadYesChoiceId(id: string): string | null {
  const m = /^download_yes:(.+)$/.exec(String(id ?? '').trim());
  return m?.[1]?.trim() || null;
}

/** 멜론 차트 조회(다운로드 의도 없음) — 트랙 칩 대신 예/아니요 또는 비트랙 칩만 */
export function resolveMelonChartInfoChoices(params: {
  userLikelyWantsDownload: boolean;
  hits: NrmAiLabTrackHit[];
  toolChoices?: NrmAiLabChoice[];
}): NrmAiLabChoice[] | undefined {
  if (params.userLikelyWantsDownload) {
    return params.toolChoices;
  }
  const hits = params.hits.filter((h) => h.title && h.artist);
  if (hits.length === 1 && hits[0]!.ref) {
    cacheAiLabTrackHits(hits);
    return buildDownloadAskChoices(hits[0]!.ref);
  }
  if (params.toolChoices?.some((ch) => isAiLabTrackChoiceId(ch.id))) {
    const nonTrack = params.toolChoices.filter((ch) => !isAiLabTrackChoiceId(ch.id));
    return nonTrack.length > 0 ? nonTrack : undefined;
  }
  return params.toolChoices;
}

/** 칩 label 「가수 - 제목 (앨범)」에서 hit 복원 (캐시 미스 시) */
export function hitFromAiLabTrackChoice(
  choice: NrmAiLabChoice,
): NrmAiLabTrackHit | undefined {
  const cached = getCachedAiLabTrackHit(choice.id);
  if (cached) return cached;
  const id = String(choice.id ?? '').trim();
  if (!id.startsWith('melon:')) return undefined;
  const label = String(choice.label ?? '').trim();
  if (!label) return undefined;
  let artist = '';
  let title = '';
  let album = '';
  const albumMatch = label.match(/^(.*?)\s*\(([^()]*)\)\s*$/);
  const main = albumMatch ? albumMatch[1]!.trim() : label;
  album = albumMatch ? albumMatch[2]!.trim() : '';
  const dash = main.indexOf(' - ');
  if (dash >= 0) {
    artist = main.slice(0, dash).trim();
    title = main.slice(dash + 3).trim();
  } else {
    title = main;
  }
  if (!title) return undefined;
  const hit: NrmAiLabTrackHit = {
    ref: id,
    platform: 'melon',
    title,
    artist: artist || 'Unknown',
    album,
    imageUrl: '',
    externalUrl: '',
    releaseDate: '',
    genre: '',
  };
  cacheAiLabTrackHits([hit]);
  return hit;
}

/**
 * 트랙 선택 후 LLM에 넘기는 메시지(히트 JSON 포함).
 * 화면 표시는 choice.label만 쓰고, API에는 이 문자열을 보낸다.
 */
export function buildAiLabTrackSelectApiMessage(
  hit: NrmAiLabTrackHit,
  label: string,
): string {
  const payload = JSON.stringify({
    ref: hit.ref,
    platform: hit.platform || 'melon',
    title: hit.title,
    artist: hit.artist,
    album: hit.album ?? '',
    imageUrl: hit.imageUrl ?? '',
    externalUrl: hit.externalUrl ?? '',
    releaseDate: hit.releaseDate ?? '',
    genre: hit.genre ?? '',
  });
  return (
    `[AI_LAB_TRACK_SELECT]${payload}\n` +
    `사용자가 곡을 선택했다: ${label}\n` +
    `search_music/search_music_artist/search_music_album/search_melon_chart 호출 금지.\n` +
    `반드시 function call로 start_music_download(hit=위 JSON, lyricsOption=none)를 호출한다.\n` +
    `텍스트만 「다운로드를 진행합니다.」하고 끝내면 실패다. 도구 호출이 필수다.`
  );
}

export function parseAiLabTrackSelectHit(message: string): NrmAiLabTrackHit | null {
  const m = String(message ?? '').match(/\[AI_LAB_TRACK_SELECT\](\{[\s\S]*?\})\n/);
  if (!m?.[1]) return null;
  try {
    const obj = JSON.parse(m[1]) as Partial<NrmAiLabTrackHit>;
    const ref = String(obj.ref ?? '').trim();
    const title = String(obj.title ?? '').trim();
    const artist = String(obj.artist ?? '').trim();
    if (!ref || !title || !artist) return null;
    const hit: NrmAiLabTrackHit = {
      ref,
      platform: (obj.platform as NrmAiLabDownloadPlatformId) || 'melon',
      title,
      artist,
      album: String(obj.album ?? ''),
      imageUrl: String(obj.imageUrl ?? ''),
      externalUrl: String(obj.externalUrl ?? ''),
      releaseDate: String(obj.releaseDate ?? ''),
      genre: String(obj.genre ?? ''),
    };
    cacheAiLabTrackHits([hit]);
    return hit;
  } catch {
    return null;
  }
}

/** AI Lab lyricsOption (FC) — 기본 none. 번역은 후속 translate_ai_lab_lyrics */
export type AiLabLyricsOption =
  | 'none'
  | 'ko'
  | 'en'
  | 'auto'
  | 'ko_translate'
  | 'en_translate'
  | 'auto_translate';

export type ParsedAiLabLyrics = {
  lyricsMode: NrmLyricsUiMode;
  alignLang?: 'ko' | 'en';
  lyricsOption: AiLabLyricsOption;
};

const LOG = 'ailab.downloadTools';

export type AiLabDownloadToolContext = {
  musicPlatformId: MusicPlatformIdType;
};

const ONE_DOWNLOAD_PER_REQUEST_MESSAGE =
  '한 번의 요청에서는 오디오 1곡만 다운로드할 수 있습니다. 추가 곡은 새 메시지로 요청해 주세요.';

/** 수동 다운로드 팝업(NrmMetadataEditModal)과 동일 — 저장소 stem 충돌 시 다운로드 차단 */
const FILE_NAME_CONFLICT_MESSAGE = '동일한 이름의 파일이 있습니다.';

async function rejectIfDownloadFileNameConflicts(
  fileName: string,
): Promise<
  | {
      ok: false;
      error: string;
      message: string;
      nextHint: string;
    }
  | null
> {
  if (Platform.OS === 'web') return null;
  try {
    const { hasConflictingFileStemInDownloadDir } = await import(
      '@/lib/nrmPersistDownload.native'
    );
    const conflict = await hasConflictingFileStemInDownloadDir(fileName);
    if (!conflict) return null;
    logNrmDev(LOG, { event: 'file_name_conflict', fileName: fileName.slice(0, 120) });
    return {
      ok: false,
      error: 'file_name_conflict',
      message: FILE_NAME_CONFLICT_MESSAGE,
      nextHint:
        '저장소에 동일 파일명(확장자 제외)이 이미 있어 다운로드를 하지 않았다. 사용자에게 그 사실을 안내하고 start_music_download를 다시 호출하지 말 것.',
    };
  } catch (e) {
    logNrmRunError(LOG, e, { event: 'file_name_conflict_check_failed' });
    return null;
  }
}

export function isAiLabStartDownloadToolName(name: string): boolean {
  return name === 'start_music_download' || name === 'download_music';
}

export function aiLabOneDownloadPerRequestResult(): {
  result: Record<string, unknown>;
} {
  return {
    result: {
      ok: false,
      error: 'one_download_per_request',
      message: ONE_DOWNLOAD_PER_REQUEST_MESSAGE,
      nextHint:
        '이 요청에서는 더 이상 start_music_download를 호출하지 않는다. 사용자에게 새 메시지로 추가 곡을 요청하라고 안내.',
    },
  };
}

/**
 * lyricsOption → 앱 내부 lyricsMode.
 * AI Lab은 기본 none. 명시적 가사만 melon(번역 없음). 번역은 후속 도구.
 */
export function parseAiLabLyricsOption(raw: string | null | undefined): ParsedAiLabLyrics {
  const v = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  if (!v || v === 'none' || v === 'unset' || v === 'no' || v === '없이') {
    return { lyricsMode: 'unset', lyricsOption: 'none' };
  }
  // 명시적 가사 요청 — 번역 없이 Melon 정렬만 (번역은 translate_ai_lab_lyrics)
  if (
    v === 'ko' ||
    v === 'en' ||
    v === 'auto' ||
    v === 'melon' ||
    v === 'yes' ||
    v === '가사' ||
    v === 'lyrics' ||
    v === 'ko_translate' ||
    v === 'en_translate' ||
    v === 'auto_translate' ||
    v === 'melon_translation' ||
    v === '번역' ||
    v === '번역지원'
  ) {
    return { lyricsMode: 'melon', lyricsOption: 'auto' };
  }
  if (v === 'configured') return { lyricsMode: 'configured', lyricsOption: 'auto' };
  if (v === 'translation') return { lyricsMode: 'melon', lyricsOption: 'auto' };
  return { lyricsMode: 'unset', lyricsOption: 'none' };
}

export async function listReadyDownloadPlatforms(): Promise<{
  platforms: NrmAiLabReadyPlatform[];
  choices: NrmAiLabChoice[];
}> {
  const platforms: NrmAiLabReadyPlatform[] = [
    { id: MusicPlatformId.MELON, label: MelonProvider.label },
  ];
  return {
    platforms,
    choices: platforms.map((p) => ({ id: p.id, label: p.label })),
  };
}

function legacyToMusicPlatformId(platform: NrmAiLabDownloadPlatformId): MusicPlatformIdType {
  switch (platform) {
    case 'melon':
      return MusicPlatformId.MELON;
    case 'spotify':
      return MusicPlatformId.SPOTIFY_PREMIUM;
    case 'lastfm':
      return MusicPlatformId.LAST_FM;
    case 'appleMusic':
      return MusicPlatformId.APPLE_MUSIC;
    default:
      return DEFAULT_AI_LAB_MUSIC_PLATFORM_ID;
  }
}

export async function searchTrackOnPlatform(
  platform: NrmAiLabDownloadPlatformId,
  query: string,
): Promise<{ hits: NrmAiLabTrackHit[]; choices: NrmAiLabChoice[]; error?: string }> {
  const id = legacyToMusicPlatformId(platform);
  if (id !== MusicPlatformId.MELON) {
    return {
      hits: [],
      choices: [],
      error: `search_unsupported:${id}`,
    };
  }
  const out = await searchViaMusicMetadataProvider(query, MusicPlatformId.MELON);
  return { hits: out.hits, choices: out.choices, error: out.error };
}

async function searchMusicTool(
  query: string,
  fcPlatform: string | undefined,
): Promise<{ result: Record<string, unknown>; choices?: NrmAiLabChoice[] }> {
  if (!query) {
    return { result: { ok: false, error: 'missing_query' } };
  }

  const requested = normalizeMusicPlatformArg(fcPlatform);
  if (requested && requested !== MusicPlatformId.MELON) {
    const label = getAiLabMusicPlatformLabel(requested);
    return {
      result: {
        ok: false,
        error: 'platform_unsupported',
        platformId: requested,
        message: aiLabNonMelonSearchMessage(label),
        suggestMelon: true,
        nextHint:
          '안내 문구만 짧게. Melon 검색 여부는 choices(예/아니요)로 확인. search_music 재호출 금지. 사용자가 Melon을 수락하면 앱이 원요청+[ [AI_LAB_MELON_FALLBACK]로 다시 보낸다.',
      },
      choices: MELON_SEARCH_YES_NO_CHOICES,
    };
  }

  const out = await searchViaMusicMetadataProvider(query, MusicPlatformId.MELON);
  const count = out.hits.length;
  if (count > 0) cacheAiLabTrackHits(out.hits);
  return {
    result: {
      ok: !out.error && count > 0,
      hits: out.hits,
      error: out.error ?? null,
      count,
      kind: 'track',
      providerId: MusicPlatformId.MELON,
      platformId: MusicPlatformId.MELON,
      usedFcPlatform: Boolean(requested),
      preferenceId: MusicPlatformId.MELON,
      nextHint:
        count === 1
          ? '검색 결과 1건. 다운로드면 먼저 「다운로드를 진행합니다.」를 말한 뒤 start_music_download(hit, lyricsOption=none). 가사 미요청이면 capability로 되묻기. 요청당 1곡.'
          : count > 1
            ? '여러 후보(한 페이지 최대 5개+「다른 목록 보기」). 텍스트는 선택 안내만. 「다운로드를 진행합니다」금지. start_music_download·재검색 금지. choices 대기.'
            : out.error
              ? null
              : '검색 결과 없음',
    },
    choices: out.choices,
  };
}

async function searchArtistTool(
  query: string,
): Promise<{ result: Record<string, unknown>; choices?: NrmAiLabChoice[] }> {
  if (!query) return { result: { ok: false, error: 'missing_query' } };
  const out = await searchMelonArtistsViaProvider(query);
  const count = out.artists.length;
  return {
    result: {
      ok: !out.error && count > 0,
      artists: out.artists,
      error: out.error ?? null,
      count,
      kind: 'artist',
      providerId: MusicPlatformId.MELON,
      nextHint:
        count > 1
          ? '여러 아티스트 — choices로 선택 확인.'
          : count === 1
            ? '아티스트 1건. 정보 안내. 곡 다운로드가 필요하면 search_music으로 트랙 검색.'
            : '검색 결과 없음',
    },
    choices: out.choices,
  };
}

async function searchAlbumTool(
  query: string,
): Promise<{ result: Record<string, unknown>; choices?: NrmAiLabChoice[] }> {
  if (!query) return { result: { ok: false, error: 'missing_query' } };
  const out = await searchMelonAlbumsViaProvider(query);
  const count = out.albums.length;
  return {
    result: {
      ok: !out.error && count > 0,
      albums: out.albums,
      error: out.error ?? null,
      count,
      kind: 'album',
      providerId: MusicPlatformId.MELON,
      nextHint:
        count > 1
          ? '여러 앨범 — choices(가수 - 앨범명)로 선택 확인.'
          : count === 1
            ? '앨범 1건. 정보 안내. 수록곡 다운로드면 search_music으로 트랙 검색.'
            : '검색 결과 없음',
    },
    choices: out.choices,
  };
}

function extractMelonSongId(hit: NrmAiLabTrackHit): string | null {
  const fromRef = hit.ref.match(/^melon:(.+)$/i);
  if (fromRef?.[1]) return fromRef[1].trim();
  const fromUrl = hit.externalUrl.match(/songId=(\d+)/i);
  if (fromUrl?.[1]) return fromUrl[1].trim();
  return null;
}

function applyLyricsToMetadata(
  meta: NrmAudioFileMetadata,
  lyricsMode: NrmLyricsUiMode,
  alignLang?: 'ko' | 'en',
): NrmAudioFileMetadata {
  const next = { ...meta };
  if (lyricsMode === 'unset') {
    delete next.lyrics;
    delete next.melonAlignLang;
    return next;
  }
  next.lyrics = buildLyricsSentinel(lyricsMode);
  if (
    (lyricsMode === 'melon' || lyricsMode === 'melon_translation') &&
    (alignLang === 'ko' || alignLang === 'en')
  ) {
    next.melonAlignLang = alignLang;
  }
  return next;
}

export async function startMusicDownload(params: {
  hit: NrmAiLabTrackHit;
  lyricsMode: NrmLyricsUiMode;
  alignLang?: 'ko' | 'en';
  /** 사용자가 가사 생성을 명시했는지 (모델 게이트용) */
  explicitLyricsRequest?: boolean;
}): Promise<
  | {
      ok: true;
      needsYoutubeConfirm: true;
      youtubeConfirmSessionId: string;
      label: string;
      candidateCount: number;
      lyricsAskEligible: boolean;
      lyricsSkippedReason?: string;
      nextHint: string;
    }
  | {
      ok: true;
      needsYoutubeConfirm?: false;
      videoId: string;
      label: string;
      lyricsQueued: boolean;
      lyricsCapability: Awaited<ReturnType<typeof getAiLabLyricsCapability>>;
      lyricsAskEligible: boolean;
      lyricsSkippedReason?: string;
      askPrompt?: string | null;
      lyricsChoices?: NrmAiLabChoice[];
      nextHint?: string;
    }
  | { ok: false; error: string; message?: string }
> {
  if (Platform.OS === 'web') {
    return { ok: false, error: 'web_download_not_supported_in_ailab' };
  }

  if (params.hit.platform !== 'melon') {
    return { ok: false, error: 'melon_only_download' };
  }

  const artist = params.hit.artist.trim();
  const title = params.hit.title.trim();
  if (!artist || !title) {
    return { ok: false, error: 'missing_artist_or_title' };
  }

  const capability = await getAiLabLyricsCapability();
  let lyricsMode = params.lyricsMode;
  let lyricsSkippedReason: string | undefined;
  let lyricsQueued = false;

  if (params.explicitLyricsRequest || lyricsMode !== 'unset') {
    if (!capability.canGenerateLyrics) {
      lyricsMode = 'unset';
      lyricsSkippedReason = capability.message;
    } else {
      lyricsMode = 'melon';
      lyricsQueued = true;
    }
  } else {
    lyricsMode = 'unset';
  }

  const songId = extractMelonSongId(params.hit);
  let meta: NrmAudioFileMetadata = buildMelonSeedAudioMetadata(
    {
      songId: songId ?? undefined,
      artist,
      title,
      album: params.hit.album,
      genre: params.hit.genre,
      releaseDate: params.hit.releaseDate,
      imageUrl: params.hit.imageUrl,
    },
    artist,
    title,
  );

  if (songId) {
    try {
      const detailOut = await fetchMelonTrackDetail(songId);
      if (detailOut.ok) {
        meta = {
          ...buildMelonTrackAudioMetadata(detailOut.data, artist, title),
          downloadPlatform: 'Melon',
        };
      }
    } catch (e) {
      logNrmRunError(LOG, e, { event: 'melon_detail_failed', songId });
    }
  }

  if (lyricsMode !== 'unset') {
    meta = applyLyricsToMetadata(meta, lyricsMode, 'ko');
  } else {
    delete meta.melonAlignLang;
  }

  const encode = await loadDownloadEncodeSettings();
  const format = await loadDownloadFileNameFormat();
  const fileName = applyDownloadExtension(
    buildAudioFileName(meta.artist, meta.title, encode.extension, format),
    encode.extension,
  );
  const conflict = await rejectIfDownloadFileNameConflicts(fileName);
  if (conflict) return conflict;

  const ytQuery = `${meta.artist} ${meta.title}`.trim();
  logNrmDev(LOG, {
    event: 'youtube_search_start',
    query: ytQuery.slice(0, 80),
    songId: songId ?? null,
    lyricsMode,
  });
  const yt = await searchYoutube(ytQuery);
  if (!yt.ok || !yt.items?.length) {
    return { ok: false, error: yt.ok ? 'youtube_no_results' : yt.userMessage };
  }

  const displayLabel = `${meta.artist} - ${meta.title}`.trim();
  const lyricsAskEligible =
    !params.explicitLyricsRequest && !lyricsQueued && capability.canAskLyrics;

  void loadAlignModelPreference().catch(() => undefined);

  const session = createAiLabYoutubeConfirmSession({
    displayLabel,
    hit: { ...params.hit, platform: 'melon', artist, title },
    meta,
    fileName,
    lyricsMode,
    lyricsQueued,
    lyricsAskEligible,
    lyricsSkippedReason,
    explicitLyricsRequest: !!params.explicitLyricsRequest,
    ytQuery,
    candidates: yt.items.slice(0, AI_LAB_YOUTUBE_CONFIRM_MAX),
  });
  prepareAiLabYoutubeConfirmStream(session.sessionId);

  return {
    ok: true,
    needsYoutubeConfirm: true,
    youtubeConfirmSessionId: session.sessionId,
    label: displayLabel,
    candidateCount: session.candidates.length,
    lyricsAskEligible,
    lyricsSkippedReason,
    nextHint:
      'YouTube 후보 확인 UI가 앱에 표시됨. 사용자가 맞다/아니다를 고를 때까지 start_music_download·다운로드 안내 금지. 마크다운으로 맞다/아니다를 쓰지 말 것.',
  };
}

/** YouTube 후보 「맞다」— 기존 다운로드 파이프라인 시작 */
export async function confirmAiLabYoutubeCandidateAndDownload(
  sessionId: string,
): Promise<
  | {
      ok: true;
      videoId: string;
      label: string;
      lyricsQueued: boolean;
      lyricsAskEligible: boolean;
      lyricsSkippedReason?: string;
      lyricsChoices?: NrmAiLabChoice[];
      nextHint?: string;
    }
  | { ok: false; error: string; message?: string }
> {
  const session = getAiLabYoutubeConfirmSession(sessionId);
  if (!session) {
    return { ok: false, error: 'youtube_confirm_session_not_found' };
  }
  if (session.exhausted) {
    return { ok: false, error: 'youtube_confirm_exhausted' };
  }
  const videoId = currentCandidateVideoId(sessionId);
  if (!videoId) {
    return { ok: false, error: 'youtube_confirm_no_candidate' };
  }

  const conflict = await rejectIfDownloadFileNameConflicts(session.fileName);
  if (conflict) return conflict;

  if (!markAiLabYoutubeConfirmConfirmed(sessionId)) {
    return { ok: false, error: 'youtube_confirm_already_done' };
  }

  const {
    meta,
    fileName,
    hit,
    lyricsQueued,
    lyricsAskEligible,
    lyricsSkippedReason,
    displayLabel,
  } = session;
  const lyricsSplit = splitMetadataForDownloadStages(meta);
  const needsLyrics = !!(lyricsSplit?.whisperMode ?? lyricsSplit?.melonMode);
  const fileDisplayLabel = displayLabelFromAudioFileName(fileName);

  registerAiLabDownload({
    videoId,
    fileName,
    displayLabel: fileDisplayLabel,
    hit: {
      ...hit,
      platform: 'melon',
      title: hit.title,
      artist: hit.artist,
      album: hit.album ?? '',
      imageUrl: hit.imageUrl ?? '',
      externalUrl: hit.externalUrl ?? '',
      releaseDate: hit.releaseDate ?? '',
      genre: hit.genre ?? '',
      ref: hit.ref,
    },
    website: meta.website,
  });

  try {
    await setupNrmMobileDownloadNotifications();
    nrmNotifyDownloadQueued(videoId, fileDisplayLabel);
    void scheduleNativeDownloadJob({
      videoId,
      fileName,
      metadata: meta,
      isAborted: () => false,
      options: {
        melonLyricsPreloadOverride: needsLyrics ? AI_LAB_MELON_LYRICS_PRELOAD : undefined,
        onAudioDownloadStarted: () => {
          nrmNotifyDownloadStarted(videoId, fileDisplayLabel);
        },
        onAudioPersisted: (label, location) => {
          nrmNotifyDownloadFinished(videoId, fileDisplayLabel, true, 'audio');
          if (location?.audioUri) {
            updateAiLabDownloadAudio(videoId, {
              audioUri: location.audioUri,
              fileName: location.fileName || fileName,
              location,
            });
          }
          void label;
          if (needsLyrics) {
            nrmBackgroundWorkAcquire(nrmLyricsBackgroundWorkToken(videoId));
          }
          nrmBackgroundWorkRelease(nrmDownloadBackgroundWorkToken(videoId));
        },
        onLyricsStageStarted: () => {
          nrmNotifyDownloadStarted(videoId, fileDisplayLabel, 'lyrics');
          nrmBackgroundWorkAcquire(nrmLyricsBackgroundWorkToken(videoId));
        },
        onLyricsStageEnded: (success) => {
          nrmNotifyDownloadFinished(videoId, fileDisplayLabel, success, 'lyrics');
          nrmBackgroundWorkRelease(nrmLyricsBackgroundWorkToken(videoId));
          if (success && lyricsQueued) {
            void maybeAskTranslationAfterAiLabLyrics(videoId);
          }
        },
        onLyricsStageFailed: (warning) => {
          const reason =
            warning === 'memory_insufficient'
              ? '메모리가 부족합니다.'
              : warning === 'melon_align_failed'
                ? '가사 정렬에 실패했습니다.'
                : warning === 'translation_failed'
                  ? '번역에 실패했습니다.'
                  : warning === 'translation_exhausted'
                    ? '번역 사용량이 초과되었습니다.'
                    : undefined;
          void nrmNotifyLyricsFailed(fileDisplayLabel, videoId, reason);
        },
        onLyricsPersisted: () => {
          nrmNotifyDownloadFinished(videoId, fileDisplayLabel, true, 'lyrics');
        },
      },
    }).catch((e) => {
      if (needsLyrics) {
        nrmBackgroundWorkRelease(nrmLyricsBackgroundWorkToken(videoId));
      }
      logNrmRunError(LOG, e, { event: 'ailab_download_job_failed', videoId });
    });
    return {
      ok: true,
      videoId,
      label: displayLabel,
      lyricsQueued,
      lyricsAskEligible,
      lyricsSkippedReason,
      ...(lyricsAskEligible
        ? {
            lyricsChoices: LYRICS_YES_NO_CHOICES,
            nextHint:
              '다운로드 시작됨. 사용자에게 「가사도 생성을 할까요?」를 묻고, 예이면 start_ai_lab_lyrics 호출.',
          }
        : {
            nextHint: lyricsQueued
              ? '다운로드+가사 큐 시작(wav2vec2-base+transliterator). 영문이면 완료 후 번역 질문.'
              : '다운로드 시작. 가사 생성 안 함.',
          }),
    };
  } catch (e) {
    logNrmRunError(LOG, e, { event: 'confirm_download_failed', videoId });
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function executeAiLabDownloadTool(
  name: string,
  args: Record<string, unknown>,
  ctx?: Partial<AiLabDownloadToolContext>,
): Promise<{ result: Record<string, unknown>; choices?: NrmAiLabChoice[] }> {
  const toolCtx: AiLabDownloadToolContext = {
    musicPlatformId: MusicPlatformId.MELON,
  };
  void ctx;
  void toolCtx;

  if (name === 'list_ready_download_platforms') {
    const out = await listReadyDownloadPlatforms();
    return {
      result: {
        platforms: [
          {
            id: MusicPlatformId.MELON,
            label: MelonProvider.label,
            capabilities: MelonProvider.capabilities,
          },
        ],
        note: '이번 버전은 Melon만 검색·다운로드 지원',
      },
      choices: out.choices,
    };
  }
  if (name === 'search_music') {
    return searchMusicTool(
      String(args.query ?? '').trim(),
      args.platform != null ? String(args.platform) : undefined,
    );
  }
  if (name === 'search_music_artist') {
    return searchArtistTool(String(args.query ?? '').trim());
  }
  if (name === 'search_music_album') {
    return searchAlbumTool(String(args.query ?? '').trim());
  }
  if (name === 'search_melon_chart') {
    return searchMelonChartForAiLab({
      period: String(args.period ?? '') as
        | 'daily'
        | 'weekly'
        | 'monthly'
        | 'yearly'
        | 'realtime',
      date: args.date != null ? String(args.date) : undefined,
      rank: args.rank != null ? Number(args.rank) : undefined,
      limit: args.limit != null ? Number(args.limit) : undefined,
      genre: args.genre != null ? String(args.genre) : undefined,
      chart: args.chart != null ? String(args.chart) : undefined,
    });
  }
  if (name === 'search_track_on_platform') {
    const platform = String(args.platform ?? '') as NrmAiLabDownloadPlatformId;
    const query = String(args.query ?? '');
    if (platform !== 'melon' && normalizeMusicPlatformArg(platform) !== MusicPlatformId.MELON) {
      const label = getAiLabMusicPlatformLabel(
        normalizeMusicPlatformArg(platform) ?? MusicPlatformId.SPOTIFY,
      );
      return {
        result: {
          hits: [],
          error: 'platform_unsupported',
          message: aiLabNonMelonSearchMessage(label),
          suggestMelon: true,
          count: 0,
          nextHint:
            '안내 문구만 짧게. Melon 검색 여부는 choices(예/아니요)로 확인. 재검색 금지.',
        },
        choices: MELON_SEARCH_YES_NO_CHOICES,
      };
    }
    const out = await searchTrackOnPlatform('melon', query);
    if (out.hits.length > 0) cacheAiLabTrackHits(out.hits);
    return {
      result: {
        hits: out.hits,
        error: out.error ?? null,
        count: out.hits.length,
        platformId: MusicPlatformId.MELON,
      },
      choices: out.choices,
    };
  }
  if (name === 'get_ai_lab_lyrics_capability' || name === 'get_lyrics_download_options') {
    const cap = await getAiLabLyricsCapability();
    return {
      result: {
        ...cap,
        notes: [
          '가사 생성은 사용자가 명시한 경우에만. 미요청이면 다운로드 후 canAskLyrics일 때만 되묻기.',
          '정렬: wav2vec2-base + 다국어 발음 전처리(en-kotransliterator) 필수.',
          '번역은 가사 생성 후 영문일 때만, Google Translator 고정.',
        ],
      },
      choices: cap.choices,
    };
  }
  if (name === 'start_ai_lab_lyrics') {
    const hit = args.hit as NrmAiLabTrackHit | undefined;
    const videoId = args.videoId != null ? String(args.videoId) : undefined;
    const result = await startAiLabLyrics({ videoId, hit });
    const askTranslation = (result as { askTranslation?: boolean }).askTranslation === true;
    return {
      result,
      choices: askTranslation ? TRANSLATE_YES_NO_CHOICES : undefined,
    };
  }
  if (name === 'translate_ai_lab_lyrics') {
    const videoId = args.videoId != null ? String(args.videoId) : undefined;
    const result = await translateAiLabLyrics({ videoId });
    return { result };
  }
  if (isAiLabStartDownloadToolName(name)) {
    const hit = args.hit as NrmAiLabTrackHit | undefined;
    if (!hit?.title || !hit?.artist) {
      return { result: { ok: false, error: 'missing_hit' } };
    }
    const optionRaw =
      args.lyricsOption != null
        ? String(args.lyricsOption)
        : args.lyricsMode != null
          ? String(args.lyricsMode)
          : 'none';
    const parsed = parseAiLabLyricsOption(optionRaw);
    const explicit =
      args.explicitLyrics === true ||
      args.explicitLyrics === 'true' ||
      (parsed.lyricsOption !== 'none' && optionRaw.trim() !== '' && optionRaw !== 'none');
    const out = await startMusicDownload({
      hit: { ...hit, platform: 'melon' },
      lyricsMode: explicit ? 'melon' : 'unset',
      explicitLyricsRequest: explicit,
    });
    if (!out.ok) {
      return { result: out };
    }
    if (out.needsYoutubeConfirm) {
      return {
        result: {
          ...out,
          lyricsOption: explicit ? 'auto' : 'none',
        },
      };
    }
    return {
      result: {
        ...out,
        lyricsOption: explicit ? 'auto' : 'none',
        lyricsMode: explicit && out.lyricsQueued ? 'melon' : 'unset',
      },
      choices: out.lyricsAskEligible ? LYRICS_YES_NO_CHOICES : undefined,
    };
  }
  return { result: { ok: false, error: `unknown_tool:${name}` } };
}
