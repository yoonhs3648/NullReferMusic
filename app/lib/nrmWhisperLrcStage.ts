/**
 * 3단계: Whisper 전사 → LRC 사이드카 파일만.
 * ffmpeg(2단계)와 독립 — MP3 ID3 가사 태그는 넣지 않습니다.
 */
import * as FileSystem from 'expo-file-system/src/legacy/FileSystem';
import { Platform } from 'react-native';

import { logNrmDev, logNrmRunError } from '@/lib/nrmDevLog';
import { siblingLrcUri } from '@/lib/nrmSiblingLrc';
import { normalizeWhisperLrc, type NrmWhisperLyricsMode } from '@/lib/nrmWhisperLyrics';

export type WhisperLrcStageResult = {
  /** 가사(LRC) 생성을 요청했는지 */
  lyricsRequested: boolean;
  /** LRC 파일을 썼는지 (API 호환 필드명 lyricsEmbedded) */
  lyricsEmbedded: boolean;
  lyricsTranslationFailed?: boolean;
  lrcFull?: string;
};

function toFsPath(fileUri: string): string {
  return fileUri.startsWith('file://') ? fileUri.slice(7) : fileUri;
}

async function writeLrcSidecar(audioPath: string, lrc: string): Promise<boolean> {
  const trimmed = lrc.trim();
  if (!trimmed) return false;
  try {
    await FileSystem.writeAsStringAsync(siblingLrcUri(audioPath), `${trimmed}\n`);
    return true;
  } catch {
    return false;
  }
}

async function transcribeAudioToLrc(fileUri: string): Promise<string> {
  if (Platform.OS === 'web') {
    const m = await import('@/lib/nrmWhisperTranscribe.web');
    return m.transcribeAudioToLrcWeb(fileUri);
  }
  const m = await import('@/lib/nrmWhisperTranscribe.native');
  return m.transcribeAudioToLrcNative(fileUri);
}

/** 전사·번역 → LRC 텍스트 (파일 쓰기는 호출 측 persistLrcTextToDestination 등) */
export async function transcribeWhisperLrc(
  fileUri: string,
  mode: NrmWhisperLyricsMode,
  extension: string,
): Promise<WhisperLrcStageResult> {
  if (Platform.OS === 'web') {
    return { lyricsRequested: false, lyricsEmbedded: false };
  }

  logNrmDev('download.whisper', {
    event: 'transcribe_start',
    mode,
    extension,
    audioUri: fileUri.slice(0, 120),
  });

  let lrc = '';
  try {
    lrc = normalizeWhisperLrc(await transcribeAudioToLrc(fileUri));
  } catch (e) {
    logNrmRunError('whisper.lrc', e, { extension, mode });
    lrc = '';
  }

  let lyricsTranslationFailed = false;
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

  if (!lrc.trim()) {
    logNrmDev('download.whisper', {
      event: 'transcribe_empty',
      mode,
      extension,
      lyricsTranslationFailed,
    });
    return {
      lyricsRequested: true,
      lyricsEmbedded: false,
      lyricsTranslationFailed,
    };
  }

  logNrmDev('download.whisper', {
    event: 'transcribe_ok',
    mode,
    extension,
    lrcChars: lrc.trim().length,
    lyricsTranslationFailed,
  });

  return {
    lyricsRequested: true,
    lyricsEmbedded: true,
    lyricsTranslationFailed,
    lrcFull: lrc.trim(),
  };
}

/** Whisper → 임시 경로 옆 LRC 사이드카 (레거시 동기 경로) */
export async function runWhisperLrcStage(
  fileUri: string,
  mode: NrmWhisperLyricsMode,
  extension: string,
): Promise<WhisperLrcStageResult> {
  const transcribed = await transcribeWhisperLrc(fileUri, mode, extension);
  if (!transcribed.lrcFull?.trim()) {
    return transcribed;
  }

  const written = await writeLrcSidecar(toFsPath(fileUri), transcribed.lrcFull);
  return {
    ...transcribed,
    lyricsEmbedded: written,
  };
}
