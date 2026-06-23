package com.nullrefer.music.ondevice

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.DocumentsContract
import com.facebook.react.bridge.ActivityEventListener
import com.nullrefer.music.NrmBrand
import java.util.Locale
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/** JS → Download/NullReferenceMusic/logs/nullReferenceMusicLog.log */
class NrmFileLoggerModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext), ActivityEventListener {

  companion object {
    private const val REQ_PICK_ATTACHMENT = 8821
    private const val MAX_ATTACHMENT_BYTES = 20L * 1024L * 1024L
  }

  private var pickPromise: Promise? = null

  init {
    reactContext.addActivityEventListener(this)
  }

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

  @ReactMethod
  fun listLogFolderFiles(promise: Promise) {
    try {
      NrmFileLogger.init(reactApplicationContext.applicationContext)
      val rows = NrmFileLogger.listLogFolderFiles(reactApplicationContext.applicationContext)
      val arr = Arguments.createArray()
      for (row in rows) {
        val m = Arguments.createMap()
        m.putString("name", row.name)
        m.putString("uri", row.uri)
        m.putDouble("sizeBytes", row.sizeBytes.toDouble())
        arr.pushMap(m)
      }
      promise.resolve(arr)
    } catch (e: Exception) {
      promise.reject("E_NRM_ATTACH_LIST", e.message ?: e.toString(), e)
    }
  }

  @ReactMethod
  fun pickAttachmentFile(promise: Promise) {
    val activity = reactApplicationContext.currentActivity
    if (activity == null) {
      promise.reject("E_NO_ACTIVITY", "Activity not available")
      return
    }
    if (pickPromise != null) {
      promise.reject("E_BUSY", "Picker already open")
      return
    }
    pickPromise = promise
    try {
      val logsRel = NrmBrand.STORAGE_LOGS_PATH
      val initialUri =
          Uri.parse(
              "content://com.android.externalstorage.documents/document/primary:" +
                  Uri.encode(logsRel))
      val intent =
          Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = "text/plain"
            putExtra(Intent.EXTRA_MIME_TYPES, arrayOf("text/plain"))
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            addFlags(Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
              putExtra(DocumentsContract.EXTRA_INITIAL_URI, initialUri)
            }
          }
      activity.startActivityForResult(intent, REQ_PICK_ATTACHMENT)
    } catch (e: Exception) {
      pickPromise = null
      promise.reject("E_PICK", e.message ?: e.toString(), e)
    }
  }

  @ReactMethod
  fun readAttachmentBase64(uri: String, promise: Promise) {
    Thread {
      try {
        val b64 =
            NrmFileLogger.readUriAsBase64(reactApplicationContext.applicationContext, uri.trim())
        promise.resolve(b64)
      } catch (e: Exception) {
        promise.reject("E_READ", e.message ?: e.toString(), e)
      }
    }.start()
  }

  override fun onActivityResult(
      activity: Activity,
      requestCode: Int,
      resultCode: Int,
      data: Intent?,
  ) {
    if (requestCode != REQ_PICK_ATTACHMENT) return
    val promise = pickPromise
    pickPromise = null
    if (promise == null) return
    if (resultCode != Activity.RESULT_OK || data?.data == null) {
      promise.resolve(null)
      return
    }
    val uri = data.data!!
    try {
      val ctx = reactApplicationContext.applicationContext
      val name = NrmFileLogger.queryDisplayName(ctx, uri) ?: "attachment"
      if (!name.lowercase(Locale.US).endsWith(".txt")) {
        promise.reject("E_PICK_TYPE", "txt 파일만 첨부할 수 있습니다.")
        return
      }
      val size = NrmFileLogger.querySizeBytes(ctx, uri)
      if (size > MAX_ATTACHMENT_BYTES) {
        promise.reject("E_PICK_SIZE", "첨부파일은 20MB 까지 가능합니다.")
        return
      }
      try {
        ctx.contentResolver.takePersistableUriPermission(
            uri,
            Intent.FLAG_GRANT_READ_URI_PERMISSION,
        )
      } catch (_: Exception) {
        /* 일부 URI는 persist 불가 — 같은 세션 읽기는 가능 */
      }
      val map = Arguments.createMap()
      map.putString("name", name)
      map.putString("uri", uri.toString())
      map.putDouble("sizeBytes", size.toDouble())
      promise.resolve(map)
    } catch (e: Exception) {
      promise.reject("E_PICK_RESULT", e.message ?: e.toString(), e)
    }
  }

  override fun onNewIntent(intent: Intent) {}
}
