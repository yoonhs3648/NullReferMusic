-- nrm_music_list: seq 컬럼 제거 (id만 사용)

DROP INDEX IF EXISTS public.nrm_music_list_seq_unique;

ALTER TABLE public.nrm_music_list DROP COLUMN IF EXISTS seq;

DROP INDEX IF EXISTS public.nrm_music_list_year_rank_idx;
DROP INDEX IF EXISTS public.nrm_music_list_genre_year_rank_idx;

CREATE INDEX IF NOT EXISTS nrm_music_list_year_rank_idx
  ON public.nrm_music_list (year DESC, rank ASC, id ASC);

CREATE INDEX IF NOT EXISTS nrm_music_list_genre_year_rank_idx
  ON public.nrm_music_list (genre, year DESC, rank ASC, id ASC);
