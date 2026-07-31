-- TrackHistory: 다운로드에 사용한 YouTube videoId 기록
-- Melon 메타(Website/songId)와 별개로, 실제 오디오 소스 영상을 확정할 수 있게 한다.

ALTER TABLE public."TrackHistory"
  ADD COLUMN IF NOT EXISTS "YoutubeVideoId" varchar NULL;

COMMENT ON COLUMN public."TrackHistory"."YoutubeVideoId"
IS '다운로드에 사용한 YouTube videoId (watch?v=). down/downFail 등 오디오 추출 경로에서만 채움. Melon Website(songId)와 별개.';

CREATE INDEX IF NOT EXISTS "IX_TrackHistory_YoutubeVideoId"
ON public."TrackHistory" ("YoutubeVideoId")
WHERE "YoutubeVideoId" IS NOT NULL;

CREATE OR REPLACE FUNCTION public.nrm_rpc_track_history_insert(
  p_serial_no varchar,
  p_row jsonb
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id bigint;
BEGIN
  IF coalesce(trim(p_serial_no), '') = '' THEN
    RAISE EXCEPTION 'SerialNo required';
  END IF;
  IF coalesce(trim(p_row->>'kind'), '') = '' THEN
    RAISE EXCEPTION 'kind required';
  END IF;

  INSERT INTO public."TrackHistory" (
    "SerialNo", "Kind", "Platform", "FileName", "AudioUri",
    "Title", "Artist", "Album", "AlbumArtist", "Genre",
    "ReleaseDate", "TrackNumber", "DiscNumber", "Composer", "Bpm",
    "Copyright", "Website", "Producer", "Remixer",
    "Lyrics", "LyricsMode", "AlbumCoverPath", "FailReason",
    "IsSuccess", "DownloadDate", "YoutubeVideoId"
  )
  VALUES (
    trim(p_serial_no),
    p_row->>'kind',
    p_row->>'platform',
    p_row->>'fileName',
    p_row->>'audioUri',
    p_row->>'title',
    p_row->>'artist',
    p_row->>'album',
    p_row->>'albumArtist',
    p_row->>'genre',
    p_row->>'releaseDate',
    p_row->>'trackNumber',
    p_row->>'discNumber',
    p_row->>'composer',
    p_row->>'bpm',
    p_row->>'copyright',
    p_row->>'website',
    p_row->>'producer',
    p_row->>'remixer',
    p_row->>'lyrics',
    p_row->>'lyricsMode',
    p_row->>'albumCoverPath',
    p_row->>'failReason',
    coalesce((p_row->>'isSuccess')::boolean, true),
    coalesce((p_row->>'downloadDate')::timestamptz, now()),
    NULLIF(trim(p_row->>'youtubeVideoId'), '')
  )
  RETURNING "ID" INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.nrm_rpc_track_history_insert(varchar, jsonb) TO anon, authenticated;
