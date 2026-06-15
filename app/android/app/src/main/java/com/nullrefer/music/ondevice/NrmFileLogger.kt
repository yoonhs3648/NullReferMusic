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
 * 경로: Download/NullReferenceMusic/logs/nrm-debug-YYYY-MM-DD.log
 * (Android/data 아래가 아님)
 *
 * on/off — SharedPreferences `nrm_file_logging` / JS AsyncStorage 와 동기화. 기본 off.
 */
object NrmFileLogger {
  private const val PREFS_NAME = "nrm_file_logging"
  private const val KEY_ENABLED = "enabled"

  private const val LOG_TAG = "NrmFileLogger"
  private const val LOG_FILE_PREFIX = "nrm-debug-"
  private const val LOG_FILE_SUFFIX = ".log"
  private const val FOLDER = "NullReferenceMusic/logs"
  private const val FAILURE_PAD = "\n\n\n"

  @Volatile private var appContext: Context? = null
  @Volatile private var userLoggingEnabled: Boolean = false
  private val lock = Any()
  private var mediaStoreUri: Uri? = null
  private var legacyLogFile: File? = null
  private var activeLogDateKey: String? = null
  private var displayPath: String =
    "${Environment.DIRECTORY_DOWNLOADS}/$FOLDER/${LOG_FILE_PREFIX}YYYY-MM-DD$LOG_FILE_SUFFIX"

  fun init(context: Context) {
    if (appContext != null) return
    synchronized(lock) {
      if (appContext != null) return
      appContext = context.applicationContext
      // on/off는 JS AsyncStorage가 단일 소스 — bridge 동기화 전까지는 항상 off
      userLoggingEnabled = false
      updateDisplayPath()
    }
  }

  fun setUserLoggingEnabled(enabled: Boolean) {
    val ctx = appContext
    if (ctx != null) {
      ctx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
          .edit()
          .putBoolean(KEY_ENABLED, enabled)
          .apply()
    }
    synchronized(lock) {
      userLoggingEnabled = enabled
      if (!enabled) {
        mediaStoreUri = null
        legacyLogFile = null
        activeLogDateKey = null
        return
      }
      ensureLogSink(createIfMissing = true)
      logSessionHeader()
    }
  }

  fun isUserLoggingEnabled(): Boolean = userLoggingEnabled

  fun getDisplayPath(): String = if (userLoggingEnabled) displayPath else ""

  /** JS/레거시 — 파일 로깅 활성 여부 */
  fun isEnabled(): Boolean = userLoggingEnabled

  fun log(tag: String, message: String) {
    if (!userLoggingEnabled) return
    write("I", tag, message, null)
  }

  fun warn(tag: String, message: String) {
    if (!userLoggingEnabled) return
    write("W", tag, message, null)
  }

  fun error(tag: String, message: String, throwable: Throwable? = null) {
    if (!userLoggingEnabled) return
    write("E", tag, message, throwable)
  }

  fun logFailure(tag: String, title: String, detail: String, throwable: Throwable? = null) {
    if (!userLoggingEnabled) return
    val block =
        buildString {
          append(FAILURE_PAD)
          append("████████████████████████████████████████\n")
          append("██  FAILURE\n")
          append("██  ")
          append(title.replace('\n', ' '))
          append('\n')
          append("████████████████████████████████████████\n")
          append(detail)
          append('\n')
          append("████████████████████████████████████████")
          append(FAILURE_PAD)
        }
    write("E", tag, block, throwable)
  }

