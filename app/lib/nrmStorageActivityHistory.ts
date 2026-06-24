import type { NrmAudioFileMetadata } from '@/lib/nrmDownloadAudioMetadata';
import type { NrmDownloadTrackItem } from '@/lib/nrmDownloadTrackTypes';
import {
  appendActivityHistory,
  appendActivityHistoryBatch,
  type NrmActivityHistoryKind,
} from '@/lib/nrmActivityHistory';
import type { NrmLyricsUiMode } from '@/lib/nrmMelonLyrics';

function hasLyrics(mode: NrmLyricsUiMode): boolean {
  return mode !== 'unset';
}

function hasTranslation(mode: NrmLyricsUiMode): boolean {
  return mode === 'translation' || mode === 'melon_translation';
}

export function classifyLyricsHistoryKind(
  before: NrmLyricsUiMode,
  after: NrmLyricsUiMode,
  options?: { translationFailed?: boolean },
): NrmActivityHistoryKind | null {
  if (before === after) return null;

  const hadLyrics = hasLyrics(before);
  const hasLyricsNow = hasLyrics(after);
  const hadTrans = hasTranslation(before);
  const wantTranslation = hasTranslation(after);
  const translationOk = wantTranslation && !options?.translationFailed;

  if (!hadLyrics && hasLyricsNow) {
    return translationOk ? 'lyrics_translation' : 'lyrics';
  }
  if (hadLyrics && !hasLyricsNow) {
    return 'lyrics_remove';
  }
  if (hadLyrics && hasLyricsNow) {
    if (!hadTrans && wantTranslation) {
      return translationOk ? 'lyrics_add_translation' : 'lyrics';
    }
    if (hadTrans && !wantTranslation) return 'lyrics_remove_translation';
  }
  return null;
}

const METADATA_COMPARE_KEYS: (keyof Omit<NrmAudioFileMetadata, 'artist' | 'title' | 'lyrics'>)[] = [
  'album',
  'genre',
  'releaseDate',
  'coverUrl',
  'albumArtist',
  'trackNumber',
  'discNumber',
  'composer',
  'website',
  'nrmLyricsMode',
];

function norm(v: string | undefined): string {
  return (v ?? '').trim();
}

export function nonLyricsMetadataChanged(
  beforeArtist: string,
  beforeTitle: string,
  beforeFields: Omit<NrmAudioFileMetadata, 'artist' | 'title'>,
  after: NrmAudioFileMetadata,
  fileNameBefore: string,
  fileNameAfter: string,
): boolean {
  if (norm(fileNameBefore) !== norm(fileNameAfter)) return true;
  if (norm(beforeArtist) !== norm(after.artist)) return true;
  if (norm(beforeTitle) !== norm(after.title)) return true;
  for (const key of METADATA_COMPARE_KEYS) {
    if (norm(beforeFields[key]) !== norm(after[key])) return true;
  }
  return false;
}

export async function logStorageMetadataHistory(params: {
  track: NrmDownloadTrackItem;
  fileNameAfter: string;
  audioUriAfter: string;
  metadataAfter: NrmAudioFileMetadata;
  beforeArtist: string;
  beforeTitle: string;
  beforeFields: Omit<NrmAudioFileMetadata, 'artist' | 'title'>;
  lyricsModeBefore: NrmLyricsUiMode;
  lyricsModeAfter: NrmLyricsUiMode;
  lyricsSaved?: boolean;
  lyricsTranslationFailed?: boolean;
}): Promise<void> {
  const base = {
    fileName: params.fileNameAfter,
    audioUri: params.audioUriAfter,
  };

  const lyricsKind =
    params.lyricsSaved === false
      ? null
      : classifyLyricsHistoryKind(
          params.lyricsModeBefore,
          params.lyricsModeAfter,
          { translationFailed: params.lyricsTranslationFailed },
        );

  const metaChanged = nonLyricsMetadataChanged(
    params.beforeArtist,
    params.beforeTitle,
    params.beforeFields,
    params.metadataAfter,
    params.track.fileName,
    params.fileNameAfter,
  );

  // 항목이 2개 이상이면 한 번의 I/O로 일괄 기록 (read 1회 + write 1회)
  type EntryInput = Parameters<typeof appendActivityHistoryBatch>[0][number];
  const toWrite: EntryInput[] = [];
  if (lyricsKind) toWrite.push({ ...base, kind: lyricsKind });
  if (metaChanged) toWrite.push({ ...base, kind: 'metadata_edit' });
  await appendActivityHistoryBatch(toWrite);
}

export async function logStorageTrackRemoveHistory(track: NrmDownloadTrackItem): Promise<void> {
  await appendActivityHistory({
    fileName: track.fileName,
    audioUri: track.audioUri,
    kind: 'track_remove',
  });
}

export function findDownloadTrackForHistory(
  tracks: NrmDownloadTrackItem[],
  entry: { fileName: string; audioUri?: string },
): NrmDownloadTrackItem | null {
  if (entry.audioUri) {
    const byUri = tracks.find((t) => t.audioUri === entry.audioUri);
    if (byUri) return byUri;
  }
  const byName = tracks.find((t) => t.fileName === entry.fileName);
  if (byName) return byName;
  return null;
}
