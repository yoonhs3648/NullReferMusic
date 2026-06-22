import type { NrmDownloadTrackItem } from '@/lib/nrmDownloadTrackTypes';
import type { NrmAudioFileMetadata } from '@/lib/nrmDownloadAudioMetadata';
import type { NrmLyricsUiMode } from '@/lib/nrmMelonLyrics';
import {
  normalizeMelonTrackWebsite,
  resolveMelonPlainLyricsForEdit,
} from '@/lib/nrmMelonLyrics';
import { resolveLyricsSidecarAction } from '@/lib/nrmLrcUiMode';
import { splitMetadataForDownloadStages } from '@/lib/nrmWhisperLyrics';
import { transcribeWhisperLrc } from '@/lib/nrmWhisperLrcStage';
import { notifyUser } from '@/lib/nrmUserNotify';
import { invalidateAudioMetadataCache } from '@/lib/nrmReadAudioMetadata';
import {
  readWebTrackLrcText,
  updateWebTrackMetadata,
} from '@/lib/nrmWebDownloadTrackCatalog';

export type ApplyTrackMetadataUpdateInput = {
  track: NrmDownloadTrackItem;
  newFileName: string;
  metadata: NrmAudioFileMetadata;
  initialLyricsMode: NrmLyricsUiMode;
  newLyricsMode: NrmLyricsUiMode;
  hasEmbeddedSyncLyrics?: boolean;
};

async function readExistingSyncLrcText(track: NrmDownloadTrackItem): Promise<string | null> {
  if (track.lrcUri) {
    const sidecar = await readWebTrackLrcText(track.lrcUri);
    if (sidecar?.trim()) return sidecar.trim();
  }
  return null;
}

export async function applyTrackMetadataUpdate(
  input: ApplyTrackMetadataUpdateInput,
): Promise<void> {
  const { track, newFileName, metadata, initialLyricsMode, newLyricsMode, hasEmbeddedSyncLyrics } =
    input;
  if (track.location.kind !== 'web') {
    throw new Error('웹 트랙만 편집할 수 있습니다.');
  }

  const { ffmpegMetadata } = splitMetadataForDownloadStages(metadata);
  const lyricsAction = resolveLyricsSidecarAction(
    initialLyricsMode,
    newLyricsMode,
    track.lrcUri,
    hasEmbeddedSyncLyrics,
  );
  const displayLabel = `${metadata.artist.trim()} - ${metadata.title.trim()}`;
  const ext = newFileName.slice(newFileName.lastIndexOf('.')).toLowerCase();

  invalidateAudioMetadataCache(track.audioUri);

  if (lyricsAction.kind === 'none' || lyricsAction.kind === 'delete') {
    await updateWebTrackMetadata(track.location.trackId, {
      fileName: newFileName,
      displayLabel,
      metadata: ffmpegMetadata,
      lrcText: lyricsAction.kind === 'delete' ? '' : undefined,
    });
    return;
  }

  if (lyricsAction.kind === 'translate-lrc') {
    const existingLrcText = (await readExistingSyncLrcText(track))?.trim() ?? '';
    if (!existingLrcText) throw new Error('기존 가사 파일을 읽을 수 없습니다.');
    const { translateLrcToKorean } = await import('@/lib/nrmTranslationClient');
    const translated = await translateLrcToKorean(existingLrcText);
    const lrcText = translated.ok ? translated.lrc : existingLrcText;
    await updateWebTrackMetadata(track.location.trackId, {
      fileName: newFileName,
      displayLabel,
      metadata: ffmpegMetadata,
      lrcText,
    });
    if (!translated.ok) {
      throw new Error(translated.message ?? '번역에 실패했습니다.');
    }
    return;
  }

  if (lyricsAction.kind === 'strip-translation') {
    const existingLrcText = (await readExistingSyncLrcText(track))?.trim() ?? '';
    if (existingLrcText) {
      const { stripTranslationsFromLrc } = await import('@/lib/nrmDeepLLrcFormat');
      const stripped = stripTranslationsFromLrc(existingLrcText);
      await updateWebTrackMetadata(track.location.trackId, {
        fileName: newFileName,
        displayLabel,
        metadata: ffmpegMetadata,
        lrcText: stripped || existingLrcText,
      });
    }
    return;
  }

  if (lyricsAction.kind === 'generate-melon') {
    const plain = (
      await resolveMelonPlainLyricsForEdit(normalizeMelonTrackWebsite(metadata.website))
    ).trim();
    if (!plain) {
      notifyUser('멜론 가사를 가져올 수 없습니다.');
      return;
    }
    const { resolveMelonAlignLanguageForPlain } = await import('@/lib/nrmPickMelonAlignLanguage');
    const alignLang = await resolveMelonAlignLanguageForPlain(plain);
    if (!alignLang) return;
    const { transcribeMelonLyricsLrc } = await import('@/lib/nrmMelonLyricsLrcStage');
    const melon = await transcribeMelonLyricsLrc(
      track.audioUri,
      lyricsAction.mode,
      ext,
      plain,
      alignLang,
    );
    if (melon.lrcFull?.trim()) {
      await updateWebTrackMetadata(track.location.trackId, {
        fileName: newFileName,
        displayLabel,
        metadata: ffmpegMetadata,
        lrcText: melon.lrcFull,
      });
      return;
    }
    notifyUser(
      melon.lyricsMelonMemoryInsufficient
        ? '메모리가 부족합니다. 가사생성을 중지합니다.'
        : '멜론가사 생성에 실패했습니다.',
    );
    return;
  }

  const whisper = await transcribeWhisperLrc(track.audioUri, lyricsAction.mode, ext);
  if (whisper.lrcFull?.trim()) {
    await updateWebTrackMetadata(track.location.trackId, {
      fileName: newFileName,
      displayLabel,
      metadata: ffmpegMetadata,
      lrcText: whisper.lrcFull,
    });
    return;
  }
  notifyUser('가사 생성에 실패했습니다. 메타데이터만 저장되었습니다.');
  await updateWebTrackMetadata(track.location.trackId, {
    fileName: newFileName,
    displayLabel,
    metadata: ffmpegMetadata,
  });
}
