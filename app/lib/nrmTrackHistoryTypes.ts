/**
 * Supabase `TrackHistory` 테이블 관련 타입.
 * 다운로드/가사생성(번역지원)/가사삭제/노래삭제/메타데이터수정 이력 — History 탭이 이 테이블을 조회한다.
 * 상세: docs/supabase-tables/track-history.md
 */

/** DB `CK_TrackHistory_Kind` CHECK 제약과 반드시 동일하게 유지 */
export type NrmTrackHistoryKind =
  | 'down'
  | 'downFail'
  | 'del'
  | 'lyrics'
  | 'lyricsFail'
  | 'delLyrics'
  | 'transdLyrics'
  | 'transdLyricsFail'
  | 'delTransdLyrics'
  | 'metadataEdit';

/** 노래 메타데이터 계열 컬럼 — 이벤트 시점에 알 수 있는 만큼만 채우고 나머지는 비워둔다(NULL 허용) */
export type NrmTrackHistorySongFields = {
  fileName?: string;
  audioUri?: string;
  title?: string;
  artist?: string;
  album?: string;
  albumArtist?: string;
  genre?: string;
  releaseDate?: string;
  trackNumber?: string;
  discNumber?: string;
  composer?: string;
  bpm?: string;
  copyright?: string;
  website?: string;
  producer?: string;
  remixer?: string;
  /** 원문(plain, 타임스탬프 제거) 가사 텍스트 */
  lyrics?: string;
  lyricsMode?: string;
  albumCoverPath?: string;
  /** 다운로드에 사용한 YouTube videoId (watch?v=). Melon Website와 별개 */
  youtubeVideoId?: string;
};

export type NrmTrackHistoryLogParams = {
  kind: NrmTrackHistoryKind;
  /** 다운로드 플랫폼(YouTube/Melon/Spotify/AppleMusic/LastFm) 또는 가사생성 모델 ID */
  platform?: string;
  isSuccess?: boolean;
  failReason?: string;
  song?: NrmTrackHistorySongFields;
  /** 지정 안 하면 now() */
  downloadDate?: Date;
};

/** Supabase에서 SELECT로 읽어오는 원격 행 (PostgREST PascalCase 그대로) */
export type NrmTrackHistoryRow = {
  ID: number;
  SerialNo: string;
  Kind: NrmTrackHistoryKind;
  Platform: string | null;
  FileName: string | null;
  AudioUri: string | null;
  Title: string | null;
  Artist: string | null;
  Album: string | null;
  AlbumArtist: string | null;
  Genre: string | null;
  ReleaseDate: string | null;
  TrackNumber: string | null;
  DiscNumber: string | null;
  Composer: string | null;
  Bpm: string | null;
  Copyright: string | null;
  Website: string | null;
  Producer: string | null;
  Remixer: string | null;
  Lyrics: string | null;
  LyricsMode: string | null;
  AlbumCoverPath: string | null;
  YoutubeVideoId: string | null;
  FailReason: string | null;
  IsSuccess: boolean;
  DownloadDate: string;
};
