-- Discover music_list: 관리자 수정 추적 + CRUD RPC

ALTER TABLE public.nrm_music_list
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NULL DEFAULT NULL;

COMMENT ON COLUMN public.nrm_music_list.updated_at IS '관리자 수정 시각 (미수정 시 NULL)';

CREATE OR REPLACE FUNCTION public.nrm_rpc_update_music_list_row(
  p_caller_serial text,
  p_id bigint,
  p_rank int,
  p_year int,
  p_artist text,
  p_title text,
  p_album text,
  p_genre text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.nrm_is_admin_caller(p_caller_serial) THEN
    RAISE EXCEPTION 'admin required';
  END IF;

  UPDATE public.nrm_music_list
  SET rank = p_rank,
      year = p_year,
      artist = trim(coalesce(p_artist, '')),
      title = trim(coalesce(p_title, '')),
      album = coalesce(trim(p_album), ''),
      genre = trim(coalesce(p_genre, '')),
      updated_at = now()
  WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'music_list row not found';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.nrm_rpc_delete_music_list_row(
  p_caller_serial text,
  p_id bigint
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.nrm_is_admin_caller(p_caller_serial) THEN
    RAISE EXCEPTION 'admin required';
  END IF;

  DELETE FROM public.nrm_music_list WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'music_list row not found';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.nrm_rpc_update_music_list_row(text, bigint, int, int, text, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nrm_rpc_delete_music_list_row(text, bigint) TO anon, authenticated;
