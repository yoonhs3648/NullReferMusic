/**
 * 멜론 원문 가사 + wav2vec2 CTC forced alignment → LRC.
 */
import { Platform } from 'react-native';

import { logNrmDev, logNrmRunError } from '@/lib/nrmDevLog';
import { logDownloadStage } from '@/lib/nrmDownloadStageLog';
import type { NrmMelonLyricsMode } from '@/lib/nrmMelonLyrics';
import { normalizeWhisperLrc } from '@/lib/nrmWhisperLyrics';
import type { WhisperLrcStageResult } from '@/lib/nrmWhisperLrcStage';

export async function transcribeMelonLyricsLrc(
  fileUri: string,
  mode: NrmMelonLyricsMode,
  extension: string,
  melonLyricsPlain: string,
): Promise<WhisperLrcStageResult> {
  if (Platform.OS === 'web') {
    return { lyricsRequested: false, lyricsEmbedded: false };
  }

  const plain = melonLyricsPlain.trim();
  if (!plain) {
    logDownloadStage('whisperx-align', 'skip_empty_lyrics', { mode, extension });
    return { lyricsRequested: true, lyricsEmbedded: false };
  }

  logDownloadStage('whisperx-align', 'align_start', {
    mode,
    extension,
    plainChars: plain.length,
    plainLines: plain.split(/\r?\n/).filter((l) => l.trim()).length,
    audioUri: fileUri.slice(0, 120),
  });

  const t0 = Date.now();
  let lrc = '';
  try {
    const { alignMelonLyricsToLrcNative } = await import('@/lib/nrmWhisperXAlignNative');
    lrc = normalizeWhisperLrc(await alignMelonLyricsToLrcNative(fileUri, plain, mode));
  } catch (e) {
    logNrmRunError('whisperx-align', e, { mode, extension });
    lrc = '';
  }

  logDownloadStage('whisperx-align', 'align_done', {
    mode,
    extension,
    elapsedMs: Date.now() - t0,
    lrcChars: lrc.trim().length,
  });

  let lyricsTranslationFailed = false;
  let lyricsTranslationExhausted = false;
  const alignedLrc = lrc;

  if (mode === 'melon_translation' && lrc.trim()) {
    const lrcCharsBefore = lrc.trim().length;
    const lineCount = lrc.split(/\r?\n/).filter((v) => v.trim().length > 0).length;
    logDownloadStage('translate', 'deepl_melon_start', {
      mode,
      extension,
      lrcChars: lrcCharsBefore,
      lineCount,
    });
    const translateT0 = Date.now();
    try {
      const { translateLrcToKorean } = await import('@/lib/nrmTranslationClient');
      const translated = await translateLrcToKorean(lrc);
      if (translated.ok) {
        lrc = translated.lrc;
        logDownloadStage('translate', 'deepl_melon_ok', {
          elapsedMs: Date.now() - translateT0,
          lrcCharsBefore,
          lrcCharsAfter: lrc.trim().length,
        });
      } else {
        lyricsTranslationFailed = true;
        lyricsTranslationExhausted = (translated.message ?? '').includes('사용량이 초과');
        lrc = alignedLrc;
        logDownloadStage('translate', 'deepl_melon_fail_fallback', {
          elapsedMs: Date.now() - translateT0,
          message: translated.message,
          exhausted: lyricsTranslationExhausted,
        });
      }
    } catch (e) {
      lyricsTranslationFailed = true;
      const errMsg = e instanceof Error ? e.message : String(e);
      lyricsTranslationExhausted = errMsg.includes('사용량이 초과');
      lrc = alignedLrc;
      logNrmRunError('lyrics.translate.melon', e, {
        elapsedMs: Date.now() - translateT0,
        exhausted: lyricsTranslationExhausted,
      });
    }
  }

  if (!lrc.trim()) {
    logNrmDev('whisperx-align', {
      event: 'align_empty',
      mode,
      extension,
      lyricsTranslationFailed,
    });
    return {
      lyricsRequested: true,
      lyricsEmbedded: false,
      lyricsTranslationFailed:
        mode === 'melon_translation' ? lyricsTranslationFailed : undefined,
      lyricsTranslationExhausted:
        mode === 'melon_translation' ? lyricsTranslationExhausted || undefined : undefined,
    };
  }

  return {
    lyricsRequested: true,
    lyricsEmbedded: false,
    lyricsTranslationFailed,
    lyricsTranslationExhausted: lyricsTranslationExhausted || undefined,
    lrcFull: lrc.trim(),
  };
}
