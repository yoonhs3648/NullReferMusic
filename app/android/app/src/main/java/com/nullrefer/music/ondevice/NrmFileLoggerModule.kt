package com.nullrefer.music.ondevice

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/** JS → Download/NullReferenceMusic/logs/nrm-debug-YYYY-MM-DD.log */
class NrmFileLoggerModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "NrmFileLogger"

  @ReactMethod
  fun setLoggingEnabled(enabled: Boolean) {
    NrmFileLogger.init(reactApplicationContext.applicationContext)
    NrmFileLogger.setUserLoggingEnabled(enabled)
  }

  @ReactMethod
  fun log(tag: String, level: String, message: String) {
    if (!NrmFileLogger.isUserLoggingEnabled()) return
    val ctx = reactApplicationContext.applicationContext
    val safeTag = tag.trim().ifBlank { "js" }
    val safeMsg = message.trim()
    val safeLevel = level.trim().lowercase()
    Thread {
      NrmFileLogger.init(ctx)
      when (safeLevel) {
        "error", "e" -> NrmFileLogger.error(safeTag, safeMsg)
        "warn", "w" -> NrmFileLogger.warn(safeTag, safeMsg)
        else -> NrmFileLogger.log(safeTag, safeMsg)
      }
    }.start()
  }

  @ReactMethod
  fun getLogFilePath(promise: Promise) {
    try {
      NrmFileLogger.init(reactApplicationContext.applicationContext)
      val path = NrmFileLogger.getDisplayPath()
      promise.resolve(path.ifBlank { null })
    } catch (e: Exception) {
      promise.reject("E_NRM_LOG", e.message ?: e.toString(), e)
    }
  }

  @ReactMethod
  fun deleteAllLogFiles(promise: Promise) {
    try {
      NrmFileLogger.init(reactApplicationContext.applicationContext)
      val count = NrmFileLogger.deleteAllLogFiles()
      promise.resolve(count)
    } catch (e: Exception) {
      promise.reject("E_NRM_LOG_DELETE", e.message ?: e.toString(), e)
    }
  }
}
