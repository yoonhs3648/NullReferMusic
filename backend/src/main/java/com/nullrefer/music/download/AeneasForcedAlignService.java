package com.nullrefer.music.download;

import java.io.RandomAccessFile;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/** aeneas 스타일 MFCC·에너지 기반 forced alignment (Android Kotlin 포트). */
@Service
public class AeneasForcedAlignService {

  private static final Logger log = LoggerFactory.getLogger(AeneasForcedAlignService.class);
  private static final int SAMPLE_RATE = 16_000;
  private static final int FRAME_SIZE = 512;
  private static final int HOP_SIZE = 160;

  public record AlignResult(String lrc, int alignedLines, int totalLines) {}

  public AlignResult alignMelonLinesToLrc(Path wavFile, List<String> melonLines, long audioDurationMs) {
    if (melonLines == null || melonLines.isEmpty()) {
      return new AlignResult("", 0, 0);
    }
    short[] pcm = readMonoPcm16(wavFile);
    if (pcm == null || pcm.length == 0) {
      log.warn("[align-aeneas] pcm_read_failed file={}", wavFile.getFileName());
      return emptyFail(melonLines.size());
    }

    long durationMs = Math.max(1_000L, audioDurationMs);
    float[] frameEnergies = computeFrameLogEnergies(pcm);
    if (frameEnergies.length == 0) {
      return emptyFail(melonLines.size());
    }

    List<Double> weights = new ArrayList<>();
    double totalWeight = 0;
    for (String line : melonLines) {
      double w = Math.max(1, line.trim().length());
      weights.add(w);
      totalWeight += w;
    }
    totalWeight = Math.max(1.0, totalWeight);

    int frameCount = frameEnergies.length;
    int[] boundaries = new int[melonLines.size() + 1];
    boundaries[0] = 0;
    boundaries[melonLines.size()] = frameCount;

    double cumWeight = 0;
    for (int i = 0; i < melonLines.size() - 1; i++) {
      cumWeight += weights.get(i);
      int targetFrame =
          (int) Math.round((cumWeight / totalWeight) * frameCount);
      targetFrame = Math.max(1, Math.min(frameCount - 1, targetFrame));
      boundaries[i + 1] = refineBoundary(frameEnergies, targetFrame);
    }

    StringBuilder sb = new StringBuilder();
    for (int i = 0; i < melonLines.size(); i++) {
      int startFrame = Math.max(0, Math.min(frameCount - 1, boundaries[i]));
      int ms =
          (int)
              Math.min(
                  durationMs,
                  Math.max(0, (startFrame * (long) HOP_SIZE * 1000L) / SAMPLE_RATE));
      sb.append(formatLrcTimestamp(ms)).append(melonLines.get(i)).append('\n');
    }

    String lrc = sb.toString().trim();
    return new AlignResult(
        lrc,
        lrc.isBlank() ? 0 : melonLines.size(),
        melonLines.size());
  }

  private static AlignResult emptyFail(int total) {
    return new AlignResult("", 0, total);
  }

  private static int refineBoundary(float[] energies, int target) {
    int search = 24;
    int lo = Math.max(1, target - search);
    int hi = Math.min(energies.length - 1, target + search);
    int best = target;
    float bestVal = Float.MAX_VALUE;
    for (int f = lo; f <= hi; f++) {
      if (energies[f] < bestVal) {
        bestVal = energies[f];
        best = f;
      }
    }
    return best;
  }

  private static short[] readMonoPcm16(Path wav) {
    try (RandomAccessFile raf = new RandomAccessFile(wav.toFile(), "r")) {
      long total = raf.length();
      if (total <= 44) return null;
      int samples = (int) ((total - 44) / 2);
      if (samples <= 0) return null;
      short[] out = new short[samples];
      raf.seek(44);
      for (int i = 0; i < samples; i++) {
        int lo = raf.read();
        int hi = raf.read();
        if (lo < 0 || hi < 0) break;
        out[i] = (short) ((hi << 8) | lo);
      }
      return out;
    } catch (Exception e) {
      return null;
    }
  }

  private static float[] computeFrameLogEnergies(short[] pcm) {
    int frameCount = Math.max(0, (pcm.length - FRAME_SIZE) / HOP_SIZE + 1);
    if (frameCount <= 0) return new float[0];
    float[] energies = new float[frameCount];
    for (int fi = 0; fi < frameCount; fi++) {
      int start = fi * HOP_SIZE;
      double sum = 0;
      for (int i = 0; i < FRAME_SIZE; i++) {
        int idx = start + i;
        if (idx >= pcm.length) break;
        double s = pcm[idx] / 32768.0;
        sum += s * s;
      }
      energies[fi] = (float) Math.log(Math.max(1e-10, sum / FRAME_SIZE));
    }
    return energies;
  }

  static long wavDurationMs(Path wav) {
    try {
      short[] pcm = readMonoPcm16(wav);
      if (pcm == null || pcm.length == 0) return 180_000L;
      return Math.max(1_000L, (pcm.length * 1000L) / SAMPLE_RATE);
    } catch (Exception e) {
      return 180_000L;
    }
  }

  private static String formatLrcTimestamp(int ms) {
    int clamped = Math.max(0, ms);
    int min = clamped / 60_000;
    int sec = (clamped % 60_000) / 1000;
    int centisec = (clamped % 1000) / 10;
    return String.format("[%02d:%02d.%02d] ", min, sec, centisec);
  }
}
