-- Deprecated Discover 큐레이션 목록 제거 (nrm_music_list + admin/list RPCs)

DROP FUNCTION IF EXISTS public.nrm_rpc_music_list_genres();
DROP FUNCTION IF EXISTS public.nrm_rpc_update_music_list_row(text, bigint, int, int, text, text, text, text);
DROP FUNCTION IF EXISTS public.nrm_rpc_delete_music_list_row(text, bigint);
DROP TABLE IF EXISTS public.nrm_music_list CASCADE;
