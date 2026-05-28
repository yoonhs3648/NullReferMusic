package com.nullrefer.music.download;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.Charset;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.concurrent.TimeUnit;
import org.slf4j.Logger;

/** yt-dlp / ffmpeg / whisper 하위 프로세스 — 요청·실시간 출력·결과 로깅 */
public final class NrmProcessLogger {

  public enum Tool {
    YT_DLP("yt-dlp"),
    FFMPEG("ffmpeg"),
    WHISPER("whisper"),
    WHISPER_FFMPEG("whisper-ffmpeg");

    private final String tag;

    Tool(String tag) {
      this.tag = tag;
    }

    public String tag() {
      return tag;
    }
  }

  public record ProcessRunResult(int exitCode, String stdout, String stderr, long durationMs) {
    public boolean success() {
      return exitCode == 0;
    }
  }

  private NrmProcessLogger() {}

  public static ProcessRunResult run(
      Logger log,
      Tool tool,
      String context,
      List<String> cmd,
      Path workDir,
      boolean mergeStreams,
      long timeoutSeconds)
      throws Exception {
    String prefix = "[" + tool.tag() + "]";
    long started = System.currentTimeMillis();
    log.info(
        "{} ▶ START {} | cwd={} | cmd={}",
        prefix,
        context,
        workDir != null ? workDir.toAbsolutePath() : "(inherit)",
        formatCommand(cmd));

    Charset cs = Charset.defaultCharset();
    ProcessBuilder pb = new ProcessBuilder(cmd);
    if (workDir != null && Files.isDirectory(workDir)) {
      pb.directory(workDir.toFile());
    }
    pb.redirectErrorStream(mergeStreams);
    Process p = pb.start();

    StringBuilder stdout = new StringBuilder();
    StringBuilder stderr = new StringBuilder();

    if (mergeStreams) {
      Thread drain =
          streamDrain(
              log,
              tool,
              context,
              "OUT",
              p.getInputStream(),
              stdout,
              cs);
      drain.start();
      boolean finished =
          timeoutSeconds > 0
              ? p.waitFor(timeoutSeconds, TimeUnit.SECONDS)
              : waitUnbounded(p);
      if (!finished) {
        p.destroyForcibly();
        long ms = System.currentTimeMillis() - started;
        log.error("{} ✖ TIMEOUT {} | afterMs={}", prefix, context, ms);
        throw new IllegalStateException(tool.tag() + "_timeout");
      }
      drain.join();
    } else {
      Thread tOut =
          streamDrain(log, tool, context, "OUT", p.getInputStream(), stdout, cs);
      Thread tErr =
          streamDrain(log, tool, context, "ERR", p.getErrorStream(), stderr, cs);
      tOut.start();
      tErr.start();
      boolean finished =
          timeoutSeconds > 0
              ? p.waitFor(timeoutSeconds, TimeUnit.SECONDS)
              : waitUnbounded(p);
      if (!finished) {
        p.destroyForcibly();
        long ms = System.currentTimeMillis() - started;
        log.error("{} ✖ TIMEOUT {} | afterMs={}", prefix, context, ms);
        throw new IllegalStateException(tool.tag() + "_timeout");
      }
      tOut.join();
      tErr.join();
    }

    int code = p.exitValue();
    long durationMs = System.currentTimeMillis() - started;
    if (code == 0) {
      log.info(
          "{} ✔ OK {} | exit={} | durationMs={} | stdoutLines={} | stderrLines={}",
          prefix,
          context,
          code,
          durationMs,
          lineCount(stdout),
          lineCount(stderr));
    } else {
      log.warn(
          "{} ✖ FAIL {} | exit={} | durationMs={} | stdoutTail={} | stderrTail={}",
          prefix,
          context,
          code,
          durationMs,
          tail(stdout.toString(), 4000),
          tail(stderr.toString(), 4000));
    }
    return new ProcessRunResult(code, stdout.toString(), stderr.toString(), durationMs);
  }

  private static boolean waitUnbounded(Process p) throws InterruptedException {
    p.waitFor();
    return true;
  }

  private static Thread streamDrain(
      Logger log,
      Tool tool,
      String context,
      String stream,
      InputStream in,
      StringBuilder sink,
      Charset cs) {
    Thread t =
        new Thread(
            () -> {
              try (BufferedReader r = new BufferedReader(new InputStreamReader(in, cs))) {
                String line;
                while ((line = r.readLine()) != null) {
                  sink.append(line).append('\n');
                  log.info("[{}] {} {} | {}", tool.tag(), stream, context, line);
                }
              } catch (Exception ignored) {
                // stream closed
              }
            },
            "nrm-" + tool.tag() + "-" + stream.toLowerCase());
    t.setDaemon(true);
    return t;
  }

  public static String formatCommand(List<String> cmd) {
    if (cmd == null || cmd.isEmpty()) return "";
    StringBuilder sb = new StringBuilder();
    for (int i = 0; i < cmd.size(); i++) {
      if (i > 0) sb.append(' ');
      sb.append(quoteArg(cmd.get(i)));
    }
    return sb.toString();
  }

  private static String quoteArg(String arg) {
    if (arg == null) return "\"\"";
    if (arg.indexOf(' ') < 0 && arg.indexOf('"') < 0) return arg;
    return "\"" + arg.replace("\"", "\\\"") + "\"";
  }

  private static int lineCount(StringBuilder sb) {
    if (sb == null || sb.isEmpty()) return 0;
    int n = 1;
    for (int i = 0; i < sb.length(); i++) {
      if (sb.charAt(i) == '\n') n++;
    }
    return n;
  }

  static String tail(String s, int maxChars) {
    if (s == null || s.length() <= maxChars) return s == null ? "" : s;
    return s.substring(s.length() - maxChars);
  }
}
