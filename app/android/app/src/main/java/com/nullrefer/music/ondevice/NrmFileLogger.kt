package com.nullrefer.music.ondevice

import android.content.ContentUris
import android.content.ContentValues
import android.content.Context
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.util.Log
import com.nullrefer.music.BuildConfig
import java.io.File
import java.io.IOException
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * 사용자가 파일 관리자에서 바로 열 수 있는 경로에 디버그 로그를 기록합니다.
 *
 * 경로: Download/NullReferenceMusic/logs/nrm-debug.log
 * (Android/data 아래가 아님)
 */
object NrmFileLogger {
  private const val FILE_LOGGING_ENABLED = true

  private const val LOG_TAG = "NrmFileLogger"
  private const val LOG_FILE_NAME = "nrm-debug.log"
  private const val FOLDER = "NullReferenceMusic/logs"
  private const val MAX_BYTES = 5L * 1024 * 1024

  @Volatile private var appContext: Context? = null
  private val lock = Any()
  private var mediaStoreUri: Uri? = null
  private var legacyLogFile: File? = null
  private var displayPath: String =
    "${Environment.DIRECTORY_DOWNLOADS}/NullReferenceMusic/logs/$LOG_FILE_NAME"

  fun init(context: Context) {
    if (!FILE_LOGGING_ENABLED) return
    if (appContext != null) return
    synchronized(lock) {
      if (appContext != null) return
      appContext = context.applicationContext
      ensureLogSink(createIfMissing = true)
      logSessionHeader()
    }
  }

  fun getDisplayPath(): String =
    if (FILE_LOGGING_ENABLED) displayPath else ""

  /** JS/레거시 — 파일 로깅 활성 여부 */
  fun isEnabled(): Boolean = FILE_LOGGING_ENABLED

  fun log(tag: String, message: String) {
    if (!FILE_LOGGING_ENABLED) return
    write("I", tag, message, null)
  }

  fun warn(tag: String, message: String) {
    if (!FILE_LOGGING_ENABLED) return
    write("W", tag, message, null)
  }

  fun error(tag: String, message: String, throwable: Throwable? = null) {
    if (!FILE_LOGGING_ENABLED) return
    write("E", tag, message, throwable)
  }

  fun logProcess(tag: String, cmd: List<String>, exitCode: Int, output: String) {
    if (!FILE_LOGGING_ENABLED) return
    val cmdLine = cmd.joinToString(" ")
    val tail = output.trim().takeLast(8000)
    val level = if (exitCode == 0) "I" else "E"
    write(
      level,
      tag,
      buildString {
        append("cmd=$cmdLine")
        append(" exit=$exitCode")
        if (tail.isNotBlank()) {
          append('\n')
          append(tail)
        }
      },
      null,
    )
  }

  private fun logSessionHeader() {
    val ctx = appContext ?: return
    val pm = ctx.packageManager
    val pkg = ctx.packageName
    val pkgInfo =
      try {
        pm.getPackageInfo(pkg, 0)
      } catch (_: Exception) {
        null
      }
    val abis = Build.SUPPORTED_ABIS.joinToString(",")
    log(
      "app-start",
      buildString {
        append("=== NRM session start ===")
        append(" version=${BuildConfig.VERSION_NAME}(${BuildConfig.VERSION_CODE})")
        append(" debug=${BuildConfig.DEBUG}")
        append(" sdk=${Build.VERSION.SDK_INT}")
        append(" device=${Build.MANUFACTURER} ${Build.MODEL}")
        append(" abi=$abis")
        if (pkgInfo != null) {
          append(" install=${pkgInfo.firstInstallTime}")
          append(" update=${pkgInfo.lastUpdateTime}")
        }
        append(" logPath=$displayPath")
      },
    )
  }

  private fun write(level: String, tag: String, message: String, throwable: Throwable?) {
    val ctx = appContext
    if (ctx == null) {
      Log.println(
        when (level) {
          "E" -> Log.ERROR
          "W" -> Log.WARN
          else -> Log.INFO
        },
        LOG_TAG,
        "[$tag] $message",
      )
      return
    }

    val ts = timestamp()
    val line =
      buildString {
        append(ts)
        append(' ')
        append(level)
        append(" [")
        append(tag)
        append("] ")
        append(message.replace('\r', ' '))
        if (throwable != null) {
          append('\n')
          append(throwable.stackTraceToString().replace('\r', ' '))
        }
      }

    when (level) {
      "E" -> Log.e(LOG_TAG, "[$tag] $message", throwable)
      "W" -> Log.w(LOG_TAG, "[$tag] $message", throwable)
      else -> Log.i(LOG_TAG, "[$tag] $message")
    }

    synchronized(lock) {
      try {
        if (!ensureLogSink(createIfMissing = true)) return
        rotateIfNeeded()
        appendLine(line)
      } catch (e: Exception) {
        Log.w(LOG_TAG, "file log write failed: ${e.message}")
      }
    }
  }

