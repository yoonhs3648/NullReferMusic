import * as FileSystem from 'expo-file-system/src/legacy/FileSystem';
import { EncodingType } from 'expo-file-system/src/legacy/FileSystem.types';

import type { NrmAudioFileMetadata } from '@/lib/nrmDownloadAudioMetadata';
import type { NrmDownloadTrackItem } from '@/lib/nrmDownloadTrackTypes';
import {
  isEmbeddedSyncLyricsText,
  lyricsUiModeToMetadataField,
  resolveStoredLyricsModeFromFlags,
} from '@/lib/nrmLrcUiMode';
import { resolveEditableArtistTitle } from '@/lib/nrmAudioMetadataTitle';
import {
  fetchMelonPlainLyricsFromWebsite,
  isMelonTrackWebsite,
  normalizeMelonTrackWebsite,
  type NrmLyricsUiMode,
} from '@/lib/nrmMelonLyrics';
import { readAudioFileMetadata } from '@/lib/nrmReadAudioMetadata';

const EMPTY_METADATA_FIELDS: Omit<NrmAudioFileMetadata, 'artist' | 'title'> = {
  album: '',
  genre: '',
  releaseDate: '',
  coverUrl: '',
};

export type TrackEditorBootstrapState = {
  initialArtist: string;
  initialTitle: string;
  initialFields: Omit<NrmAudioFileMetadata, 'artist' | 'title'>;
  initialLyricsMode: NrmLyricsUiMode;
  initialMelonLyricsAvailable: boolean;
  initialHasEmbeddedSyncLyrics: boolean;
};

export async function bootstrapTrackEditorState(
  track: NrmDownloadTrackItem,
): Promise<TrackEditorBootstrapState> {
  const meta = await readAudioFileMetadata(track.audioUri, track.fileName);
  const normalizedWebsite = normalizeMelonTrackWebsite(meta.website);
  let lrcText = '';
  if (track.lrcUri) {
    try {
      lrcText = await FileSystem.readAsStringAsync(track.lrcUri, {
        encoding: EncodingType.UTF8,
      });
    } catch {
      /* 사이드카 읽기 실패 시 내장 가사로 복원 */
    }
  }

  const embeddedSync = isEmbeddedSyncLyricsText(meta.lyrics) ? (meta.lyrics ?? '').trim() : '';

  let melonLyricsAvailable = false;
  if (isMelonTrackWebsite(normalizedWebsite)) {
    const plain = await fetchMelonPlainLyricsFromWebsite(normalizedWebsite);
    melonLyricsAvailable = plain.trim().length > 0;
  }

  const lyricsMode = resolveStoredLyricsModeFromFlags({
    hasSidecarLrc: !!track.lrcUri && lrcText.trim().length > 0,
    sidecarLrcText: lrcText,
    embeddedSyncLyrics: embeddedSync,
    embeddedLyricsMode: meta.nrmLyricsMode,
    melonTrackUrl: isMelonTrackWebsite(normalizedWebsite) ? normalizedWebsite : undefined,
  });

  const { artist, title } = resolveEditableArtistTitle(
    meta.artist,
    meta.title,
    track.displayLabel,
  );
  const { artist: _a, title: _t, ...rest } = meta;

  return {
    initialArtist: artist,
    initialTitle: title,
    initialFields: {
      ...rest,
      website: normalizedWebsite || rest.website,
      lyrics: lyricsUiModeToMetadataField(lyricsMode),
    },
    initialLyricsMode: lyricsMode,
    initialMelonLyricsAvailable: melonLyricsAvailable,
    initialHasEmbeddedSyncLyrics: embeddedSync.length > 0,
  };
}

export { EMPTY_METADATA_FIELDS };
