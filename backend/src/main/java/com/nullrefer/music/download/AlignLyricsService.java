package com.nullrefer.music.download;

import com.nullrefer.music.config.NrmPaths;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/** PC 백엔드 forced alignment (aeneas 스타일 — 웹·Expo Go dev용). */
@Service
public class AlignLyricsService {

  private static final Logger log = LoggerFactory.getLogger(AlignLyricsService.class);
  private static final String AUTO_MELON_LYRICS_PREFIX = "__AUTO_FROM_MELON__:";

  private final NrmPaths paths;
  private final AeneasForcedAlignService aeneasService;

  public AlignLyricsService(NrmPaths paths, AeneasForcedAlignService aeneasService) {
    this.paths = paths;
    this.aeneasService = aeneasService;
  }

  public record MelonAlignResult(
      String lrc,
      boolean alignFailed,
      boolean alignMemoryInsufficient,
      boolean lyricsTranslationFailed) {}

  public static boolean isAutoMelonLyrics(String lyrics) {
    String v = trim(lyrics);
    return v.startsWith(AUTO_MELON_LYRICS_PREFIX);
  }

  public static String parseMelonMode(String lyrics) {
    String v = trim(lyrics);
    if (!v.startsWith(AUTO_MELON_LYRICS_PREFIX)) return "";
    return v.substring(AUTO_MELON_LYRICS_PREFIX.length()).trim();
  }

  public MelonAlignResult alignJobFileMelonLyrics(String jobId, AudioMetadataRequest req) {
    Path audio = resolveJobAudioFile(jobId);
    if (audio == null) {
      log.warn("[align] REJECT job_file_not_found jobId={}", jobId);
      return failResult(false);
    }
    String plain = trim(req.melonLyricsPlain);
    if (plain.isEmpty()) {
      plain = trim(req.lyrics);
      if (isAutoMelonLyrics(plain)) plain = "";
    }
    if (plain.isEmpty()) {
      log.warn("[align] REJECT empty_lyrics jobId={}", jobId);
      return failResult(false);
    }
    String mode = parseMelonMode(req.lyrics);
    if (mode.isEmpty()) mode = "melon";
    return alignAudioFileMelonLyrics(audio, plain, mode, req.deeplApiKey);
  }

  public MelonAlignResult alignAudioFileMelonLyrics(
      Path audioFile, String lyricsPlain, String mode, String deeplApiKey) {
    List<String> lines = splitLyricsLines(lyricsPlain);
    if (lines.isEmpty()) {
      return failResult(false);
    }

    Path wav = null;
    try {
      wav = audioFile.getParent().resolve("nrm-align-" + System.currentTimeMillis() + ".wav");
      convertTo16kMonoWav(audioFile, wav);
      AeneasForcedAlignService.AlignResult aligned =
          aeneasService.alignMelonLinesToLrc(wav, lines, AeneasForcedAlignService.wavDurationMs(wav));
      String lrc = trim(aligned.lrc());
      if (lrc.isEmpty()) {
        return failResult(false);
      }
      boolean translationFailed = false;
      if ("melon_translation".equals(mode)) {
        var translated = translateLrcViaDeepL(lrc, deeplApiKey);
        if (translated.ok()) {
          lrc = translated.lrc();
        } else {
          translationFailed = true;
        }
      }
      return new MelonAlignResult(lrc, false, false, translationFailed);
    } catch (Exception e) {
      log.warn("[align] FAIL file={} error={}", audioFile.getFileName(), e.getMessage());
      return failResult(false);
    } finally {
      deleteQuiet(wav);
    }
  }

  public void writeJobLrcSidecar(String jobId, String lrcText) {
    if (trim(lrcText).isEmpty()) return;
    Path audio = resolveJobAudioFile(jobId);
    if (audio == null) return;
    Path lrc = audio.resolveSibling(stemOf(audio.getFileName().toString()) + ".lrc");
    try {
      Files.writeString(lrc, trim(lrcText) + "\n", StandardCharsets.UTF_8);
    } catch (Exception e) {
      log.warn("[align] lrc_write_fail jobId={} error={}", jobId, e.getMessage());
    }
  }

  private record DeepLTranslateOutcome(boolean ok, String lrc) {}

