package com.nullrefer.music.ondevice

import android.os.Debug
import java.io.File
import java.util.Locale
import java.util.concurrent.atomic.AtomicLong

/**
 * Native/RSS 계측.
 *
 * **단위:** `Debug.getNativeHeap*Size()` 는 **bytes**. 로그의 Mb/MiB는 모두 `bytes / (1024*1024)`.
 * (1000 기반 변환 아님 — 계산식은 맞다.)
 *
 * **의미 (중요):**
 * - `nativeAllocMb` = **프로세스 전체 ART Native Heap** 할당량. ONNX Runtime만의 사용량이 **아니다**.
 * - ORT Arena/mmap 일부는 ART 집계에 안 잡히거나, 반대로 ART heap이 RSS보다 크게 잡힐 수 있다
 *   (커밋됐지만 resident 아닌 페이지).
 * - LMKD와 직접 맞닿는 지표는 **`VmRSS_kB`** (및 시스템 availMb).
 * - `nativeAllocMb ≫ VmRSS` 이면 "모델이 3.5GB를 물리적으로 잡고 있다"고 단정하면 안 된다.
 */
object NrmNativeMemoryProbe {
  private val lastRssKb = AtomicLong(-1L)

  data class Snapshot(
      val nativeAllocMb: Double,
      val nativeHeapMb: Double,
      val nativeFreeMb: Double,
      val javaUsedMb: Long,
      val javaMaxMb: Long,
      val vmRssKb: Long,
      val vmSizeKb: Long,
      val rssDeltaKb: Long,
  ) {
    fun toLog(): String {
      val rssMiB = if (vmRssKb > 0) vmRssKb / 1024.0 else -1.0
      return String.format(
          Locale.US,
          "nativeAllocMb=%.1f(ART_heap_not_OrtOnly) nativeHeapMb=%.1f nativeFreeMb=%.1f javaUsedMb=%d javaMaxMb=%d VmRSS_kB=%d rssMiB=%.1f rssDeltaKb=%d VmSize_kB=%d formula=bytes/1024/1024",
          nativeAllocMb,
          nativeHeapMb,
          nativeFreeMb,
          javaUsedMb,
          javaMaxMb,
          vmRssKb,
          rssMiB,
          rssDeltaKb,
          vmSizeKb,
      )
    }
  }

  fun snapshot(): Snapshot {
    // bytes → MiB (1024^2). 단위 변환은 정상.
    val alloc = Debug.getNativeHeapAllocatedSize().toDouble() / (1024.0 * 1024.0)
    val heap = Debug.getNativeHeapSize().toDouble() / (1024.0 * 1024.0)
    val free = Debug.getNativeHeapFreeSize().toDouble() / (1024.0 * 1024.0)
    val rt = Runtime.getRuntime()
    val javaUsed = (rt.totalMemory() - rt.freeMemory()) / (1024L * 1024L)
    val javaMax = rt.maxMemory() / (1024L * 1024L)
    val (rss, size) = readProcVm()
    val prev = lastRssKb.getAndSet(rss)
    val delta = if (prev >= 0 && rss >= 0) rss - prev else 0L
    return Snapshot(alloc, heap, free, javaUsed, javaMax, rss, size, delta)
  }

  fun log(tag: String, phase: String) {
    try {
      val snap = snapshot()
      NrmFileLogger.log(tag, "ctc_fa_mem_probe phase=$phase ${snap.toLog()}")
      // ART heap ≫ RSS 이면 "Ort가 3.5GB resident"로 오해하지 말 것
      if (snap.vmRssKb > 0 && snap.nativeAllocMb > snap.vmRssKb / 1024.0 * 1.25) {
        NrmFileLogger.log(
            tag,
            "ctc_fa_mem_note phase=$phase artHeapGtRss=true interpret=prefer_VmRSS_for_LMKD",
        )
      }
    } catch (t: Throwable) {
      NrmFileLogger.warn(tag, "ctc_fa_mem_probe_fail phase=$phase err=${t.message}")
    }
  }

  private fun readProcVm(): Pair<Long, Long> {
    return try {
      var rss = -1L
      var size = -1L
      File("/proc/self/status").forEachLine { line ->
        when {
          line.startsWith("VmRSS:") -> rss = parseKb(line)
          line.startsWith("VmSize:") -> size = parseKb(line)
        }
      }
      rss to size
    } catch (_: Throwable) {
      -1L to -1L
    }
  }

  private fun parseKb(line: String): Long {
    val parts = line.trim().split(Regex("\\s+"))
    if (parts.size < 2) return -1L
    return parts[1].toLongOrNull() ?: -1L
  }
}
