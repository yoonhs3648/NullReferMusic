/**
 * AI Lab — 다운로드용 플랫폼 준비 상태·검색·가사 옵션·다운로드 시작.
 * Edge Gemini functionCall의 클라이언트 실행부.
 */
import { Platform } from 'react-native';

import type { ChartTrackItem } from '@/lib/nrmChartsTypes';
import { buildChartAudioMetadata, type NrmAudioFileMetadata } from '@/lib/nrmDownloadAudioMetadata';
import {
  applyDownloadExtension,
  loadAlignModelPreference,
  loadDownloadEncodeSettings,
  loadDownloadFileNameFormat,
} from '@/lib/nrmDownloadSettings';
import { hasLastfmChartAccess } from '@/lib/nrmLastfmApiSettings';
import { searchLastfmTracks } from '@/lib/nrmLastfmSearchClient';
import {
  buildLyricsSentinel,
  type NrmLyricsUiMode,
} from '@/lib/nrmMelonLyrics';
import { searchMelonTracks } from '@/lib/nrmMelonSearchClient';
import { scheduleNativeDownloadJob } from '@/lib/nrmNativeDownloadOrchestrator';
import { loadAlignLyricsLangDetectionMode } from '@/lib/nrmAlignLyricsLangDetectionSettings';
import {
  NRM_LYRICS_MODE_LABELS,
  loadLyricsModeOrder,
  type NrmLyricsModeOrderId,
} from '@/lib/nrmLyricsOrderSettings';
import { hasSpotifyChartAccess } from '@/lib/nrmSpotifyApiSettings';
import { searchSpotifyTracks } from '@/lib/nrmSpotifySearchClient';
import { loadTranslationProvider } from '@/lib/nrmTranslationSettings';
import { getDeepLApiKey } from '@/lib/nrmDeepLApiSettings';
import { buildAudioFileName } from '@/lib/nrmYoutubeDownloadMeta';
import { searchYoutube } from '@/lib/youtubeSearchClient';
import { logNrmDev, logNrmRunError } from '@/lib/nrmDevLog';

export type NrmAiLabDownloadPlatformId = 'melon' | 'spotify' | 'lastfm' | 'appleMusic';

