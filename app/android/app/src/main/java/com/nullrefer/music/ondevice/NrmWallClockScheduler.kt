package com.nullrefer.music.ondevice

import android.os.Handler
import android.os.Looper
import java.util.concurrent.ConcurrentHashMap

/**
 * JS Hermes setTimeout 은 백그라운드·Doze 에서 크게 지연될 수 있다.
 * Main-thread Handler.postDelayed 로 wall-clock 타임아웃을 보강한다.
 */
object NrmWallClockScheduler {
  private val handler = Handler(Looper.getMainLooper())
  private val runnables = ConcurrentHashMap<String, Runnable>()

  fun schedule(id: String, delayMs: Long, onFire: () -> Unit) {
    cancel(id)
    val delay = delayMs.coerceAtLeast(0L)
    val runnable =
        Runnable {
          if (runnables.remove(id) != null) {
            onFire()
          }
        }
    runnables[id] = runnable
    handler.postDelayed(runnable, delay)
  }

  fun cancel(id: String) {
    val removed = runnables.remove(id) ?: return
    handler.removeCallbacks(removed)
  }

  fun cancelAll() {
    val ids = runnables.keys.toList()
    for (id in ids) {
      cancel(id)
    }
  }
}
