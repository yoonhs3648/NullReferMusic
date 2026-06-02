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
    const lrcCharsBefore = lrc.trim().length;
    const lineCount = lrc.split(/\r?\n/).filter((v) => v.trim().length > 0).length;
    logNrmDev('lyrics.translate', {
      event: 'deepl_start',
      mode,
      extension,
      lrcChars: lrcCharsBefore,
      lineCount,
    });
    const translateT0 = Date.now();
    try {
      const [{ getDeepLApiKey }, { translateLrcToKoreanWithDeepL }] = await Promise.all([
        import('@/lib/nrmDeepLApiSettings'),
        import('@/lib/nrmDeepLApiClient'),
      ]);
      const apiKey = await getDeepLApiKey();
      logNrmDev('lyrics.translate', {
        event: 'deepl_key_loaded',
        hasApiKey: apiKey.trim().length > 0,
        apiKeyLen: apiKey.trim().length,
      });
      const translated = await translateLrcToKoreanWithDeepL(lrc, apiKey);
      const elapsedMs = Date.now() - translateT0;
      if (translated.ok) {
        lrc = translated.lrc;
        logNrmDev('lyrics.translate', {
          event: 'deepl_ok',
          elapsedMs,
          lrcCharsBefore,
          lrcCharsAfter: lrc.trim().length,
        });
      } else {
        lyricsTranslationFailed = true;
        lrc = '';
        logNrmDev('lyrics.translate', {
          event: 'deepl_fail',
          elapsedMs,
          message: translated.message,
          lrcCharsBefore,
        });
      }
    } catch (e) {
      lyricsTranslationFailed = true;
      lrc = '';
      logNrmRunError('lyrics.translate', e, {
        event: 'deepl_throw',
        elapsedMs: Date.now() - translateT0,
        lrcCharsBefore,
        lineCount,
      });
    }
  } else if (mode === 'translation' && !lrc.trim()) {
    logNrmDev('lyrics.translate', {
      event: 'deepl_skip_empty_lrc',
      mode,
      extension,
    });
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
      lyricsTranslationFailed: mode === 'translation' ? lyricsTranslationFailed : undefined,
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
    lyricsEmbedded: false,
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
