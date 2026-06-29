import { NRM_SUPABASE_TABLES } from '@/lib/nrmSupabaseConfig';
import { nrmSbRpc, nrmSbSelect } from '@/lib/nrmSupabaseCrud';
import type { NrmSupabaseMusicListRow } from '@/lib/nrmSupabaseDatabase.types';
import { mapMusicListRow } from '@/lib/nrmSupabaseRows';
import type {
  NrmDiscoverYearFilter,
  NrmMusicListItem,
  NrmMusicListTextSearchField,
} from '@/lib/nrmMusicListTypes';
import { NRM_MUSIC_LIST_PAGE_SIZE } from '@/lib/nrmMusicListTypes';

export type NrmMusicListPageResult =
  | { ok: true; items: NrmMusicListItem[]; hasMore: boolean }
  | { ok: false; message: string };

export type NrmMusicListQueryFilters = {
  yearFilter: NrmDiscoverYearFilter;
  genreFilter: string;
  textField?: NrmMusicListTextSearchField | null;
  textQuery?: string;
};

function escapeIlikePattern(q: string): string {
  return q.replace(/[%_\\]/g, (ch) => `\\${ch}`);
}

export async function fetchMusicListGenres(): Promise<string[]> {
  const rows = await nrmSbRpc<{ genre: string }[]>('nrm_rpc_music_list_genres', {});
  return (Array.isArray(rows) ? rows : [])
    .map((r) => String(r.genre ?? '').trim())
    .filter(Boolean);
}

async function fetchMusicListPageInternal(
  offset: number,
  filters: NrmMusicListQueryFilters,
  pageSize: number,
  includeUpdatedAt: boolean,
): Promise<NrmMusicListPageResult> {
  try {
    const table = NRM_SUPABASE_TABLES.musicList;
    const { yearFilter, genreFilter, textField, textQuery } = filters;
    const trimmed = textQuery?.trim() ?? '';
    const rows = await nrmSbSelect<NrmSupabaseMusicListRow>(table, (q) => {
      const selectCols = includeUpdatedAt
        ? ('id,rank,year,artist,title,album,genre,updated_at' as const)
        : ('id,rank,year,artist,title,album,genre' as const);
      let query = q
        .select(selectCols)
        .order('year', { ascending: false })
        .order('rank', { ascending: true })
        .order('id', { ascending: true })
        .range(offset, offset + pageSize - 1);
      if (yearFilter === 'legacy') {
        query = query.lte('year', 1999);
      } else if (yearFilter !== 'all') {
        query = query.eq('year', yearFilter);
      }
      if (genreFilter !== 'all') {
        query = query.eq('genre', genreFilter);
      }
      if (trimmed && textField) {
        const pattern = `%${escapeIlikePattern(trimmed)}%`;
        query = query.ilike(textField, pattern);
      }
      return query;
    });
    const items = rows.map(mapMusicListRow);
    return { ok: true, items, hasMore: items.length >= pageSize };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, message: msg || '음악 목록을 불러오지 못했습니다.' };
  }
}

export async function fetchMusicListPage(
  offset: number,
  yearFilter: NrmDiscoverYearFilter,
  genreFilter: string,
  pageSize = NRM_MUSIC_LIST_PAGE_SIZE,
): Promise<NrmMusicListPageResult> {
  return fetchMusicListPageInternal(
    offset,
    { yearFilter, genreFilter },
    pageSize,
    false,
  );
}

export async function fetchMusicListPageForAdmin(
  offset: number,
  filters: NrmMusicListQueryFilters,
  pageSize = NRM_MUSIC_LIST_PAGE_SIZE,
): Promise<NrmMusicListPageResult> {
  return fetchMusicListPageInternal(offset, filters, pageSize, true);
}
