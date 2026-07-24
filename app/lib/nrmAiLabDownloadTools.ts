/**
 * AI Lab — Melon 전용 검색·가사 옵션·다운로드 시작.
 * 파이프라인: Melon 검색 → (선택) → Melon 메타 → YouTube → 임베드 → (선택) 가사
 */
import { Platform } from 'react-native';

import {
  aiLabNonMelonSearchMessage,
  DEFAULT_AI_LAB_MUSIC_PLATFORM_ID,
  getAiLabMusicPlatformLabel,
  MusicPlatformId,
  normalizeMusicPlatformArg,
  type MusicPlatformId as MusicPlatformIdType,
} from '@/lib/nrmAiLabMusicPlatform';
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
import { scheduleNativeDownloadJob } from '@/lib/nrmNativeDownloadOrchestrator';
import { MelonProvider, searchViaMusicMetadataProvider } from '@/lib/nrmMusicMetadataProvider';
import { buildAudioFileName } from '@/lib/nrmYoutubeDownloadMeta';
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
};

export type NrmAiLabChoice = { id: string; label: string };

/** AI Lab lyricsOption (FC) */
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

const LYRICS_OPTION_CHOICES: NrmAiLabChoice[] = [
  { id: 'ko', label: '1. 한국어 팩' },
  { id: 'en', label: '2. 영어 팩' },
  { id: 'auto_translate', label: '3. 번역지원' },
];

/**
 * lyricsOption → 앱 내부 lyricsMode/alignLang.
 * Melon 메타 기반이므로 melon / melon_translation 사용.
 */
export function parseAiLabLyricsOption(raw: string | null | undefined): ParsedAiLabLyrics {
  const v = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  if (!v || v === 'none' || v === 'unset' || v === 'no' || v === '없이') {
    return { lyricsMode: 'unset', lyricsOption: 'none' };
  }
  if (v === 'ko' || v === 'korean' || v === '한국어' || v === '한국어팩') {
    return { lyricsMode: 'melon', alignLang: 'ko', lyricsOption: 'ko' };
  }
  if (v === 'en' || v === 'english' || v === '영어' || v === '영어팩') {
    return { lyricsMode: 'melon', alignLang: 'en', lyricsOption: 'en' };
  }
  if (v === 'auto') {
    return { lyricsMode: 'melon', lyricsOption: 'auto' };
  }
  if (
    v === 'ko_translate' ||
    v === 'ko_translation' ||
    v === '한국어번역' ||
    v === '번역_ko'
  ) {
    return { lyricsMode: 'melon_translation', alignLang: 'ko', lyricsOption: 'ko_translate' };
  }
  if (
    v === 'en_translate' ||
    v === 'en_translation' ||
    v === '영어번역' ||
    v === '번역_en'
  ) {
    return { lyricsMode: 'melon_translation', alignLang: 'en', lyricsOption: 'en_translate' };
  }
  if (
    v === 'auto_translate' ||
    v === 'translate' ||
    v === 'translation' ||
    v === '번역' ||
    v === '번역지원'
  ) {
    return { lyricsMode: 'melon_translation', lyricsOption: 'auto_translate' };
  }
  // 레거시 FC lyricsMode 직접 전달
  if (v === 'melon') return { lyricsMode: 'melon', lyricsOption: 'auto' };
  if (v === 'melon_translation') {
    return { lyricsMode: 'melon_translation', lyricsOption: 'auto_translate' };
  }
  if (v === 'configured') return { lyricsMode: 'configured', lyricsOption: 'auto' };
  if (v === 'translation') {
    return { lyricsMode: 'translation', lyricsOption: 'auto_translate' };
  }
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
  _ctx: AiLabDownloadToolContext,
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
        nextHint: 'Melon으로 검색할지 사용자에게 확인한 뒤 search_music(query)만 호출.',
      },
    };
  }

  const out = await searchViaMusicMetadataProvider(query, MusicPlatformId.MELON);
  const count = out.hits.length;
  return {
    result: {
      ok: !out.error && count > 0,
      hits: out.hits,
      error: out.error ?? null,
      count,
      providerId: MusicPlatformId.MELON,
      platformId: MusicPlatformId.MELON,
      usedFcPlatform: Boolean(requested),
      preferenceId: MusicPlatformId.MELON,
      nextHint:
        count === 1
          ? '검색 결과 1건. 다운로드 의도·가사 옵션 확정이면 start_music_download(hit, lyricsOption). 찾기만이면 결과 안내.'
          : count > 1
            ? '여러 후보 — 사용자 선택 후 start_music_download. 선택은 choices 사용.'
            : out.error
              ? null
              : '검색 결과 없음',
    },
    choices: out.choices,
  };
}

