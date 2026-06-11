import {
  buildChartAudioMetadata,
  buildMainSearchAudioMetadata,
  normalizeDownloadMetadata,
  type NrmAudioFileMetadata,
} from '@/lib/nrmDownloadAudioMetadata';
import {
  buildAudioFileName,
  guessInitialDownloadFields,
} from '@/lib/nrmYoutubeDownloadMeta';
import { enrichLastfmDownloadMetadata } from '@/lib/nrmLastfmMetadataEnricher';
import { enrichMelonDownloadMetadata } from '@/lib/nrmMelonMetadataEnricher';
import { normalizeLastfmMbid } from '@/lib/nrmLastfmMbid';
import type { ChartTrackItem } from '@/lib/nrmChartsTypes';
import {
  loadDownloadAudioExtension,
  loadDownloadFileNameFormat,
} from '@/lib/nrmDownloadSettings';
import type { YoutubeSearchItem } from '@/lib/youtubeSearchClient';

export type DownloadMetadataContext = {
  chartTrack: ChartTrackItem | null;
  chartSource: 'chart' | 'lastfm' | 'melon' | null;
};

function resolveArtistTitle(
  item: YoutubeSearchItem,
  ctx: DownloadMetadataContext,
): { artist: string; title: string } {
  if (
    ctx.chartTrack &&
    (ctx.chartSource === 'chart' || ctx.chartSource === 'lastfm' || ctx.chartSource === 'melon')
  ) {
    return {
      artist: (ctx.chartTrack.artists ?? '').trim(),
      title: (ctx.chartTrack.title ?? '').trim(),
    };
  }
  return guessInitialDownloadFields(item);
}

/** 자동 설정 모드: 팝업 없이 ffmpeg에 넣을 메타데이터 */
export async function resolveAutoDownloadMetadata(
  item: YoutubeSearchItem,
  ctx: DownloadMetadataContext,
): Promise<NrmAudioFileMetadata> {
  const { artist, title } = resolveArtistTitle(item, ctx);

  if (ctx.chartSource === 'lastfm' && ctx.chartTrack) {
    const t = ctx.chartTrack;
    return normalizeDownloadMetadata(
      await enrichLastfmDownloadMetadata(
        {
          mbid:
            normalizeLastfmMbid(t.mbid) ||
            normalizeLastfmMbid(t.trackId) ||
            undefined,
          artist: t.artists,
          title: t.title,
          album: t.album,
          genre: t.genre,
          releaseDate: t.releaseDate,
          imageUrl: t.imageUrl,
        },
        artist,
        title,
      ),
    );
  }

  if (ctx.chartSource === 'chart' && ctx.chartTrack) {
    return normalizeDownloadMetadata(
      buildChartAudioMetadata(ctx.chartTrack, artist, title),
    );
  }

  if (ctx.chartSource === 'melon' && ctx.chartTrack) {
    const t = ctx.chartTrack;
    return normalizeDownloadMetadata(
      await enrichMelonDownloadMetadata(
        {
          songId: t.trackId,
          artist: t.artists,
          title: t.title,
          album: t.album,
          genre: t.genre,
          releaseDate: t.releaseDate,
          imageUrl: t.imageUrl,
        },
        artist,
        title,
      ),
    );
  }

  return normalizeDownloadMetadata(buildMainSearchAudioMetadata(artist, title));
}

export async function buildDownloadFileNameFromFields(
  artist: string,
  title: string,
): Promise<string> {
  const [ext, format] = await Promise.all([
    loadDownloadAudioExtension(),
    loadDownloadFileNameFormat(),
  ]);
  return buildAudioFileName(artist, title, ext, format);
}

export async function resolveDownloadFileName(
  item: YoutubeSearchItem,
  ctx: DownloadMetadataContext,
): Promise<string> {
  const { artist, title } = resolveArtistTitle(item, ctx);
  return buildDownloadFileNameFromFields(artist, title);
}

/** 트랙 정보 팝업 초기값 (artist/title 제외) */
export async function resolveModalInitialMetadataFields(
  item: YoutubeSearchItem,
  ctx: DownloadMetadataContext,
): Promise<Omit<NrmAudioFileMetadata, 'artist' | 'title'>> {
  const meta = await resolveAutoDownloadMetadata(item, ctx);
  const { artist: _a, title: _t, ...fields } = meta;
  return fields;
}
