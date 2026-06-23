import type { NrmAudioFileMetadata } from '@/lib/nrmDownloadAudioMetadata';
import type { NrmDownloadTrackItem } from '@/lib/nrmDownloadTrackTypes';
import {
  appendActivityHistory,
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
): NrmActivityHistoryKind | null {
  if (before === after) return null;

  const hadLyrics = hasLyrics(before);
  const hasLyricsNow = hasLyrics(after);
  const hadTrans = hasTranslation(before);
  const hasTransNow = hasTranslation(after);

  if (!hadLyrics && hasLyricsNow) {
    return hasTransNow ? 'lyrics_translation' : 'lyrics';
  }
  if (hadLyrics && !hasLyricsNow) {
    return 'lyrics_remove';
  }
  if (hadLyrics && hasLyricsNow) {
    if (!hadTrans && hasTransNow) return 'lyrics_add_translation';
    if (hadTrans && !hasTransNow) return 'lyrics_remove_translation';
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
}): Promise<void> {
  const base = {
    fileName: params.fileNameAfter,
    audioUri: params.audioUriAfter,
  };

  const lyricsKind = classifyLyricsHistoryKind(
    params.lyricsModeBefore,
    params.lyricsModeAfter,
  );
  if (lyricsKind) {
    await appendActivityHistory({ ...base, kind: lyricsKind });
  }

  if (
    nonLyricsMetadataChanged(
      params.beforeArtist,
      params.beforeTitle,
      params.beforeFields,
      params.metadataAfter,
      params.track.fileName,
      params.fileNameAfter,
    )
  ) {
    await appendActivityHistory({ ...base, kind: 'metadata_edit' });
  }
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
