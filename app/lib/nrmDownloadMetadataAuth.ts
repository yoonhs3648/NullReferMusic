import {
  ensureLastfmChartAccess,
  promptLastfmChartAuthInvalid,
} from '@/lib/nrmChartTokenGate';
import type { LastfmAuthHandlers } from '@/lib/nrmLastfmAuthFlow';
import type { NrmAudioFileMetadata } from '@/lib/nrmDownloadAudioMetadata';
import {
  buildChartAudioMetadata,
  buildMainSearchAudioMetadata,
  normalizeDownloadMetadata,
} from '@/lib/nrmDownloadAudioMetadata';
import {
  enrichLastfmDownloadMetadata,
  LastfmMetadataApiError,
  type LastfmDownloadSeed,
} from '@/lib/nrmLastfmMetadataEnricher';
import type { LastfmSearchErrorCode } from '@/lib/nrmLastfmSearchTypes';
import type { DownloadMetadataContext } from '@/lib/nrmResolveDownloadPayload';
import type { YoutubeSearchItem } from '@/lib/youtubeSearchClient';
import { guessInitialDownloadFields } from '@/lib/nrmYoutubeDownloadMeta';

export type DownloadMetadataAuthHandlers = LastfmAuthHandlers & {
  onOpenSpotifyTokenSettings?: () => void;
};

export class DownloadMetadataUnavailableError extends Error {
  readonly code: LastfmSearchErrorCode;

  constructor(code: LastfmSearchErrorCode) {
    super('download_metadata_unavailable');
    this.name = 'DownloadMetadataUnavailableError';
    this.code = code;
  }
}

/** 인증 오버레이·설정 안내 후 다운로드 중단 (메타데이터 실패 오버레이와 구분) */
export class DownloadMetadataAuthInterruptedError extends Error {
  constructor() {
    super('download_metadata_auth_interrupted');
    this.name = 'DownloadMetadataAuthInterruptedError';
  }
}

function resolveArtistTitle(
  item: YoutubeSearchItem,
  ctx: DownloadMetadataContext,
): { artist: string; title: string } {
  if (
    ctx.chartTrack &&
    (ctx.chartSource === 'chart' || ctx.chartSource === 'lastfm')
  ) {
    return {
      artist: (ctx.chartTrack.artists ?? '').trim(),
      title: (ctx.chartTrack.title ?? '').trim(),
    };
  }
  return guessInitialDownloadFields(item);
}

/**
 * Last.fm 메타 API 인증 실패 — Spotify Charts와 동일:
 * 토큰 갱신·재시도 후에도 실패 시 Web confirm / 앱 오버레이 → API 설정
 */
export async function handleDownloadMetadataAuthFailure(
  code: LastfmSearchErrorCode,
  handlers: DownloadMetadataAuthHandlers,
): Promise<never> {
  if (code === 'not_configured') {
    await ensureLastfmChartAccess(handlers);
    throw new DownloadMetadataAuthInterruptedError();
  }

  if (code === 'auth_failed') {
    await promptLastfmChartAuthInvalid(handlers, 'auth_failed');
    throw new DownloadMetadataAuthInterruptedError();
  }

  throw new DownloadMetadataUnavailableError(code);
}

async function enrichLastfmForDownload(
  item: YoutubeSearchItem,
  ctx: DownloadMetadataContext,
  handlers: DownloadMetadataAuthHandlers,
): Promise<NrmAudioFileMetadata> {
  const { artist, title } = resolveArtistTitle(item, ctx);
  const t = ctx.chartTrack!;

  const seed: LastfmDownloadSeed = {
    mbid: t.mbid || t.trackId,
    artist: t.artists,
    title: t.title,
    album: t.album,
    genre: t.genre,
    releaseDate: t.releaseDate,
    imageUrl: t.imageUrl,
  };

  try {
    return await enrichLastfmDownloadMetadata(seed, artist, title);
  } catch (e) {
    if (e instanceof LastfmMetadataApiError) {
      await handleDownloadMetadataAuthFailure(e.errorCode, handlers);
    }
    throw e;
  }
}

export async function resolveAutoDownloadMetadataWithAuth(
  item: YoutubeSearchItem,
  ctx: DownloadMetadataContext,
  handlers: DownloadMetadataAuthHandlers,
): Promise<NrmAudioFileMetadata> {
  const { artist, title } = resolveArtistTitle(item, ctx);

  if (ctx.chartSource === 'lastfm' && ctx.chartTrack) {
    return enrichLastfmForDownload(item, ctx, handlers);
  }

  if (ctx.chartSource === 'chart' && ctx.chartTrack) {
    return normalizeDownloadMetadata(
      buildChartAudioMetadata(ctx.chartTrack, artist, title),
    );
  }

  return normalizeDownloadMetadata(buildMainSearchAudioMetadata(artist, title));
}

export async function resolveModalInitialMetadataFieldsWithAuth(
  item: YoutubeSearchItem,
  ctx: DownloadMetadataContext,
  handlers: DownloadMetadataAuthHandlers,
): Promise<Omit<NrmAudioFileMetadata, 'artist' | 'title'>> {
  const meta = await resolveAutoDownloadMetadataWithAuth(item, ctx, handlers);
  const { artist: _a, title: _t, ...fields } = meta;
  return fields;
}