  fun logProcess(tag: String, cmd: List<String>, exitCode: Int, output: String) {
    if (!userLoggingEnabled) return
    val cmdLine = cmd.joinToString(" ")
    if (exitCode != 0) {
      logFailure(
          tag,
          "process exit=$exitCode",
          "cmd=$cmdLine\n${output.trim().takeLast(8000)}",
      )
      return
    }
    if (tag == "ffmpeg-probe" || tag == "ffmpeg-encoders") {
      log(tag, "cmd=$cmdLine exit=0")
      return
    }
    val tailLimit =
        when {
          tag == "whisper" || tag == NrmWhisperPerfLog.TAG -> 32_000
          else -> 8_000
        }
    val tail = output.trim().takeLast(tailLimit)
    write(
        "I",
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

  /** logs 폴더의 nrm-debug*.log 전부 삭제 */
  fun deleteAllLogFiles(): Int {
    val ctx = appContext ?: return 0
    var removed = 0
    synchronized(lock) {
      mediaStoreUri = null
      legacyLogFile = null
      activeLogDateKey = null
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        val relativePath = "${Environment.DIRECTORY_DOWNLOADS}/$FOLDER"
        val collection = MediaStore.Downloads.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
        val projection = arrayOf(MediaStore.MediaColumns._ID, MediaStore.MediaColumns.DISPLAY_NAME)
        val selection =
            "${MediaStore.MediaColumns.RELATIVE_PATH} LIKE ? AND ${MediaStore.MediaColumns.DISPLAY_NAME} LIKE ?"
        val args = arrayOf("$relativePath%", "${LOG_FILE_PREFIX}%")
        ctx.contentResolver.query(collection, projection, selection, args, null)?.use { cursor ->
          val idCol = cursor.getColumnIndexOrThrow(MediaStore.MediaColumns._ID)
          while (cursor.moveToNext()) {
            val id = cursor.getLong(idCol)
            val uri = ContentUris.withAppendedId(collection, id)
            if (ctx.contentResolver.delete(uri, null, null) > 0) removed++
          }
        }
      } else {
        @Suppress("DEPRECATION")
        val dir =
            File(
                Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS),
                FOLDER,
            )
        if (dir.isDirectory) {
          dir.listFiles()?.forEach { f ->
            if (f.isFile && f.name.startsWith(LOG_FILE_PREFIX) && f.name.endsWith(LOG_FILE_SUFFIX)) {
              if (f.delete()) removed++
            }
          }
        }
      }
    }
    log("file-log", "Deleted $removed log file(s)")
    return removed
  }

  private fun logSessionHeader() {
    if (!userLoggingEnabled) return
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

  private fun todayKey(): String {
    val fmt = SimpleDateFormat("yyyy-MM-dd", Locale.US)
    fmt.timeZone = TimeZone.getDefault()
    return fmt.format(Date())
  }

  private fun logFileNameForDate(dateKey: String): String =
      "$LOG_FILE_PREFIX$dateKey$LOG_FILE_SUFFIX"

  private fun updateDisplayPath() {
    displayPath =
        "${Environment.DIRECTORY_DOWNLOADS}/$FOLDER/${logFileNameForDate(todayKey())}"
  }

  private fun write(level: String, tag: String, message: String, throwable: Throwable?) {
    val ctx = appContext
    if (!userLoggingEnabled) return
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
    val dateKey = todayKey()
    if (activeLogDateKey != dateKey) {
      mediaStoreUri = null
      legacyLogFile = null
      activeLogDateKey = dateKey
      updateDisplayPath()
    }
    if (mediaStoreUri != null || legacyLogFile?.parentFile?.exists() == true) {
      return true
    }
    if (!createIfMissing) return false

    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      mediaStoreUri = resolveOrCreateMediaStoreUri(logFileNameForDate(dateKey))
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
      legacyLogFile = File(dir, logFileNameForDate(dateKey))
      displayPath = "${dir.absolutePath}/${logFileNameForDate(dateKey)}"
      true
    }
  }

  private fun resolveOrCreateMediaStoreUri(fileName: String): Uri? {
    val ctx = appContext ?: return null
    val relativePath = "${Environment.DIRECTORY_DOWNLOADS}/$FOLDER"
    val collection = MediaStore.Downloads.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
    val projection = arrayOf(MediaStore.MediaColumns._ID)
    val selection =
        "${MediaStore.MediaColumns.DISPLAY_NAME} = ? AND ${MediaStore.MediaColumns.RELATIVE_PATH} LIKE ?"
    val args = arrayOf(fileName, "$relativePath%")

    ctx.contentResolver.query(collection, projection, selection, args, null)?.use { cursor ->
      if (cursor.moveToFirst()) {
        val id = cursor.getLong(cursor.getColumnIndexOrThrow(MediaStore.MediaColumns._ID))
        displayPath = "$relativePath/$fileName"
        return ContentUris.withAppendedId(collection, id)
      }
    }

    val values =
        ContentValues().apply {
          put(MediaStore.MediaColumns.DISPLAY_NAME, fileName)
          put(MediaStore.MediaColumns.MIME_TYPE, "text/plain")
          put(MediaStore.MediaColumns.RELATIVE_PATH, relativePath)
          put(MediaStore.MediaColumns.IS_PENDING, 0)
        }
    val uri = ctx.contentResolver.insert(collection, values)
    if (uri != null) {
      displayPath = "$relativePath/$fileName"
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
}
