/**
 * TrackHistory 원격 로깅 — 다운로드/가사생성(번역지원)/가사삭제/노래삭제/메타데이터수정 이벤트를
 * Supabase `TrackHistory` 테이블에 기록한다 (History 탭이 이 테이블을 조회, 상세: docs/supabase-tables/track-history.md).
 *
 * 이 모듈의 모든 공개 함수는 절대 throw하지 않는다 — 다운로드/편집/삭제 등 핵심 기능이
 * 네트워크 실패로 막히면 안 되기 때문에 항상 내부에서 에러를 삼키고 logNrmRunError로만 남긴다.
 * 호출부는 `void logXxx(...)` 형태로 fire-and-forget 하는 것이 기본 사용 패턴이다.
 */
import { getNrmAppSerialNo } from '@/lib/nrmAppSerialNo';
import { uploadAlbumCoverForTrackHistory } from '@/lib/nrmAlbumCoverUpload';
import { logNrmDev, logNrmRunError } from '@/lib/nrmDevLog';
import type { NrmAudioFileMetadata } from '@/lib/nrmDownloadAudioMetadata';
import { nrmSbRpc } from '@/lib/nrmSupabaseCrud';
import type {
  NrmTrackHistoryKind,
  NrmTrackHistoryLogParams,
  NrmTrackHistorySongFields,
} from '@/lib/nrmTrackHistoryTypes';

/** RPC(nrm_rpc_track_history_insert)로 한 건 기록. 내부용 — 바깥에서는 아래 logXxxTrackHistory를 쓴다. */
export async function logTrackHistory(params: NrmTrackHistoryLogParams): Promise<void> {
  try {
    const serialNo = (await getNrmAppSerialNo()).trim();
    if (!serialNo) {
      logNrmDev('trackHistory.remote', { event: 'skip-no-serial', kind: params.kind });
      return;
    }

    const row: Record<string, unknown> = {
      kind: params.kind,
      platform: params.platform || undefined,
      isSuccess: params.isSuccess ?? true,
      failReason: params.failReason || undefined,
      downloadDate: (params.downloadDate ?? new Date()).toISOString(),
      ...(params.song ?? {}),
    };

    logNrmDev('trackHistory.remote', {
      event: 'insert-start',
      kind: params.kind,
      isSuccess: row.isSuccess,
      hasSong: !!params.song,
    });
    await nrmSbRpc<number>('nrm_rpc_track_history_insert', {
      p_serial_no: serialNo,
      p_row: row,
    });
    logNrmDev('trackHistory.remote', { event: 'insert-ok', kind: params.kind });
  } catch (e) {
    logNrmRunError('trackHistory.remote', e, { event: 'insert-error', kind: params.kind });
  }
}

/** NrmAudioFileMetadata → TrackHistory song 필드 매핑 (앨범 커버 경로는 별도 처리) */
function songFieldsFromMetadata(
  metadata: NrmAudioFileMetadata | undefined,
  fileName?: string,
  audioUri?: string,
): NrmTrackHistorySongFields {
  return {
    fileName: fileName || undefined,
    audioUri: audioUri || undefined,
    title: metadata?.title || undefined,
    artist: metadata?.artist || undefined,
    album: metadata?.album || undefined,
    albumArtist: metadata?.albumArtist || undefined,
    genre: metadata?.genre || undefined,
    releaseDate: metadata?.releaseDate || undefined,
    trackNumber: metadata?.trackNumber || undefined,
    discNumber: metadata?.discNumber || undefined,
    composer: metadata?.composer || undefined,
    bpm: metadata?.bpm || undefined,
    copyright: metadata?.copyright || undefined,
    website: metadata?.website || undefined,
    producer: metadata?.producer || undefined,
    remixer: metadata?.remixer || undefined,
  };
}

/** 다운로드 성공/실패 기록. 성공 시에만 앨범 커버를 Storage에 업로드해 AlbumCoverPath를 채운다. */
export async function logDownloadTrackHistory(params: {
  metadata: NrmAudioFileMetadata | undefined;
  fileName: string;
  audioUri: string;
  isSuccess: boolean;
  failReason?: string;
}): Promise<void> {
  const song = songFieldsFromMetadata(params.metadata, params.fileName, params.audioUri);

  if (params.isSuccess && params.metadata?.coverUrl) {
    try {
      song.albumCoverPath =
        (await uploadAlbumCoverForTrackHistory(
          params.metadata.coverUrl,
          params.metadata.artist,
          params.metadata.title,
        )) ?? undefined;
    } catch (e) {
      logNrmRunError('trackHistory.remote', e, { event: 'cover-upload-error' });
    }
  }

  await logTrackHistory({
    kind: params.isSuccess ? 'down' : 'downFail',
    platform: params.metadata?.downloadPlatform,
    isSuccess: params.isSuccess,
    failReason: params.failReason,
    song,
  });
}

/** 가사 생성/번역지원 생성 성공·실패 기록 */
export async function logLyricsTrackHistory(params: {
  kind: NrmTrackHistoryKind;
  metadata: NrmAudioFileMetadata | undefined;
  fileName: string;
  audioUri: string;
  isSuccess: boolean;
  failReason?: string;
  platform?: string;
  lyricsMode?: string;
  plainLyrics?: string;
}): Promise<void> {
  const song = songFieldsFromMetadata(params.metadata, params.fileName, params.audioUri);
  song.lyricsMode = params.lyricsMode;
  song.lyrics = params.plainLyrics?.trim() || undefined;

  await logTrackHistory({
    kind: params.kind,
    platform: params.platform,
    isSuccess: params.isSuccess,
    failReason: params.failReason,
    song,
  });
}

/** 트랙(노래) 삭제 기록 — 삭제 실행 전에 호출해야 메타데이터를 읽을 수 있다 */
export async function logTrackRemoveHistory(params: {
  metadata: NrmAudioFileMetadata | undefined;
  fileName: string;
  audioUri: string;
  plainLyrics?: string;
}): Promise<void> {
  const song = songFieldsFromMetadata(params.metadata, params.fileName, params.audioUri);
  song.lyrics = params.plainLyrics?.trim() || undefined;
  song.lyricsMode = params.metadata?.nrmLyricsMode || undefined;

  await logTrackHistory({
    kind: 'del',
    isSuccess: true,
    song,
  });
}

/** 가사 외 메타데이터만 수정된 경우 기록 */
export async function logMetadataEditTrackHistory(params: {
  metadata: NrmAudioFileMetadata | undefined;
  fileName: string;
  audioUri: string;
}): Promise<void> {
  const song = songFieldsFromMetadata(params.metadata, params.fileName, params.audioUri);

  await logTrackHistory({
    kind: 'metadataEdit',
    isSuccess: true,
    song,
  });
}
