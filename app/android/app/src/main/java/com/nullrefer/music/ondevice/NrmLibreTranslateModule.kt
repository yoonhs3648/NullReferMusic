package com.nullrefer.music.ondevice

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.WritableArray
import com.facebook.react.modules.core.DeviceEventManagerModule

/** LibreTranslate(Argos) 오프라인 언어 팩 + 번역 */
class NrmLibreTranslateModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {
  init {
    LibreTranslatePackageDownloader.setEventEmitter { event, body -> sendEvent(event, body) }
  }

  override fun getName(): String = "NrmLibreTranslate"

  @ReactMethod
  fun addListener(eventName: String) {
    // RN NativeEventEmitter
  }

  @ReactMethod
  fun removeListeners(count: Int) {
    // RN NativeEventEmitter
  }

  @ReactMethod
  fun getPackageStatuses(promise: Promise) {
    try {
      val statuses = LibreTranslatePackageDownloader.listStatuses(reactApplicationContext)
      val arr: WritableArray = Arguments.createArray()
      for (s in statuses) {
        val row = Arguments.createMap()
        row.putString("packageId", s.packageId)
        row.putBoolean("installed", s.installed)
        row.putBoolean("downloading", s.downloading)
        row.putInt("progress", s.progress)
        arr.pushMap(row)
      }
      promise.resolve(arr)
    } catch (e: Exception) {
      promise.reject("E_LIBRE_STATUS", e.message ?: e.toString(), e)
    }
  }

  @ReactMethod
  fun isOfflineReady(promise: Promise) {
    try {
      promise.resolve(LibreTranslatePackageDownloader.isOfflineReady(reactApplicationContext))
    } catch (e: Exception) {
      promise.reject("E_LIBRE_READY", e.message ?: e.toString(), e)
    }
  }

  @ReactMethod
  fun getEngineInfo(promise: Promise) {
    try {
      val ready = LibreTranslatePackageDownloader.isOfflineReady(reactApplicationContext)
      val out = Arguments.createMap()
      out.putBoolean("ready", ready)
      val compute = ArgosBridge.getActiveComputeType()
      if (compute.isNotBlank()) {
        out.putString("computeType", compute)
      }
      promise.resolve(out)
    } catch (e: Exception) {
      promise.reject("E_LIBRE_ENGINE", e.message ?: e.toString(), e)
    }
  }

  @ReactMethod
  fun startPackageDownload(packageId: String?, promise: Promise) {
    try {
      val id = (packageId ?: "").trim()
      if (!id.startsWith("libretranslate:")) {
        promise.reject("E_ARG", "invalid_package_id")
        return
      }
      LibreTranslatePackageDownloader.startDownload(reactApplicationContext, id)
      val ok = Arguments.createMap()
      ok.putBoolean("started", true)
      promise.resolve(ok)
    } catch (e: Exception) {
      promise.reject("E_LIBRE_DL", e.message ?: e.toString(), e)
    }
  }

  @ReactMethod
  fun translateTexts(texts: ReadableArray, promise: Promise) {
    Thread {
      try {
        val lines = ArrayList<String>()
        for (i in 0 until texts.size()) {
          lines.add(texts.getString(i)?.trim() ?: "")
        }
        val batch =
            ArgosBridge.translateTextsToKorean(reactApplicationContext, lines)
                ?: run {
                  promise.reject("E_LIBRE_TRANSLATE", "offline_translate_failed")
                  return@Thread
                }
        val out = Arguments.createMap()
        val arr = Arguments.createArray()
        for (t in batch.texts) arr.pushString(t)
        out.putArray("texts", arr)
        val langs = Arguments.createArray()
        for (l in batch.sourceLangs) langs.pushString(l)
        out.putArray("sourceLangs", langs)
        promise.resolve(out)
      } catch (t: Throwable) {
        NrmFileLogger.error("libretranslate", "translateTexts 실패", t)
        promise.reject("E_LIBRE_TRANSLATE", t.message ?: t.toString(), t as? Exception)
      }
    }.start()
  }

  private fun sendEvent(eventName: String, params: com.facebook.react.bridge.WritableMap?) {
    if (!reactApplicationContext.hasActiveReactInstance()) return
    reactApplicationContext
        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        .emit(eventName, params)
  }
}
