package com.nullrefer.music.ondevice

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/** JS → Download/NullReferenceMusic/logs/nrm-debug.log */
class NrmFileLoggerModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "NrmFileLogger"

  @ReactMethod
  fun log(tag: String, level: String, message: String) {
    val safeTag = tag.trim().ifBlank { "js" }
    val safeMsg = message.trim()
    when (level.trim().lowercase()) {
      "error", "e" -> NrmFileLogger.error(safeTag, safeMsg)
      "warn", "w" -> NrmFileLogger.warn(safeTag, safeMsg)
      else -> NrmFileLogger.log(safeTag, safeMsg)
    }
  }

  @ReactMethod
  fun getLogFilePath(promise: Promise) {
    try {
      if (!NrmFileLogger.isEnabled()) {
        promise.resolve(null)
        return
      }
      NrmFileLogger.init(reactApplicationContext.applicationContext)
      promise.resolve(NrmFileLogger.getDisplayPath())
    } catch (e: Exception) {
      promise.reject("E_NRM_LOG", e.message ?: e.toString(), e)
    }
  }
}
