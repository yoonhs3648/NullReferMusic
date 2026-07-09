package com.nullrefer.music.ondevice

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings

/** Doze·배터리 최적화로 백그라운드 다운로드가 스로틀되는 것을 완화 */
object NrmBatteryOptimization {
  fun isIgnoringBatteryOptimizations(context: Context): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return true
    val pm = context.getSystemService(Context.POWER_SERVICE) as? PowerManager ?: return true
    return pm.isIgnoringBatteryOptimizations(context.packageName)
  }

  /**
   * 배터리 최적화 예외 요청 Intent.
   * 이미 예외면 null (추가 UI 불필요).
   */
  fun buildRequestIntent(context: Context): Intent? {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return null
    if (isIgnoringBatteryOptimizations(context)) return null
    return Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
      data = Uri.parse("package:${context.packageName}")
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
  }

  fun requestIgnoreIfNeeded(context: Context): Boolean {
    val intent = buildRequestIntent(context) ?: return true
    return try {
      context.startActivity(intent)
      NrmFileLogger.log("bg-work", "battery_optimization_request_shown")
      false
    } catch (e: Exception) {
      NrmFileLogger.warn("bg-work", "battery_optimization_request_fail err=${e.message}")
      false
    }
  }
}
