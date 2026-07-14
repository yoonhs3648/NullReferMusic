package com.nullrefer.music.ondevice

import android.content.Context
import android.os.Build
import android.os.PowerManager
import kotlin.math.max
import kotlin.math.min

/**
 * 발열 상태에 따라 ONNX 스레드·chunk를 내려 쓰로틀링으로 인한 kill/장시간 지연을 완화한다.
 */
object NrmThermalGuard {
  /** big-core 추정: 논리 코어의 절반(최소 2, 최대 processors). */
  fun estimatedBigCoreCount(): Int {
    val cores = Runtime.getRuntime().availableProcessors().coerceAtLeast(1)
    return max(2, (cores + 1) / 2).coerceAtMost(cores)
  }

  /**
   * ONNX intraOp 상한: (bigCores - 1) 를 기본으로, 열 상태에 따라 1~3 클램프.
   */
  fun onnxIntraOpThreads(context: Context, availMb: Long): Int {
    val budget = (estimatedBigCoreCount() - 1).coerceIn(1, 3)
    val thermal = thermalStatus(context)
    val scaled =
        when {
          thermal >= PowerManager.THERMAL_STATUS_CRITICAL -> 1
          thermal >= PowerManager.THERMAL_STATUS_SEVERE -> 1
          thermal >= PowerManager.THERMAL_STATUS_MODERATE -> min(budget, 2)
          availMb < 1_200 -> 1
          availMb < 1_800 -> min(budget, 2)
          else -> budget
        }
    return scaled.coerceIn(1, 3)
  }

  /** chunk 샘플에 곱할 스케일 (과열 시 3~4초 쪽으로 줄임). */
  fun chunkSampleScale(context: Context): Float {
    val thermal = thermalStatus(context)
    return when {
      thermal >= PowerManager.THERMAL_STATUS_CRITICAL -> 0.55f
      thermal >= PowerManager.THERMAL_STATUS_SEVERE -> 0.70f
      thermal >= PowerManager.THERMAL_STATUS_MODERATE -> 0.85f
      else -> 1.0f
    }
  }

  fun thermalStatus(context: Context): Int {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
      return PowerManager.THERMAL_STATUS_NONE
    }
    return try {
      val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
      pm.currentThermalStatus
    } catch (_: Throwable) {
      PowerManager.THERMAL_STATUS_NONE
    }
  }

  fun thermalLabel(status: Int): String =
      when (status) {
        PowerManager.THERMAL_STATUS_NONE -> "none"
        PowerManager.THERMAL_STATUS_LIGHT -> "light"
        PowerManager.THERMAL_STATUS_MODERATE -> "moderate"
        PowerManager.THERMAL_STATUS_SEVERE -> "severe"
        PowerManager.THERMAL_STATUS_CRITICAL -> "critical"
        PowerManager.THERMAL_STATUS_EMERGENCY -> "emergency"
        PowerManager.THERMAL_STATUS_SHUTDOWN -> "shutdown"
        else -> "unknown($status)"
      }
}
