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
  // 오디오 메타데이터 읽기와 LRC 사이드카 읽기는 독립적이므로 병렬 실행
  const lrcReadPromise = track.lrcUri
    ? FileSystem.readAsStringAsync(track.lrcUri, { encoding: EncodingType.UTF8 }).catch(() => '')
    : Promise.resolve('');

  const [meta, lrcText] = await Promise.all([
    readAudioFileMetadata(track.audioUri, track.fileName),
    lrcReadPromise,
  ]);

  const normalizedWebsite = normalizeMelonTrackWebsite(meta.website);
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