  private fun timestamp(): String {
    val fmt = SimpleDateFormat("yyyy-MM-dd HH:mm:ss.SSS", Locale.US)
    fmt.timeZone = TimeZone.getDefault()
    return fmt.format(Date())
  }

  private fun ensureLogSink(createIfMissing: Boolean): Boolean {
    if (mediaStoreUri != null || legacyLogFile?.parentFile?.exists() == true) {
      return true
    }
    if (!createIfMissing) return false

    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      mediaStoreUri = resolveOrCreateMediaStoreUri()
      mediaStoreUri != null
    } else {
      @Suppress("DEPRECATION")
      val dir =
        File(
          Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS),
          FOLDER,
        )
      if (!dir.exists() && !dir.mkdirs()) {
        Log.w(LOG_TAG, "legacy log dir create failed: ${dir.absolutePath}")
        return false
      }
      legacyLogFile = File(dir, LOG_FILE_NAME)
      displayPath = "${dir.absolutePath}/$LOG_FILE_NAME"
      true
    }
  }

  private fun resolveOrCreateMediaStoreUri(): Uri? {
    val ctx = appContext ?: return null
    val relativePath = "${Environment.DIRECTORY_DOWNLOADS}/$FOLDER"
    val collection = MediaStore.Downloads.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
    val projection = arrayOf(MediaStore.MediaColumns._ID)
    val selection =
      "${MediaStore.MediaColumns.DISPLAY_NAME} = ? AND ${MediaStore.MediaColumns.RELATIVE_PATH} LIKE ?"
    val args = arrayOf(LOG_FILE_NAME, "$relativePath%")

    ctx.contentResolver.query(collection, projection, selection, args, null)?.use { cursor ->
      if (cursor.moveToFirst()) {
        val id = cursor.getLong(cursor.getColumnIndexOrThrow(MediaStore.MediaColumns._ID))
        displayPath = "$relativePath/$LOG_FILE_NAME"
        return ContentUris.withAppendedId(collection, id)
      }
    }

    val values =
      ContentValues().apply {
        put(MediaStore.MediaColumns.DISPLAY_NAME, LOG_FILE_NAME)
        put(MediaStore.MediaColumns.MIME_TYPE, "text/plain")
        put(MediaStore.MediaColumns.RELATIVE_PATH, relativePath)
        put(MediaStore.MediaColumns.IS_PENDING, 0)
      }
    val uri = ctx.contentResolver.insert(collection, values)
    if (uri != null) {
      displayPath = "$relativePath/$LOG_FILE_NAME"
    }
    return uri
  }

  private fun appendLine(line: String) {
    val ctx = appContext ?: return
    val payload = (line + '\n').toByteArray(Charsets.UTF_8)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      val uri = mediaStoreUri ?: return
      ctx.contentResolver.openOutputStream(uri, "wa")?.use { it.write(payload) }
        ?: throw IOException("MediaStore append failed")
    } else {
      legacyLogFile?.appendBytes(payload) ?: throw IOException("legacy log file missing")
    }
  }

  private fun rotateIfNeeded() {
    val size =
      when {
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q -> mediaStoreSize()
        else -> legacyLogFile?.length() ?: 0L
      }
    if (size < MAX_BYTES) return

    val marker =
      "${timestamp()} I [app] === log rotated (size=$size) ===\n".toByteArray(Charsets.UTF_8)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      val ctx = appContext ?: return
      val uri = mediaStoreUri ?: return
      ctx.contentResolver.openOutputStream(uri, "w")?.use { it.write(marker) }
      mediaStoreUri = uri
    } else {
      legacyLogFile?.writeBytes(marker)
    }
  }

  private fun mediaStoreSize(): Long {
    val ctx = appContext ?: return 0L
    val uri = mediaStoreUri ?: return 0L
    return try {
      ctx.contentResolver.openFileDescriptor(uri, "r")?.use { it.statSize } ?: 0L
    } catch (_: Exception) {
      0L
    }
  }
}
