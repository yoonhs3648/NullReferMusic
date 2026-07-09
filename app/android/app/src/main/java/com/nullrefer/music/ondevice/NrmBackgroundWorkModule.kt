package com.nullrefer.music.ondevice

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.modules.core.DeviceEventManagerModule

/** JS — 다운로드·Whisper 세션마다 acquire/release 로 Foreground Service 유지 */
class NrmBackgroundWorkModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "NrmBackgroundWork"

  @ReactMethod
  fun acquire(token: String) {
    NrmBackgroundWorkCoordinator.acquire(reactApplicationContext, token)
  }

  @ReactMethod
  fun release(token: String) {
    NrmBackgroundWorkCoordinator.release(reactApplicationContext, token)
  }

  @ReactMethod
  fun registerActiveAudioExtract(jobId: String) {
    NrmBackgroundWorkCoordinator.registerActiveAudioExtract(jobId)
  }

  @ReactMethod
  fun unregisterActiveAudioExtract(jobId: String) {
    NrmBackgroundWorkCoordinator.unregisterActiveAudioExtract(jobId)
  }

  @ReactMethod
  fun hasActiveDownloadOrLyricsWork(promise: Promise) {
    try {
      promise.resolve(NrmBackgroundWorkCoordinator.hasBlockingExitWork())
    } catch (e: Exception) {
      promise.reject("E_BG_WORK", e.message ?: e.toString(), e)
    }
  }

  @ReactMethod
  fun isIgnoringBatteryOptimizations(promise: Promise) {
    try {
      promise.resolve(NrmBatteryOptimization.isIgnoringBatteryOptimizations(reactApplicationContext))
    } catch (e: Exception) {
      promise.reject("E_BG_WORK", e.message ?: e.toString(), e)
    }
  }

  @ReactMethod
  fun requestIgnoreBatteryOptimizations(promise: Promise) {
    try {
      val already = NrmBatteryOptimization.isIgnoringBatteryOptimizations(reactApplicationContext)
      if (already) {
        promise.resolve(true)
        return
      }
      val shown = NrmBatteryOptimization.requestIgnoreIfNeeded(reactApplicationContext)
      promise.resolve(shown)
    } catch (e: Exception) {
      promise.reject("E_BG_WORK", e.message ?: e.toString(), e)
    }
  }

  /** wall-clock 타임아웃 — Handler (JS setTimeout 백그라운드 스로틀 회피) */
  @ReactMethod
  fun scheduleWallClockTimeout(id: String, delayMs: Double) {
    val trimmed = id.trim()
    if (trimmed.isEmpty()) return
    val delay = delayMs.toLong().coerceAtLeast(0L)
    NrmWallClockScheduler.schedule(trimmed, delay) {
      emitWallClockTimeout(trimmed)
    }
  }

  @ReactMethod
  fun cancelWallClockTimeout(id: String) {
    NrmWallClockScheduler.cancel(id.trim())
  }

  /**
   * innertube player API — HttpURLConnection readTimeout.
   * hang 시 JS AbortSignal 만으로는 백그라운드에서 끊기지 않는 문제를 보완.
   */
  @ReactMethod
  fun youtubeHttpFetch(
      url: String,
      method: String,
      headers: ReadableMap,
      body: String?,
      connectTimeoutMs: Double,
      readTimeoutMs: Double,
      promise: Promise,
  ) {
    Thread {
      try {
        val headerMap = linkedMapOf<String, String>()
        val iterator = headers.keySetIterator()
        while (iterator.hasNextKey()) {
          val key = iterator.nextKey()
          headers.getString(key)?.let { headerMap[key] = it }
        }
        val result =
            NrmYoutubeHttpFetch.fetch(
                urlStr = url,
                method = method,
                headers = headerMap,
                body = body,
                connectTimeoutMs = connectTimeoutMs.toInt(),
                readTimeoutMs = readTimeoutMs.toInt(),
            )
        val row = Arguments.createMap()
        row.putInt("status", result.status)
        row.putString("body", result.body)
        val hdr = Arguments.createMap()
        for ((k, v) in result.headers) {
          hdr.putString(k, v)
        }
        row.putMap("headers", hdr)
        promise.resolve(row)
      } catch (e: NrmYoutubeHttpFetch.HttpTimeoutException) {
        promise.reject("E_YT_HTTP_TIMEOUT", e.message ?: "timeout", e)
      } catch (e: Exception) {
        promise.reject("E_YT_HTTP", e.message ?: e.toString(), e)
      }
    }
      .start()
  }

  private fun emitWallClockTimeout(id: String) {
    try {
      val body = Arguments.createMap()
      body.putString("id", id)
      reactContext
          .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
          .emit("NrmWallClockTimeout", body)
    } catch (e: Exception) {
      NrmFileLogger.warn("bg-work", "wall_clock_emit_fail id=$id err=${e.message}")
    }
  }

  @ReactMethod
  fun addListener(eventName: String) {
    // NativeEventEmitter 경고 방지
  }

  @ReactMethod
  fun removeListeners(count: Int) {
    // NativeEventEmitter 경고 방지
  }
}
