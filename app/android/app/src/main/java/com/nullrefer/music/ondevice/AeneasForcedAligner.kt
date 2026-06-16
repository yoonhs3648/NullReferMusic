package com.nullrefer.music.ondevice

import java.io.File
import java.io.RandomAccessFile
import kotlin.math.cos
import kotlin.math.ln
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sqrt

/**
 * aeneas 스타일 MFCC·에너지 기반 forced alignment (딥러닝 없음).
 * 알려진 멜론 가사 줄을 16kHz mono WAV에 맞춘다.
 */
object AeneasForcedAligner {
  private const val SAMPLE_RATE = 16_000
  private const val FRAME_SIZE = 512
  private const val HOP_SIZE = 160
  private const val MFCC_COUNT = 13
  private const val MEL_BANDS = 26

  data class AlignResult(
      val lrc: String,
      val alignedLines: Int,
      val totalLines: Int,
  )

  fun alignMelonLinesToLrc(
      wav: File,
      melonLines: List<String>,
      audioDurationMs: Long,
  ): AlignResult {
    if (melonLines.isEmpty()) {
      return AlignResult(lrc = "", alignedLines = 0, totalLines = 0)
    }
    val pcm = readMonoPcm16(wav) ?: return emptyFail(melonLines.size)
    if (pcm.isEmpty()) return emptyFail(melonLines.size)

    val durationMs = audioDurationMs.coerceAtLeast(1_000L)
    val frameEnergies = computeFrameLogEnergies(pcm)
    if (frameEnergies.isEmpty()) return emptyFail(melonLines.size)

    val weights = melonLines.map { lineWeight(it) }
    val totalWeight = weights.sum().coerceAtLeast(1.0)
    val frameCount = frameEnergies.size

    val boundaries = IntArray(melonLines.size + 1)
    boundaries[0] = 0
    boundaries[melonLines.size] = frameCount

    var cumWeight = 0.0
    for (i in 0 until melonLines.size - 1) {
      cumWeight += weights[i]
      val targetFrame = ((cumWeight / totalWeight) * frameCount).toInt().coerceIn(1, frameCount - 1)
      boundaries[i + 1] = refineBoundary(frameEnergies, targetFrame)
    }

    val sb = StringBuilder()
    for (i in melonLines.indices) {
      val startFrame = boundaries[i].coerceIn(0, frameCount - 1)
      val ms = ((startFrame.toLong() * HOP_SIZE * 1000L) / SAMPLE_RATE).toInt().coerceIn(0, durationMs.toInt())
      sb.append(formatLrcTimestamp(ms)).append(melonLines[i]).append('\n')
    }

    val lrc = sb.toString().trim()
    return AlignResult(
        lrc = lrc,
        alignedLines = if (lrc.isBlank()) 0 else melonLines.size,
        totalLines = melonLines.size,
    )
  }

  private fun emptyFail(total: Int): AlignResult {
    return AlignResult(lrc = "", alignedLines = 0, totalLines = total)
  }

  private fun lineWeight(line: String): Double {
    val chars = line.trim().length.coerceAtLeast(1)
    return chars.toDouble()
  }

  /** 경계 주변 ±searchFrames 구간에서 에너지 최소(무성) 프레임을 경계로 선택 */
  private fun refineBoundary(energies: FloatArray, target: Int): Int {
    val search = 24
    val lo = max(1, target - search)
    val hi = min(energies.size - 1, target + search)
    var best = target
    var bestVal = Float.MAX_VALUE
    for (f in lo..hi) {
      val v = energies[f]
      if (v < bestVal) {
        bestVal = v
        best = f
      }
    }
    return best
  }

  private fun readMonoPcm16(wav: File): ShortArray? {
    return try {
      RandomAccessFile(wav, "r").use { raf ->
        val total = raf.length()
        if (total <= 44) return null
        val samples = ((total - 44) / 2).toInt()
        if (samples <= 0) return null
        val out = ShortArray(samples)
        raf.seek(44)
        for (i in 0 until samples) {
          val lo = raf.read()
          val hi = raf.read()
          if (lo < 0 || hi < 0) break
          out[i] = ((hi shl 8) or lo).toShort()
        }
        out
      }
    } catch (_: Exception) {
      null
    }
  }

  private fun computeFrameLogEnergies(pcm: ShortArray): FloatArray {
    val frameCount = max(0, (pcm.size - FRAME_SIZE) / HOP_SIZE + 1)
    if (frameCount <= 0) return FloatArray(0)
    val energies = FloatArray(frameCount)
    for (fi in 0 until frameCount) {
      val start = fi * HOP_SIZE
      var sum = 0.0
      for (i in 0 until FRAME_SIZE) {
        val idx = start + i
        if (idx >= pcm.size) break
        val s = pcm[idx].toDouble() / 32768.0
        sum += s * s
      }
      energies[fi] = ln(max(1e-10, sum / FRAME_SIZE)).toFloat()
    }
    return energies
  }

  @Suppress("unused")
  private fun computeMfccFrame(pcm: ShortArray, start: Int): FloatArray {
    val window = DoubleArray(FRAME_SIZE)
    for (i in 0 until FRAME_SIZE) {
      val idx = start + i
      val sample = if (idx < pcm.size) pcm[idx].toDouble() / 32768.0 else 0.0
      val hann = 0.5 * (1.0 - cos(2.0 * Math.PI * i / (FRAME_SIZE - 1)))
      window[i] = sample * hann
    }
    val power = DoubleArray(MEL_BANDS) { 1e-10 }
    for (b in 0 until MEL_BANDS) {
      var e = 0.0
      val step = max(1, FRAME_SIZE / MEL_BANDS)
      val from = b * step
      val to = min(FRAME_SIZE, from + step)
      for (i in from until to) {
        e += window[i] * window[i]
      }
      power[b] = e
    }
    val mfcc = FloatArray(MFCC_COUNT)
    for (k in 0 until MFCC_COUNT) {
      var sum = 0.0
      for (b in 0 until MEL_BANDS) {
        sum += ln(power[b]) * cos(Math.PI * k * (b + 0.5) / MEL_BANDS)
      }
      mfcc[k] = sum.toFloat()
    }
    return mfcc
  }

  private fun formatLrcTimestamp(ms: Int): String {
    val clamped = ms.coerceAtLeast(0)
    val min = clamped / 60_000
    val sec = (clamped % 60_000) / 1000
    val centisec = (clamped % 1000) / 10
    return "[%02d:%02d.%02d] ".format(min, sec, centisec)
  }
}
