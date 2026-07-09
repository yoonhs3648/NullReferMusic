import { Platform } from 'react-native';

import { logNrmDev, logNrmRunError } from '@/lib/nrmDevLog';
import { logDownloadStage } from '@/lib/nrmDownloadStageLog';
import type { NrmMelonLyricsMode } from '@/lib/nrmMelonLyrics';
import { resolveMelonAlignLanguageForPlain } from '@/lib/nrmPickMelonAlignLanguage';
import type { MelonAlignLyricsLanguage } from '@/lib/nrmAlignLyricsLang';
import { loadAlignLyricsLangDetectionMode } from '@/lib/nrmAlignLyricsLangDetectionSettings';
import {
  preprocessPlainForEspeakAlign,
  restoreLrcWithOriginalLyrics,
  type EspeakLineMapping,
} from '@/lib/nrmEspeakLyricsPreprocess';
import { isEspeakNgInstalled } from '@/lib/nrmEspeakNative';
import { normalizeWhisperLrc } from '@/lib/nrmWhisperLyrics';
import { usesPcBackendInDev } from '@/lib/nrmDevRuntime';
import type { NrmMelonSyncSettings } from '@/lib/nrmMelonSyncSettings';
import type { NrmAlignModelId } from '@/lib/nrmAlignModelCatalog';
import type { WhisperLrcStageResult } from '@/lib/nrmWhisperLrcStage';

export type MelonLyricsLrcPreload = {
  alignModelPreference?: NrmAlignModelId;
  melonSyncSettings?: NrmMelonSyncSettings;
  translationClient?: typeof import('@/lib/nrmTranslationClient');
};

export async function transcribeMelonLyricsLrc(
  fileUri: string,
  mode: NrmMelonLyricsMode,
  extension: string,
  melonLyricsPlain: string,
  alignLangOverride?: MelonAlignLyricsLanguage,
  preload?: MelonLyricsLrcPreload,
): Promise<WhisperLrcStageResult> {
  const canUseBackend = usesPcBackendInDev();
  const canUseNative = Platform.OS === 'android';
  if (!canUseBackend && !canUseNative) {
    return { lyricsRequested: false, lyricsEmbedded: false };
  }
  if (Platform.OS === 'web' && !canUseBackend) {
    return { lyricsRequested: false, lyricsEmbedded: false };
  }

  const plain = melonLyricsPlain.trim();
  if (!plain) {
    logDownloadStage('whisperx-align', 'skip_empty_lyrics', { mode, extension });
    return { lyricsRequested: true, lyricsEmbedded: false };
  }

  const alignLang =
    alignLangOverride ?? (await resolveMelonAlignLanguageForPlain(plain));
  if (!alignLang) {
    logDownloadStage('whisperx-align', 'skip_lang_cancelled', { mode, extension });
    return { lyricsRequested: true, lyricsEmbedded: false, lyricsMelonAlignFailed: true };
  }

  const langDetectionMode = await loadAlignLyricsLangDetectionMode();
  let faPlain = plain;
  let espeakLineMappings: EspeakLineMapping[] | undefined;

  if (langDetectionMode === 'espeak') {
    if (!(await isEspeakNgInstalled())) {
      logDownloadStage('whisperx-align', 'skip_espeak_not_installed', { mode, extension });
      return {
        lyricsRequested: true,
        lyricsEmbedded: false,
        lyricsMelonAlignFailed: true,
      };
    }
    const pre = await preprocessPlainForEspeakAlign(plain);
    faPlain = pre.phoneticPlain;
    espeakLineMappings = pre.lineMappings;
    logDownloadStage('whisperx-align', 'espeak_preprocess_done', {
      mode,
      extension,
      lineCount: espeakLineMappings.length,
    });
  }

  logDownloadStage('whisperx-align', 'align_start', {
    mode,
    extension,
    plainChars: plain.length,
    plainLines: plain.split(/\r?\n/).filter((l) => l.trim()).length,
    alignLang,
    espeakPreprocess: langDetectionMode === 'espeak',
    audioUri: fileUri.slice(0, 120),
  });

  const translationPrep =
    mode === 'melon_translation'
      ? preload?.translationClient
        ? Promise.resolve(preload.translationClient)
        : import('@/lib/nrmTranslationClient')
      : null;

  const t0 = Date.now();
  let lrc = '';
  let lyricsMelonAlignFailed = false;
  let lyricsMelonMemoryInsufficient = false;
  try {
    const [{ loadAlignModelPreference }, { alignMelonLyricsToLrcNative }] = await Promise.all([
      import('@/lib/nrmDownloadSettings'),
      import('@/lib/nrmAlignModelNative'),
    ]);
    const alignPref =
      preload?.alignModelPreference ?? (await loadAlignModelPreference());
    const aligned = await alignMelonLyricsToLrcNative(
      fileUri,
      faPlain,
      mode,
      alignPref,
      alignLang,
      preload?.melonSyncSettings
        ? { syncSettings: preload.melonSyncSettings }
        : undefined,
    );
    lrc = normalizeWhisperLrc(aligned.lrc);
    if (espeakLineMappings?.length && lrc.trim()) {
      lrc = restoreLrcWithOriginalLyrics(lrc, espeakLineMappings);
    }
    lyricsMelonMemoryInsufficient = aligned.alignMemoryInsufficient;
    lyricsMelonAlignFailed = aligned.alignFailed && !lyricsMelonMemoryInsufficient;
  } catch (e) {
    logNrmRunError('whisperx-align', e, { mode, extension });
    lrc = '';
    lyricsMelonAlignFailed = true;
  }

  logDownloadStage('whisperx-align', 'align_done', {
    mode,
    extension,
    elapsedMs: Date.now() - t0,
    lrcChars: lrc.trim().length,
    alignFailed: lyricsMelonAlignFailed,
    memoryInsufficient: lyricsMelonMemoryInsufficient,
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
      const { translateLrcToKorean } = translationPrep
        ? await translationPrep
        : await import('@/lib/nrmTranslationClient');
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
      lyricsMelonMemoryInsufficient: lyricsMelonMemoryInsufficient || undefined,
      lyricsMelonAlignFailed: lyricsMelonMemoryInsufficient ? undefined : true,
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
