/**
 * History 탭 조회 — Supabase `TrackHistory`에서 현재 사용자(SerialNo)의 이력을 최신순으로 가져온다.
 * 상세: docs/supabase-tables/track-history.md
 */
import { getNrmAppSerialNo } from '@/lib/nrmAppSerialNo';
import { logNrmRunError } from '@/lib/nrmDevLog';
import {
  activityHistoryDisplayDaysToNumber,
  type NrmActivityHistoryDisplayDays,
} from '@/lib/nrmActivityHistorySettings';
import { NRM_SUPABASE_TABLES } from '@/lib/nrmSupabaseConfig';
import { nrmSbSelect } from '@/lib/nrmSupabaseCrud';
import type { NrmTrackHistoryRow } from '@/lib/nrmTrackHistoryTypes';

const TRACK_HISTORY_SELECT_COLUMNS =
  'ID,SerialNo,Kind,Platform,FileName,AudioUri,Title,Artist,Album,AlbumArtist,Genre,' +
  'ReleaseDate,TrackNumber,DiscNumber,Composer,Bpm,Copyright,Website,Producer,Remixer,' +
  'Lyrics,LyricsMode,AlbumCoverPath,YoutubeVideoId,FailReason,IsSuccess,DownloadDate';

const TRACK_HISTORY_FETCH_LIMIT = 500;

export async function fetchTrackHistoryForDisplay(
  displayDays: NrmActivityHistoryDisplayDays,
): Promise<NrmTrackHistoryRow[]> {
  const days = activityHistoryDisplayDaysToNumber(displayDays);
  if (days <= 0) return [];

  const serialNo = (await getNrmAppSerialNo()).trim();
  if (!serialNo) return [];

  const cutoffIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  try {
    const rows = await nrmSbSelect<NrmTrackHistoryRow>(
      NRM_SUPABASE_TABLES.trackHistory,
      (q) =>
        q
          .select(TRACK_HISTORY_SELECT_COLUMNS)
          .eq('SerialNo', serialNo)
          .gte('DownloadDate', cutoffIso)
          .order('DownloadDate', { ascending: false })
          .limit(TRACK_HISTORY_FETCH_LIMIT),
    );
    return rows;
  } catch (e) {
    logNrmRunError('trackHistory.remote', e, { event: 'fetch-for-display-failed' });
    return [];
  }
}
