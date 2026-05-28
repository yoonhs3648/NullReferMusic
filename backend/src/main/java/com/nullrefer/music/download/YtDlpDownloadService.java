package com.nullrefer.music.download;

import com.nullrefer.music.config.NrmPaths;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

@Service
public class YtDlpDownloadService {
  private static final Logger log = LoggerFactory.getLogger(YtDlpDownloadService.class);

  /** 오디오 추출: js(node) → plain (쿠키 없음, 429·잠금 회피) */
  private static final List<YtDlpProfile> YT_DLP_DOWNLOAD_PROFILES =
      List.of(
          new YtDlpProfile("js", false, true),
          new YtDlpProfile("plain", false, false));

  private final NrmPaths paths;

  public YtDlpDownloadService(NrmPaths paths) {
    this.paths = paths;
  }

  public Map<String, Object> health() {
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("ok", true);
    body.put("ytDlp", Files.isRegularFile(paths.getYtDlpPath()));
    body.put("ffmpeg", Files.isRegularFile(paths.getFfmpegExe()));
    body.put("outputDir", paths.getOutputDir().toString());
    return body;
  }

  public DownloadOutcome download(String url, boolean noPlaylist) {
    return download(url, noPlaylist, "mp3", 0);
  }

  public DownloadOutcome download(
      String url, boolean noPlaylist, String audioFormat, int audioQuality) {
    if (!YoutubeUrlValidator.isValid(url)) {
      log.warn("[yt-dlp] REJECT invalid_url url={}", url);
      return DownloadOutcome.error(
          HttpStatus.BAD_REQUEST, Map.of("error", "YouTube URL만 허용됩니다."));
    }

    if (!Files.isRegularFile(paths.getYtDlpPath())) {
      log.error("[yt-dlp] REJECT missing_binary path={}", paths.getYtDlpPath());
      return DownloadOutcome.error(
          HttpStatus.INTERNAL_SERVER_ERROR,
          Map.of("error", "yt-dlp를 찾을 수 없습니다: " + paths.getYtDlpPath()));
    }

    if (!Files.isRegularFile(paths.getFfmpegExe())) {
      log.error("[yt-dlp] REJECT missing_ffmpeg path={}", paths.getFfmpegExe());
      return DownloadOutcome.error(
          HttpStatus.INTERNAL_SERVER_ERROR,
          Map.of("error", "ffmpeg를 찾을 수 없습니다: " + paths.getFfmpegExe()));
    }

    String jobId = Long.toString(System.currentTimeMillis(), 36);
    String outPattern = "nrm_" + jobId + ".%(ext)s";

    log.info(
        "[yt-dlp] API REQUEST jobId={} url={} noPlaylist={} audioFormat={} audioQuality={} outputDir={} outPattern={}",
        jobId,
        url,
        noPlaylist,
        audioFormat,
        audioQuality,
        paths.getOutputDir(),
        outPattern);

    try {
      int lastCode = -1;
      String lastDetail = "";
      String succeededProfile = "plain";
      boolean okDownload = false;
      for (YtDlpProfile profile : YT_DLP_DOWNLOAD_PROFILES) {
        List<String> cmd =
            buildDownloadCommand(url, noPlaylist, audioFormat, audioQuality, outPattern, profile);
        String ctx = "jobId=" + jobId + " profile=" + profile.name;
        NrmProcessLogger.ProcessRunResult run =
            NrmProcessLogger.run(
                log,
                NrmProcessLogger.Tool.YT_DLP,
                ctx,
                cmd,
                paths.getRepoRoot(),
                false,
                0);
        if (run.success()) {
          okDownload = true;
          succeededProfile = profile.name;
          break;
        }
        lastCode = run.exitCode();
        lastDetail = NrmProcessLogger.tail(run.stderr(), 6000);
        if (lastDetail.isEmpty()) {
          lastDetail = NrmProcessLogger.tail(run.stdout(), 6000);
        }
      }

      if (!okDownload) {
        log.warn(
            "[yt-dlp] API FAIL jobId={} lastCode={} detail={}",
            jobId,
            lastCode,
            NrmProcessLogger.tail(lastDetail, 1200));
        Map<String, Object> err = new LinkedHashMap<>();
        err.put("error", "yt-dlp 실행이 실패했습니다.");
        err.put("code", lastCode);
        err.put("detail", lastDetail);
        return DownloadOutcome.error(HttpStatus.INTERNAL_SERVER_ERROR, err);
      }
      Map<String, Object> ok = new LinkedHashMap<>();
      ok.put("ok", true);
      ok.put("jobId", jobId);
      ok.put("outputDir", paths.getOutputDir().toString());
      ok.put("message", "다운로드가 완료되었습니다.");
      ok.put("profile", succeededProfile);
      log.info(
          "[yt-dlp] API OK jobId={} profile={} outputDir={}",
          jobId,
          succeededProfile,
          paths.getOutputDir());
      return DownloadOutcome.success(ok);
    } catch (Exception e) {
      log.error("[yt-dlp] API ERROR jobId={} message={}", jobId, e.getMessage(), e);
      return DownloadOutcome.error(
          HttpStatus.INTERNAL_SERVER_ERROR, Map.of("error", e.getMessage()));
    }
  }

  private List<String> buildDownloadCommand(
      String url,
      boolean noPlaylist,
      String audioFormat,
      int audioQuality,
      String outPattern,
      YtDlpProfile profile) {
    List<String> cmd = new ArrayList<>();
    cmd.add(paths.getYtDlpPath().toString());
    cmd.add("--ffmpeg-location");
    cmd.add(paths.getFfmpegDir().toString());
    appendHardeningArgs(cmd, profile);
    cmd.add("--retries");
    cmd.add("10");
    cmd.add("--sleep-requests");
    cmd.add("1");
    if (noPlaylist) {
      cmd.add("--no-playlist");
    }
    cmd.add("-x");
    cmd.add("--audio-format");
    cmd.add(audioFormat != null && !audioFormat.isBlank() ? audioFormat.trim() : "mp3");
    cmd.add("--audio-quality");
    cmd.add(String.valueOf(Math.min(9, Math.max(0, audioQuality))));
    cmd.add("-P");
    cmd.add(paths.getOutputDir().toString());
    cmd.add("-o");
    cmd.add(outPattern);
    cmd.add(url.trim());
    return cmd;
  }

  private static void appendHardeningArgs(List<String> cmd, YtDlpProfile profile) {
    if (profile.useJsRuntime) {
      cmd.add("--js-runtimes");
      cmd.add("node");
    }
    if (profile.useBrowserCookies) {
      cmd.add("--cookies-from-browser");
      cmd.add("chrome");
    }
  }

  public record DownloadOutcome(HttpStatus status, Map<String, Object> body) {

    static DownloadOutcome success(Map<String, Object> body) {
      return new DownloadOutcome(HttpStatus.OK, body);
    }

    static DownloadOutcome error(HttpStatus status, Map<String, Object> body) {
      return new DownloadOutcome(status, body);
    }
  }

  private record YtDlpProfile(String name, boolean useBrowserCookies, boolean useJsRuntime) {}
}
