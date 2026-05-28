package com.nullrefer.music.download;

import com.nullrefer.music.config.NrmPaths;
import java.io.BufferedInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/** PC `library/whisper` — Hugging Face 백그라운드 다운로드 (APK WhisperModelDownloader 와 동일 UX) */
@Component
public class WhisperModelDownloader {

  private static final Logger log = LoggerFactory.getLogger(WhisperModelDownloader.class);
  private static final String HF_BASE =
      "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/";

  private static final List<String> CATALOG_IDS =
      List.of(
          "whisper:large-v3-turbo",
          "whisper:large-v3",
          "whisper:medium",
          "whisper:small",
          "whisper:base");

  public record ModelStatus(
      String modelId, boolean installed, boolean downloading, int progress) {}

  private final NrmPaths paths;
  private final ExecutorService executor = Executors.newCachedThreadPool();
  private final ConcurrentHashMap<String, AtomicBoolean> activeDownloads =
      new ConcurrentHashMap<>();
  private final ConcurrentHashMap<String, Integer> progressByModel = new ConcurrentHashMap<>();

  public WhisperModelDownloader(NrmPaths paths) {
    this.paths = paths;
  }

  public List<ModelStatus> listStatuses() {
    Path dir = paths.getWhisperDir();
    List<ModelStatus> out = new ArrayList<>();
    for (String id : CATALOG_IDS) {
      boolean downloading = activeDownloads.getOrDefault(id, new AtomicBoolean(false)).get();
      int progress =
          downloading
              ? progressByModel.getOrDefault(id, 0)
              : resolveInstalledFile(dir, id) != null ? 100 : 0;
      boolean installed = !downloading && resolveInstalledFile(dir, id) != null;
      out.add(
          new ModelStatus(
              id, installed, downloading, Math.min(100, Math.max(0, progress))));
    }
    return out;
  }

  public boolean isModelInstalled(String modelId) {
    return resolveInstalledFile(paths.getWhisperDir(), modelId) != null;
  }

  public boolean hasAnyModelInstalled() {
    for (String id : CATALOG_IDS) {
      if (isModelInstalled(id)) return true;
    }
    return false;
  }

  public Path resolveInstalledModel(String modelId) {
    return resolveInstalledFile(paths.getWhisperDir(), modelId);
  }

  public void startDownload(String modelId) {
    if (!modelId.startsWith("whisper:")) {
      throw new IllegalArgumentException("invalid_model_id");
    }
    if (isModelInstalled(modelId)) {
      progressByModel.put(modelId, 100);
      return;
    }
    AtomicBoolean flag = activeDownloads.computeIfAbsent(modelId, k -> new AtomicBoolean(false));
    if (!flag.compareAndSet(false, true)) {
      return;
    }
    progressByModel.put(modelId, 0);
    Path whisperDir = paths.getWhisperDir();
    executor.execute(
        () -> {
          boolean ok = false;
          try {
            Files.createDirectories(whisperDir);
            for (String fileName : WhisperModelCatalog.ggmlOrderForPreference(modelId)) {
              Path dest = whisperDir.resolve(fileName);
              long minBytes = WhisperModelCatalog.minBytesFor(fileName);
              if (isValidFile(dest, minBytes)) {
                ok = true;
                break;
              }
              if (downloadFile(modelId, fileName, dest, minBytes)) {
                ok = true;
                break;
              }
            }
          } catch (Exception e) {
            log.warn("whisper model download failed {}: {}", modelId, e.getMessage());
          } finally {
            flag.set(false);
            activeDownloads.remove(modelId);
            progressByModel.remove(modelId);
          }
        });
  }

  private boolean downloadFile(String modelId, String fileName, Path dest, long minBytes) {
    Path tmp = dest.resolveSibling(fileName + ".download");
    try {
      if (isValidFile(dest, minBytes)) {
        progressByModel.put(modelId, 100);
        return true;
      }
      Files.deleteIfExists(tmp);
      URI uri = URI.create(HF_BASE + fileName + "?download=true");
      log.info("whisper download start: {} ({})", fileName, modelId);
      HttpURLConnection conn = (HttpURLConnection) uri.toURL().openConnection();
      conn.setConnectTimeout(30_000);
      conn.setReadTimeout(600_000);
      conn.setInstanceFollowRedirects(true);
      conn.setRequestMethod("GET");
      int code = conn.getResponseCode();
      if (code < 200 || code > 299) {
        log.warn("whisper download http {} for {}", code, fileName);
        return false;
      }
      long total = conn.getContentLengthLong();
      long copied = 0;
      int lastPct = -1;
      try (InputStream input = new BufferedInputStream(conn.getInputStream())) {
        Files.createDirectories(dest.getParent());
        try (var out = Files.newOutputStream(tmp)) {
          byte[] buffer = new byte[64 * 1024];
          int read;
          while ((read = input.read(buffer)) >= 0) {
            if (read == 0) continue;
            out.write(buffer, 0, read);
            copied += read;
            if (total > 0) {
              int pct = (int) Math.min(99, (copied * 100) / total);
              if (pct != lastPct) {
                lastPct = pct;
                progressByModel.put(modelId, pct);
              }
            }
          }
        }
      } finally {
        conn.disconnect();
      }
      if (!Files.isRegularFile(tmp) || Files.size(tmp) < minBytes) {
        Files.deleteIfExists(tmp);
        log.warn("whisper download too small: {}", fileName);
        return false;
      }
      Files.move(tmp, dest, StandardCopyOption.REPLACE_EXISTING);
      progressByModel.put(modelId, 100);
      log.info("whisper download ok: {} ({} bytes)", fileName, Files.size(dest));
      return true;
    } catch (Exception e) {
      log.warn("whisper download failed {}: {}", fileName, e.getMessage());
      try {
        Files.deleteIfExists(tmp);
      } catch (IOException ignored) {
        // ignore
      }
      return false;
    }
  }

  private static Path resolveInstalledFile(Path dir, String modelId) {
    for (String name : WhisperModelCatalog.ggmlOrderForPreference(modelId)) {
      Path candidate = dir.resolve(name);
      if (isValidFile(candidate, WhisperModelCatalog.minBytesFor(name))) {
        return candidate;
      }
    }
    return null;
  }

  private static boolean isValidFile(Path file, long minBytes) {
    try {
      return Files.isRegularFile(file) && Files.size(file) >= minBytes;
    } catch (Exception e) {
      return false;
    }
  }
}
