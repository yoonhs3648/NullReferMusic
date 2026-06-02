package com.nullrefer.music.ondevice

import android.app.ActivityManager
import android.content.Context

/**
 * 기기 RAM에 따라 whisper ggml full .bin vs 양자화(q5 등) 우선순위를 정합니다.
 * full large-v3는 네이티브에서 ~3GB+ 추가 RAM이 필요해, 여유가 없으면 OOM·멈춤이 납니다.
 */
object NrmWhisperDevicePolicy {
  /** full ggml 로드·추론에 권장하는 가용 RAM 하한 (4GiB) */
  private const val MIN_AVAIL_BYTES_FOR_FULL_GGML = 4L * 1024 * 1024 * 1024

  /** 총 RAM 6GiB 미만 기기는 항상 양자화 우선 */
  private const val LOW_TOTAL_RAM_BYTES = 6L * 1024 * 1024 * 1024

  fun isQuantizedGgmlFileName(fileName: String): Boolean {
    val n = fileName.lowercase()
    return n.contains("-q4_") ||
        n.contains("-q5_") ||
        n.contains("-q8_") ||
        n.contains("-q6_")
  }

  /** true면 [ggmlOrderForPreference] 에서 q5/q4 등을 full .bin 보다 먼저 시도 */
  fun preferQuantizedGgml(context: Context): Boolean {
    val am = context.getSystemService(Context.ACTIVITY_SERVICE) as? ActivityManager ?: return true
    val info = ActivityManager.MemoryInfo()
    am.getMemoryInfo(info)
    if (info.totalMem in 1..<LOW_TOTAL_RAM_BYTES) return true
    return info.availMem < MIN_AVAIL_BYTES_FOR_FULL_GGML
  }

  fun memorySnapshot(context: Context): String {
    val am = context.getSystemService(Context.ACTIVITY_SERVICE) as? ActivityManager
        ?: return "activity_manager=null"
    val info = ActivityManager.MemoryInfo()
    am.getMemoryInfo(info)
    val availMb = info.availMem / (1024 * 1024)
    val totalMb = info.totalMem / (1024 * 1024)
    return "availMb=$availMb totalMb=$totalMb lowRam=${preferQuantizedGgml(context)}"
  }
}