export async function getLyricsDownloadOptions(): Promise<{
  options: Array<{ id: string; label: string }>;
  choices: NrmAiLabChoice[];
  askPrompt: string;
  notes: string[];
}> {
  return {
    options: LYRICS_OPTION_CHOICES.map((c) => ({ id: c.id, label: c.label })),
    choices: LYRICS_OPTION_CHOICES,
    askPrompt:
      '가사 생성 옵션을 선택해주세요.\n\n1. 한국어 팩\n\n2. 영어 팩\n\n3. 번역지원',
    notes: [
      '가사 요청만 있고 옵션이 없으면 Function Call 전에 위 질문을 먼저 한다.',
      '옵션이 이미 포함되면 start_music_download(lyricsOption)로 바로 진행.',
      '가사 요청이 없으면 lyricsOption=none (기본).',
    ],
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
}): Promise<{ ok: true; videoId: string; label: string } | { ok: false; error: string }> {
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
        // Melon plain 가사는 다운로드 시 lyricsOption이 있을 때만 sentinel로 덮어씀
      }
    } catch (e) {
      logNrmRunError(LOG, e, { event: 'melon_detail_failed', songId });
    }
  }

  if (params.lyricsMode !== 'unset') {
    meta = applyLyricsToMetadata(meta, params.lyricsMode, params.alignLang);
  } else {
    // 가사 생성 없음 — Melon 상세의 원문 가사는 메타로 유지(있으면)
    delete meta.melonAlignLang;
  }

  // YouTube 검색은 반드시 Melon 메타(아티스트+제목) 기준 — 사용자 원문 직접 검색 금지
  const ytQuery = `${meta.artist} ${meta.title}`.trim();
  logNrmDev(LOG, {
    event: 'youtube_search_start',
    query: ytQuery.slice(0, 80),
    songId: songId ?? null,
    lyricsMode: params.lyricsMode,
  });
  const yt = await searchYoutube(ytQuery);
  if (!yt.ok || !yt.items?.length) {
    return { ok: false, error: yt.ok ? 'youtube_no_results' : yt.userMessage };
  }
  const item = yt.items[0]!;
  const encode = await loadDownloadEncodeSettings();
  const format = await loadDownloadFileNameFormat();
  const fileName = applyDownloadExtension(
    buildAudioFileName(meta.artist, meta.title, encode.extension, format),
    encode.extension,
  );

  void loadAlignModelPreference().catch(() => undefined);

  try {
    void scheduleNativeDownloadJob({
      videoId: item.videoId,
      fileName,
      metadata: meta,
      isAborted: () => false,
    });
    return {
      ok: true,
      videoId: item.videoId,
      label: `${meta.artist} - ${meta.title}`,
    };
  } catch (e) {
    logNrmRunError(LOG, e, { event: 'start_download_failed' });
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
      toolCtx,
    );
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
          count: 0,
        },
      };
    }
    const out = await searchTrackOnPlatform('melon', query);
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
  if (name === 'get_lyrics_download_options') {
    const out = await getLyricsDownloadOptions();
    return {
      result: {
        options: out.options,
        askPrompt: out.askPrompt,
        notes: out.notes,
      },
      choices: out.choices,
    };
  }
  if (name === 'start_music_download' || name === 'download_music') {
    const hit = args.hit as NrmAiLabTrackHit | undefined;
    if (!hit?.title || !hit?.artist) {
      return { result: { ok: false, error: 'missing_hit' } };
    }
    // lyricsOption 우선, 없으면 레거시 lyricsMode
    const optionRaw =
      args.lyricsOption != null
        ? String(args.lyricsOption)
        : args.lyricsMode != null
          ? String(args.lyricsMode)
          : 'none';
    const parsed = parseAiLabLyricsOption(optionRaw);
    const alignRaw = String(args.alignLang ?? '');
    const alignLang =
      alignRaw === 'ko' || alignRaw === 'en' ? alignRaw : parsed.alignLang;
    const out = await startMusicDownload({
      hit: { ...hit, platform: 'melon' },
      lyricsMode: parsed.lyricsMode,
      alignLang,
    });
    return {
      result: {
        ...out,
        lyricsOption: parsed.lyricsOption,
        lyricsMode: parsed.lyricsMode,
      },
    };
  }
  return { result: { ok: false, error: `unknown_tool:${name}` } };
}
