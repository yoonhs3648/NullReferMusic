import * as FileSystem from 'expo-file-system/src/legacy/FileSystem';
import { Platform } from 'react-native';

import type { NrmAudioFileMetadata } from '@/lib/nrmDownloadAudioMetadata';
import { siblingLrcUri } from '@/lib/nrmSiblingLrc';
import {
  buildAutoWhisperLyricsSentinel,
  isAutoWhisperLyricsValue,
  parseWhisperLyricsMode,
  normalizeWhisperLrc,
  truncateLyricsForId3Embed,
  type NrmWhisperLyricsMode,
} from '@/lib/nrmWhisperLyrics';

export type ResolveWhisperLyricsResult = {
  metadata: NrmAudioFileMetadata;
  /** LRC 전체(사이드카용). 임베드만 생략된 경우에도 채워질 수 있음 */
  lrcFull?: string;
  lyricsRequested: boolean;
  lyricsEmbedded: boolean;
  lyricsTranslationFailed?: boolean;
};

function toFsPath(fileUri: string): string {
  return fileUri.startsWith('file://') ? fileUri.slice(7) : fileUri;
}

async function writeLrcSidecar(audioPath: string, lrc: string): Promise<void> {
  const trimmed = lrc.trim();
  if (!trimmed) return;
  await FileSystem.writeAsStringAsync(siblingLrcUri(audioPath), `${trimmed}\n`);
}

async function transcribeAudioToLrc(
  fileUri: string,
  _mode: NrmWhisperLyricsMode,
): Promise<string> {
  if (Platform.OS === 'web') {
    const m = await import('@/lib/nrmWhisperTranscribe.web');
    return m.transcribeAudioToLrcWeb(fileUri);
  }
  const m = await import('@/lib/nrmWhisperTranscribe.native');
  return m.transcribeAudioToLrcNative(fileUri);
}

/**
 * 메타데이터의 Whisper sentinel을 실제 LRC로 치환합니다.
 * 번역지원 모드에서는 DeepL로 [원문+번역] 형태의 LRC를 생성합니다.
 */
export async function resolveWhisperLyricsInMetadata(
  fileUri: string,
  metadata: NrmAudioFileMetadata,
  extension: string,
): Promise<ResolveWhisperLyricsResult> {
  const rawLyrics = (metadata.lyrics ?? '').trim();
  const mode = parseWhisperLyricsMode(rawLyrics);
  if (!mode || extension !== '.mp3') {
    return {
      metadata,
      lyricsRequested: false,
      lyricsEmbedded: false,
    };
  }

  let lrc = '';
  let lyricsTranslationFailed = false;
  try {
    lrc = normalizeWhisperLrc(await transcribeAudioToLrc(fileUri, mode));
  } catch {
    lrc = '';
  }

  if (mode === 'translation' && lrc.trim()) {
    try {
      const [{ getDeepLApiKey }, { translateLrcToKoreanWithDeepL }] = await Promise.all([
        import('@/lib/nrmDeepLApiSettings'),
        import('@/lib/nrmDeepLApiClient'),
      ]);
      const apiKey = await getDeepLApiKey();
      const translated = await translateLrcToKoreanWithDeepL(lrc, apiKey);
      if (translated.ok) {
        lrc = translated.lrc;
      } else {
        lyricsTranslationFailed = true;
      }
    } catch {
      lyricsTranslationFailed = true;
    }
  }

  const audioPath = toFsPath(fileUri);
  if (lrc.trim()) {
    try {
      await writeLrcSidecar(audioPath, lrc);
    } catch {
      /* sidecar optional */
    }
  }

  const { embed, truncated } = truncateLyricsForId3Embed(lrc);
  const next: NrmAudioFileMetadata = { ...metadata };
  if (embed) {
    next.lyrics = embed;
  } else {
    delete next.lyrics;
  }

  return {
    metadata: next,
    lrcFull: lrc.trim() || undefined,
    lyricsRequested: true,
    lyricsEmbedded: !!embed && !truncated,
    lyricsTranslationFailed,
  };
}

/** sentinel 문자열만 있는지 (아직 전사 전) */
export function metadataNeedsWhisperTranscription(
  metadata: NrmAudioFileMetadata | undefined,
  extension: string,
): boolean {
  if (!metadata || extension !== '.mp3') return false;
  return isAutoWhisperLyricsValue(metadata.lyrics);
}

export function whisperSentinelForUiMode(
  mode: 'unset' | NrmWhisperLyricsMode,
): string | undefined {
  if (mode === 'unset') return undefined;
  return buildAutoWhisperLyricsSentinel(mode);
}
