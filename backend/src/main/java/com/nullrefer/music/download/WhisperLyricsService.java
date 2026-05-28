package com.nullrefer.music.download;

import com.nullrefer.music.config.NrmPaths;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/** 로컬 whisper.cpp 전사 → LRC */
@Service
public class WhisperLyricsService {

  private static final Logger log = LoggerFactory.getLogger(WhisperLyricsService.class);
  /** whisper-cli 전사 대기 (초). 긴 곡·base 모델은 5분을 넘길 수 있음 */
  private static final long PROCESS_TIMEOUT_SEC = 1800;

  private final NrmPaths paths;
  private final WhisperModelStatusService modelStatusService;

  public WhisperLyricsService(NrmPaths paths, WhisperModelStatusService modelStatusService) {
    this.paths = paths;
    this.modelStatusService = modelStatusService;
  }

  public boolean isAvailable() {
    return Files.isRegularFile(paths.getWhisperCli()) && modelStatusService.hasAnyModelInstalled();
  }

  public record TranscribeResult(String lrc, String modelFile, String missingPreference) {
    public static TranscribeResult empty(String missingPreference) {
      return new TranscribeResult("", "", missingPreference);
    }
  }

  public TranscribeResult transcribeToLrcDetailed(
      Path audioFile, boolean translationMode, String modelPreference) {
    String pref = trim(modelPreference);
    String ctx =
        "audio="
            + (audioFile != null ? audioFile.getFileName() : "null")
            + " translation="
            + translationMode
            + " modelPref="
            + (pref.isEmpty() ? "whisper:large-v3-turbo" : pref);

    log.info("[whisper] API REQUEST {}", ctx);

    if (!Files.isRegularFile(paths.getWhisperCli())) {
      log.warn("[whisper] REJECT cli_missing path={}", paths.getWhisperCli());
      return TranscribeResult.empty(pref);
    }
    if (audioFile == null || !Files.isRegularFile(audioFile)) {
      log.warn("[whisper] REJECT audio_missing {}", ctx);
      return TranscribeResult.empty(pref);
    }
    Path modelPath = modelStatusService.resolveInstalledModel(modelPreference);
    if (modelPath == null) {
      log.warn(
          "[whisper] REJECT model_not_installed pref={} (no fallback)",
          pref.isEmpty() ? "whisper:large-v3-turbo" : pref);
      return TranscribeResult.empty(pref.isEmpty() ? "whisper:large-v3-turbo" : pref);
    }
    Path workDir = audioFile.getParent();
    if (workDir == null) {
      log.warn("[whisper] REJECT no_parent_dir {}", ctx);
      return TranscribeResult.empty(pref);
    }
    Path wav = null;
    Path outPrefix = null;
    try {
      wav = workDir.resolve("nrm-whisper-" + System.currentTimeMillis() + ".wav");
      log.info(
          "[whisper] STEP wav_convert input={} output={} model={}",
          audioFile.toAbsolutePath(),
          wav.getFileName(),
          modelPath.getFileName());
      convertTo16kMonoWav(audioFile, wav, ctx);
      outPrefix = workDir.resolve("nrm-whisper-out-" + System.currentTimeMillis());
      log.info(
          "[whisper] STEP transcribe wav={} outPrefix={} model={}",
          wav.getFileName(),
          outPrefix.getFileName(),
          modelPath.getFileName());
      runWhisper(wav, outPrefix, modelPath, ctx);
      String lrc = normalizeWhisperLrc(readIfExists(Path.of(outPrefix.toString() + ".lrc")));
      log.info(
          "[whisper] API OK {} | lrcChars={} modelFile={}",
          ctx,
          lrc.length(),
          modelPath.getFileName());
      return new TranscribeResult(lrc, modelPath.getFileName().toString(), "");
    } catch (Exception e) {
      log.warn("[whisper] API FAIL {} | error={}", ctx, e.getMessage(), e);
      return TranscribeResult.empty(pref);
    } finally {
      deleteQuiet(wav);
      if (outPrefix != null) {
        deleteQuiet(Path.of(outPrefix.toString() + ".lrc"));
        deleteQuiet(Path.of(outPrefix.toString() + ".txt"));
      }
    }
  }

  /** @deprecated 호환 — 상세 결과는 {@link #transcribeToLrcDetailed} 사용 */
  public String transcribeToLrc(Path audioFile, boolean translationMode, String modelPreference) {
    return transcribeToLrcDetailed(audioFile, translationMode, modelPreference).lrc();
  }

  private void convertTo16kMonoWav(Path inFile, Path wavOut, String parentCtx) throws Exception {
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
    runProcess(NrmProcessLogger.Tool.WHISPER_FFMPEG, parentCtx + " step=wav", cmd);
  }

  private void runWhisper(Path wavFile, Path outPrefix, Path modelPath, String parentCtx)
      throws Exception {
    List<String> cmd = new ArrayList<>();
    int threads = Math.max(2, Runtime.getRuntime().availableProcessors());
    cmd.add(paths.getWhisperCli().toString());
    cmd.add("-m");
    cmd.add(modelPath.toString());
    cmd.add("-l");
    cmd.add("auto");
    cmd.add("-t");
    cmd.add(String.valueOf(threads));
    cmd.add("-f");
    cmd.add(wavFile.toString());
    cmd.add("-of");
    cmd.add(outPrefix.toString());
    cmd.add("--output-lrc");
    cmd.add("--no-prints");
    runProcess(NrmProcessLogger.Tool.WHISPER, parentCtx + " step=transcribe", cmd);
  }

  static String normalizeWhisperLrc(String lrc) {
    String t = lrc == null ? "" : lrc.trim();
    if (t.startsWith("[by:whisper.cpp]")) {
      int nl = t.indexOf('\n');
      t = nl >= 0 ? t.substring(nl + 1).trim() : "";
    }
    return t;
  }

  private static String readIfExists(Path p) {
    try {
      if (Files.isRegularFile(p)) {
        return Files.readString(p, StandardCharsets.UTF_8).trim();
      }
    } catch (Exception ignored) {
      // ignore
    }
    return "";
  }

  private void runProcess(NrmProcessLogger.Tool tool, String context, List<String> cmd)
      throws Exception {
    NrmProcessLogger.ProcessRunResult run =
        NrmProcessLogger.run(log, tool, context, cmd, null, true, PROCESS_TIMEOUT_SEC);
    if (!run.success()) {
      String detail = NrmProcessLogger.tail(run.stdout(), 1500);
      if (detail.isEmpty()) {
        detail = NrmProcessLogger.tail(run.stderr(), 1500);
      }
      throw new IllegalStateException(tool.tag() + "_exit_" + run.exitCode() + ": " + detail);
    }
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