export type NrmAiLabReadyPlatform = {
  id: NrmAiLabDownloadPlatformId;
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

const LOG = 'ailab.downloadTools';

export async function listReadyDownloadPlatforms(): Promise<{
  platforms: NrmAiLabReadyPlatform[];
  choices: NrmAiLabChoice[];
}> {
  const [spotifyOk, lastfmOk] = await Promise.all([
    hasSpotifyChartAccess(),
    hasLastfmChartAccess(),
  ]);
  // Melon·Apple Music: 토큰 없음 — 앱에서 차트/검색 접근 가능하면 포함
  const platforms: NrmAiLabReadyPlatform[] = [
    { id: 'melon', label: 'Melon' },
    ...(spotifyOk ? [{ id: 'spotify' as const, label: 'Spotify' }] : []),
    ...(lastfmOk ? [{ id: 'lastfm' as const, label: 'Last.fm' }] : []),
    { id: 'appleMusic', label: 'Apple Music' },
  ];
  return {
    platforms,
    choices: platforms.map((p) => ({ id: p.id, label: p.label })),
  };
}

async function searchAppleMusicTracks(query: string): Promise<NrmAiLabTrackHit[]> {
  const q = encodeURIComponent(query.trim());
  if (!q) return [];
  const url = `https://itunes.apple.com/search?term=${q}&entity=song&limit=8&country=kr`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const json = (await res.json()) as {
    results?: Array<Record<string, unknown>>;
  };
  const rows = Array.isArray(json.results) ? json.results : [];
  return rows.map((r, i) => {
    const trackId = String(r.trackId ?? r.collectionId ?? i);
    const title = String(r.trackName ?? '');
    const artist = String(r.artistName ?? '');
    return {
      ref: `apple:${trackId}`,
      platform: 'appleMusic' as const,
      title,
      artist,
      album: String(r.collectionName ?? ''),
      imageUrl: String(r.artworkUrl100 ?? '').replace('100x100', '600x600'),
      externalUrl: String(r.trackViewUrl ?? r.collectionViewUrl ?? ''),
      releaseDate: String(r.releaseDate ?? '').slice(0, 10),
      genre: String(r.primaryGenreName ?? ''),
    };
  });
}

export async function searchTrackOnPlatform(
  platform: NrmAiLabDownloadPlatformId,
  query: string,
): Promise<{ hits: NrmAiLabTrackHit[]; choices: NrmAiLabChoice[]; error?: string }> {
  const q = query.trim();
  if (!q) return { hits: [], choices: [], error: 'empty_query' };

  try {
    if (platform === 'melon') {
      const out = await searchMelonTracks(q);
      if (!out.ok) return { hits: [], choices: [], error: out.errorCode ?? 'search_failed' };
      const hits: NrmAiLabTrackHit[] = (out.data.tracks ?? []).slice(0, 8).map((t) => ({
        ref: `melon:${t.songId}`,
        platform: 'melon',
        title: t.name,
        artist: t.artist,
        album: t.album,
        imageUrl: t.imageUrl,
        externalUrl: t.url,
        releaseDate: '',
        genre: '',
      }));
      return {
        hits,
        choices: hits.map((h) => ({
          id: h.ref,
          label: `${h.artist} - ${h.title}`.trim(),
        })),
      };
    }

    if (platform === 'spotify') {
      const out = await searchSpotifyTracks(q);
      if (!out.ok) return { hits: [], choices: [], error: out.errorCode ?? 'search_failed' };
      const hits: NrmAiLabTrackHit[] = (out.data.tracks ?? []).slice(0, 8).map((t) => ({
        ref: `spotify:${t.id}`,
        platform: 'spotify',
        title: t.name,
        artist: t.artists,
        album: t.albumName ?? '',
        imageUrl: t.imageUrl ?? '',
        externalUrl: t.spotifyUrl ?? '',
        releaseDate: '',
        genre: '',
      }));
      return {
        hits,
        choices: hits.map((h) => ({
          id: h.ref,
          label: `${h.artist} - ${h.title}`.trim(),
        })),
      };
    }

    if (platform === 'lastfm') {
      const out = await searchLastfmTracks(q);
      if (!out.ok) return { hits: [], choices: [], error: out.errorCode ?? 'search_failed' };
      const hits: NrmAiLabTrackHit[] = (out.data.tracks ?? []).slice(0, 8).map((t, i) => ({
        ref: `lastfm:${encodeURIComponent(t.artist)}|${encodeURIComponent(t.name)}|${i}`,
        platform: 'lastfm',
        title: t.name,
        artist: t.artist,
        album: '',
        imageUrl: t.imageUrl ?? '',
        externalUrl: t.url ?? '',
        releaseDate: '',
        genre: '',
      }));
      return {
        hits,
        choices: hits.map((h) => ({
          id: h.ref,
          label: `${h.artist} - ${h.title}`.trim(),
        })),
      };
    }

    const hits = await searchAppleMusicTracks(q);
    return {
      hits,
      choices: hits.map((h) => ({
        id: h.ref,
        label: `${h.artist} - ${h.title}`.trim(),
      })),
    };
  } catch (e) {
    logNrmRunError(LOG, e, { event: 'search_failed', platform, query: q.slice(0, 80) });
    return { hits: [], choices: [], error: e instanceof Error ? e.message : String(e) };
  }
}

export async function getLyricsDownloadOptions(): Promise<{
  options: Array<{ id: NrmLyricsModeOrderId; label: string }>;
  choices: NrmAiLabChoice[];
  alignLangRequired: boolean;
  alignLangChoices: NrmAiLabChoice[];
  notes: string[];
}> {
  const [order, alignMode, provider] = await Promise.all([
    loadLyricsModeOrder(),
    loadAlignLyricsLangDetectionMode(),
    loadTranslationProvider(),
  ]);
  const notes: string[] = [];
  if (provider === 'deepl') {
    const key = (await getDeepLApiKey()).trim();
    if (!key) notes.push('DeepL 키가 없어 번역 모드는 실패할 수 있어요.');
  }
  const alignLangRequired = alignMode === 'manual';
  const options = order.map((id) => ({
    id,
    label: NRM_LYRICS_MODE_LABELS[id],
  }));
  return {
    options,
    choices: options.map((o) => ({ id: o.id, label: o.label })),
    alignLangRequired,
    alignLangChoices: alignLangRequired
      ? [
          { id: 'ko', label: '한국어 언어팩 (KO)' },
          { id: 'en', label: '영어 언어팩 (EN)' },
        ]
      : [],
    notes,
  };
}

function hitToChartTrack(hit: NrmAiLabTrackHit): ChartTrackItem {
  return {
    rank: 1,
    trackId: hit.ref,
    title: hit.title,
    artists: hit.artist,
    album: hit.album,
    genre: hit.genre,
    imageUrl: hit.imageUrl,
    externalUrl: hit.externalUrl,
    durationMs: 0,
    popularity: 0,
    releaseDate: hit.releaseDate,
  };
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

  const track = hitToChartTrack(params.hit);
  let meta = buildChartAudioMetadata(track, params.hit.artist, params.hit.title);
  if (params.hit.platform === 'melon') meta = { ...meta, downloadPlatform: 'Melon' };
  if (params.hit.platform === 'spotify') meta = { ...meta, downloadPlatform: 'Spotify' };
  if (params.hit.platform === 'lastfm') meta = { ...meta, downloadPlatform: 'LastFm' };
  if (params.hit.platform === 'appleMusic') meta = { ...meta, downloadPlatform: 'AppleMusic' };
  meta = applyLyricsToMetadata(meta, params.lyricsMode, params.alignLang);

  const query = `${params.hit.artist} ${params.hit.title}`.trim();
  logNrmDev(LOG, { event: 'youtube_search_start', query: query.slice(0, 80) });
  const yt = await searchYoutube(query);
  if (!yt.ok || !yt.items?.length) {
    return { ok: false, error: yt.ok ? 'youtube_no_results' : yt.userMessage };
  }
  const item = yt.items[0]!;
  const encode = await loadDownloadEncodeSettings();
  const format = await loadDownloadFileNameFormat();
  const fileName = applyDownloadExtension(
    buildAudioFileName(params.hit.artist, params.hit.title, encode.extension, format),
    encode.extension,
  );

  // align 모델 프리로드 힌트 (실패 무시)
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
      label: `${params.hit.artist} - ${params.hit.title}`,
    };
  } catch (e) {
    logNrmRunError(LOG, e, { event: 'start_download_failed' });
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function executeAiLabDownloadTool(
  name: string,
  args: Record<string, unknown>,
): Promise<{ result: Record<string, unknown>; choices?: NrmAiLabChoice[] }> {
  if (name === 'list_ready_download_platforms') {
    const out = await listReadyDownloadPlatforms();
    return {
      result: { platforms: out.platforms },
      choices: out.choices,
    };
  }
  if (name === 'search_track_on_platform') {
    const platform = String(args.platform ?? '') as NrmAiLabDownloadPlatformId;
    const query = String(args.query ?? '');
    const out = await searchTrackOnPlatform(platform, query);
    return {
      result: {
        hits: out.hits,
        error: out.error ?? null,
        count: out.hits.length,
      },
      choices: out.choices,
    };
  }
  if (name === 'get_lyrics_download_options') {
    const out = await getLyricsDownloadOptions();
    return {
      result: {
        options: out.options,
        alignLangRequired: out.alignLangRequired,
        notes: out.notes,
      },
      choices: out.choices,
    };
  }
  if (name === 'start_music_download') {
    const hit = args.hit as NrmAiLabTrackHit | undefined;
    const lyricsMode = (String(args.lyricsMode ?? 'unset') || 'unset') as NrmLyricsUiMode;
    const alignRaw = String(args.alignLang ?? '');
    const alignLang = alignRaw === 'ko' || alignRaw === 'en' ? alignRaw : undefined;
    if (!hit?.title || !hit?.artist) {
      return { result: { ok: false, error: 'missing_hit' } };
    }
    const out = await startMusicDownload({ hit, lyricsMode, alignLang });
    return { result: out };
  }
  return { result: { ok: false, error: `unknown_tool:${name}` } };
}