  private DeepLTranslateOutcome translateLrcViaDeepL(String lrc, String apiKey) {
    if (trim(apiKey).isEmpty()) {
      return new DeepLTranslateOutcome(false, lrc);
    }
    try {
      List<String> lines = new ArrayList<>();
      for (String raw : lrc.split("\\R")) {
        String t = raw.trim();
        if (t.isEmpty()) continue;
        var m = java.util.regex.Pattern.compile("^\\[[^\\]]+\\](.*)$").matcher(t);
        lines.add(m.matches() ? m.group(1).trim() : t);
      }
      if (lines.isEmpty()) return new DeepLTranslateOutcome(false, lrc);
      // DeepL 번역은 ApiController 경유 — 여기서는 원문 LRC 유지 (클라이언트가 번역)
      return new DeepLTranslateOutcome(false, lrc);
    } catch (Exception e) {
      return new DeepLTranslateOutcome(false, lrc);
    }
  }

  private Path resolveJobAudioFile(String jobId) {
    Path baseDir = paths.getOutputDir().toAbsolutePath().normalize();
    Path picked = null;
    try (var stream = Files.newDirectoryStream(baseDir, "nrm_" + jobId + ".*")) {
      for (Path candidate : stream) {
        Path normalized = candidate.normalize();
        if (!Files.isRegularFile(normalized) || !normalized.startsWith(baseDir)) continue;
        String ext = extensionOf(normalized.getFileName().toString());
        if (isAudioExtension(ext)) return normalized;
        if (picked == null) picked = normalized;
      }
    } catch (Exception ignored) {
      // fall through
    }
    if (picked != null) return picked;
    Path fallback = baseDir.resolve("nrm_" + jobId + ".mp3").normalize();
    return Files.isRegularFile(fallback) ? fallback : null;
  }

  private void convertTo16kMonoWav(Path inFile, Path wavOut) throws Exception {
    if (!Files.isRegularFile(paths.getFfmpegExe())) {
      throw new IllegalStateException("ffmpeg_missing");
    }
    List<String> cmd = new ArrayList<>();
    cmd.add(paths.getFfmpegExe().toString());
    cmd.add("-y");
    cmd.add("-i");
    cmd.add(inFile.toString());
    cmd.add("-ar");
    cmd.add("16000");
    cmd.add("-ac");
    cmd.add("1");
    cmd.add("-c:a");
    cmd.add("pcm_s16le");
    cmd.add(wavOut.toString());
    var run =
        NrmProcessLogger.run(
            log,
            NrmProcessLogger.Tool.WHISPER_FFMPEG,
            "align wav_convert",
            cmd,
            inFile.getParent(),
            true,
            600);
    if (run.exitCode() != 0) {
      throw new IllegalStateException("ffmpeg_align_wav_failed");
    }
  }

  private static List<String> splitLyricsLines(String plain) {
    List<String> out = new ArrayList<>();
    for (String raw : plain.split("\\R")) {
      String t = raw.trim();
      if (!t.isEmpty()) out.add(t);
    }
    return out;
  }

  private static MelonAlignResult failResult(boolean memoryInsufficient) {
    return new MelonAlignResult("", true, memoryInsufficient, false);
  }

  private static String stemOf(String name) {
    int dot = name.lastIndexOf('.');
    return dot > 0 ? name.substring(0, dot) : name;
  }

  private static String extensionOf(String name) {
    int dot = name.lastIndexOf('.');
    return dot < 0 ? "" : name.substring(dot).toLowerCase(Locale.ROOT);
  }

  private static boolean isAudioExtension(String ext) {
    return ".mp3".equals(ext)
        || ".m4a".equals(ext)
        || ".wav".equals(ext)
        || ".opus".equals(ext)
        || ".flac".equals(ext)
        || ".ogg".equals(ext)
        || ".aac".equals(ext)
        || ".mp4".equals(ext);
  }

  private static void deleteQuiet(Path p) {
    if (p == null) return;
    try {
      Files.deleteIfExists(p);
    } catch (Exception ignored) {
      // ignore
    }
  }

  private static String trim(String v) {
    return v == null ? "" : v.trim();
  }
}
