import { Platform } from 'react-native';

import type { NrmAudioFileMetadata } from '@/lib/nrmDownloadAudioMetadata';
import type { NrmDownloadTrackItem } from '@/lib/nrmDownloadTrackTypes';
import {
  appendActivityHistory,
  appendActivityHistoryBatch,
  type NrmActivityHistoryKind,
} from '@/lib/nrmActivityHistory';
import type { NrmLyricsUiMode } from '@/lib/nrmMelonLyrics';
import { extractPlainLyricsFromLrcText } from '@/lib/nrmMelonLyrics';
import { readAudioFileMetadata } from '@/lib/nrmReadAudioMetadata';
import { siblingLrcUri } from '@/lib/nrmSiblingLrc';
import { loadAlignModelPreference, loadWhisperModelPreference } from '@/lib/nrmDownloadSettings';
import { logNrmRunError } from '@/lib/nrmDevLog';
import {
  logLyricsTrackHistory,
  logMetadataEditTrackHistory,
  logTrackRemoveHistory,
} from '@/lib/nrmTrackHistoryRemote';
import type { NrmTrackHistoryKind } from '@/lib/nrmTrackHistoryTypes';

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
    if (wantTranslation && options?.translationFailed) return 'lyrics_translation_failed';
    return translationOk ? 'lyrics_translation' : 'lyrics';
  }
  if (hadLyrics && !hasLyricsNow) {
    return 'lyrics_remove';
  }
  if (hadLyrics && hasLyricsNow) {
    if (!hadTrans && wantTranslation) {
      if (options?.translationFailed) return 'lyrics_translation_failed';
      return translationOk ? 'lyrics_add_translation' : 'lyrics';
    }
    if (hadTrans && !wantTranslation) return 'lyrics_remove_translation';
  }
  return null;
}

/** 로컬 활동기록 kind → 원격 TrackHistory.Kind */
function trackHistoryKindForLyrics(
  kind: NrmActivityHistoryKind,
): NrmTrackHistoryKind | null {
  switch (kind) {
    case 'lyrics':
      return 'lyrics';
    case 'lyrics_translation':
    case 'lyrics_add_translation':
      return 'transdLyrics';
    case 'lyrics_translation_failed':
      return 'transdLyricsFail';
    case 'lyrics_remove':
      return 'delLyrics';
    case 'lyrics_remove_translation':
      return 'delTransdLyrics';
    default:
      return null;
  }
}

/** 현재(수정 이후) 저장된 가사를 원문(plain, 타임스탬프 제거) 텍스트로 읽어온다. 실패 시 빈 문자열. */
async function resolveCurrentPlainLyricsText(
  audioUri: string,
  fileName: string,
): Promise<string> {
  if (Platform.OS === 'web') return '';
  try {
    const FileSystem = await import('expo-file-system/src/legacy/FileSystem');
    try {
      const sidecar = await FileSystem.readAsStringAsync(siblingLrcUri(audioUri));
      if (sidecar.trim()) return extractPlainLyricsFromLrcText(sidecar).trim();
    } catch {
      /* 사이드카 없음 → 내장 가사 시도 */
    }
    const meta = await readAudioFileMetadata(audioUri, fileName);
    const embedded = (meta.lyrics ?? '').trim();
    if (embedded) return extractPlainLyricsFromLrcText(embedded).trim();
  } catch (e) {
    logNrmRunError('trackHistory.remote', e, { event: 'resolve-plain-lyrics-failed' });
  }
  return '';
}

/** 현재(수정 이후) 가사모드에 맞는 모델 ID(TrackHistory.Platform) 조회 */
async function resolveLyricsPlatformForMode(mode: NrmLyricsUiMode): Promise<string | undefined> {
  try {
    if (mode === 'melon' || mode === 'melon_translation') return await loadAlignModelPreference();
    if (mode === 'configured' || mode === 'translation') return await loadWhisperModelPreference();
  } catch {
    /* ignore */
  }
  return undefined;
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

  if (lyricsKind) {
    const remoteKind = trackHistoryKindForLyrics(lyricsKind);
    if (remoteKind) {
      const [plainLyrics, platform] = await Promise.all([
        resolveCurrentPlainLyricsText(params.audioUriAfter, params.fileNameAfter),
        resolveLyricsPlatformForMode(params.lyricsModeAfter),
      ]);
      void logLyricsTrackHistory({
        kind: remoteKind,
        metadata: params.metadataAfter,
        fileName: params.fileNameAfter,
        audioUri: params.audioUriAfter,
        isSuccess: remoteKind !== 'transdLyricsFail',
        failReason: remoteKind === 'transdLyricsFail' ? 'translation_failed' : undefined,
        platform,
        lyricsMode: params.lyricsModeAfter,
        plainLyrics,
      });
    }
  }
  if (metaChanged) {
    void logMetadataEditTrackHistory({
      metadata: params.metadataAfter,
      fileName: params.fileNameAfter,
      audioUri: params.audioUriAfter,
    });
  }
}

export async function logStorageTrackRemoveHistory(track: NrmDownloadTrackItem): Promise<void> {
  await appendActivityHistory({
    fileName: track.fileName,
    audioUri: track.audioUri,
    kind: 'track_remove',
  });

  try {
    const [metadata, plainLyrics] = await Promise.all([
      readAudioFileMetadata(track.audioUri, track.fileName).catch(
        () => undefined as NrmAudioFileMetadata | undefined,
      ),
      resolveCurrentPlainLyricsText(track.audioUri, track.fileName),
    ]);
    void logTrackRemoveHistory({
      metadata,
      fileName: track.fileName,
      audioUri: track.audioUri,
      plainLyrics,
    });
  } catch (e) {
    logNrmRunError('trackHistory.remote', e, { event: 'log-track-remove-failed' });
  }
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
