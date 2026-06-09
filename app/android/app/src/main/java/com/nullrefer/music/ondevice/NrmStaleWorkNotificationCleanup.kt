package com.nullrefer.music.ondevice

import android.content.Context
import android.content.Intent

/**
 * 프로세스가 kill·스와이프 종료된 뒤 남는 ongoing 진행 알림(9201/9202/9001)을 제거한다.
 *
 * - 새 프로세스에서는 메모리상 작업 토큰이 비어 있으므로, 보이는 진행 알림은 유령 상태다.
 * - SharedPreferences 플래그로 비정상 종료 여부를 기록·복구한다.
 */
object NrmStaleWorkNotificationCleanup {
  private const val PREFS_NAME = "nrm_bg_work"
  private const val KEY_WORK_ACTIVE = "work_active"

  fun markWorkActive(context: Context, active: Boolean) {
    context.applicationContext
        .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        .edit()
        .putBoolean(KEY_WORK_ACTIVE, active)
        .apply()
  }

  fun isWorkActivePersisted(context: Context): Boolean {
    return context.applicationContext
        .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        .getBoolean(KEY_WORK_ACTIVE, false)
  }

  /** Application cold start — 이전 프로세스의 잔존 진행 알림 정리 */
  fun reconcileOnColdStart(context: Context) {
    val appContext = context.applicationContext
    val inMemoryActive = NrmBackgroundWorkCoordinator.activeTokenCount() > 0
    if (inMemoryActive) return

    val hadPersistedWork = isWorkActivePersisted(appContext)
    forceClearOngoingWorkNotifications(appContext, reason = if (hadPersistedWork) {
      "cold_start_after_abnormal_end"
    } else {
      "cold_start_reconcile"
    })
    markWorkActive(appContext, false)
  }

  /** 스와이프 종료·작업 강제 중단 시 즉시 제거 */
  fun forceClearOngoingWorkNotifications(
      context: Context,
      reason: String = "force_clear",
  ) {
    val appContext = context.applicationContext
    NrmForegroundNotificationBinder.clearAllProgressNotifications(appContext)
    appContext.stopService(Intent(appContext, NrmBackgroundWorkService::class.java))
    NrmFileLogger.log("bg-work", "Cleared ongoing work notifications reason=$reason")
  }
}
