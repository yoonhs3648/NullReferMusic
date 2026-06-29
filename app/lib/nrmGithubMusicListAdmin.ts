import { getNrmAppSerialNo } from '@/lib/nrmAppSerialNo';
import { logNrmDev, logNrmRunError } from '@/lib/nrmDevLog';
import type { NrmMusicListItem } from '@/lib/nrmMusicListTypes';
import { nrmSbRpc } from '@/lib/nrmSupabaseCrud';

export type NrmMusicListUpdateInput = {
  id: number;
  rank: number;
  year: number;
  artist: string;
  title: string;
  album: string;
  genre: string;
};

export async function updateMusicListRowOnGithub(input: NrmMusicListUpdateInput): Promise<void> {
  const tag = 'supabase-musiclist';
  logNrmDev(tag, { event: 'update-start', id: input.id });
  const t0 = Date.now();
  try {
    const callerSerial = await getNrmAppSerialNo();
    await nrmSbRpc<void>('nrm_rpc_update_music_list_row', {
      p_caller_serial: callerSerial ?? '',
      p_id: input.id,
      p_rank: input.rank,
      p_year: input.year,
      p_artist: input.artist.trim(),
      p_title: input.title.trim(),
      p_album: input.album.trim(),
      p_genre: input.genre.trim(),
    });
    logNrmDev(tag, { event: 'update-ok', id: input.id, elapsedMs: Date.now() - t0 });
  } catch (e) {
    if (e instanceof Error && e.message.includes('music_list row not found')) {
      throw new Error('음악 항목을 찾을 수 없습니다.');
    }
    logNrmRunError(tag, e, { event: 'update-error', id: input.id, elapsedMs: Date.now() - t0 });
    throw e;
  }
}

export async function deleteMusicListRowOnGithub(item: Pick<NrmMusicListItem, 'id'>): Promise<void> {
  const tag = 'supabase-musiclist';
  logNrmDev(tag, { event: 'delete-start', id: item.id });
  const t0 = Date.now();
  try {
    const callerSerial = await getNrmAppSerialNo();
    await nrmSbRpc<void>('nrm_rpc_delete_music_list_row', {
      p_caller_serial: callerSerial ?? '',
      p_id: item.id,
    });
    logNrmDev(tag, { event: 'delete-ok', id: item.id, elapsedMs: Date.now() - t0 });
  } catch (e) {
    if (e instanceof Error && e.message.includes('music_list row not found')) {
      throw new Error('음악 항목을 찾을 수 없습니다.');
    }
    logNrmRunError(tag, e, { event: 'delete-error', id: item.id, elapsedMs: Date.now() - t0 });
    throw e;
  }
}
