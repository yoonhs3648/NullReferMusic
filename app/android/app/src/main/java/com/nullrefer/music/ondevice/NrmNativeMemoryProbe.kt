package com.nullrefer.music.ondevice

import android.os.Debug
import java.io.File
import java.util.Locale

/**
 * Java Heap이 아닌 Native RSS 증가(LMKD 후보)를 구분하기 위한 계측.
 * availMemMb(시스템 가용)와 별개로, 프로세스 Native/VmRSS를 남긴다.
 */
object NrmNativeMemoryProbe {
  data class Snapshot(
      val nativeAllocMb: Double,
      val nativeHeapMb: Double,
      val nativeFreeMb: Double,
      val javaUsedMb: Long,
      val javaMaxMb: Long,
      val vmRssKb: Long,
      val vmSizeKb: Long,
  ) {
    fun toLog(): String =
        String.format(
            Locale.US,
            "nativeAllocMb=%.1f nativeHeapMb=%.1f nativeFreeMb=%.1f javaUsedMb=%d javaMaxMb=%d VmRSS_kB=%d VmSize_kB=%d",
            nativeAllocMb,
            nativeHeapMb,
            nativeFreeMb,
            javaUsedMb,
            javaMaxMb,
            vmRssKb,
            vmSizeKb,
        )
  }

  fun snapshot(): Snapshot {
    val alloc = Debug.getNativeHeapAllocatedSize().toDouble() / (1024.0 * 1024.0)
    val heap = Debug.getNativeHeapSize().toDouble() / (1024.0 * 1024.0)
    val free = Debug.getNativeHeapFreeSize().toDouble() / (1024.0 * 1024.0)
    val rt = Runtime.getRuntime()
    val javaUsed = (rt.totalMemory() - rt.freeMemory()) / (1024L * 1024L)
    val javaMax = rt.maxMemory() / (1024L * 1024L)
    val (rss, size) = readProcVm()
    return Snapshot(alloc, heap, free, javaUsed, javaMax, rss, size)
  }

  fun log(tag: String, phase: String) {
    try {
      NrmFileLogger.log(tag, "ctc_fa_mem_probe phase=$phase ${snapshot().toLog()}")
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
