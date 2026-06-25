package com.nullrefer.music.ondevice

import android.content.ContentUris
import android.content.ContentValues
import android.content.Context
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.DocumentsContract
import android.provider.MediaStore
import android.util.Log
import com.nullrefer.music.BuildConfig
import com.nullrefer.music.NrmBrand
import java.io.File
import java.io.IOException
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * 사용자가 파일 관리자에서 바로 열 수 있는 경로에 디버그 로그를 기록합니다.
 *
 * 경로: Download/{@link NrmBrand#STORAGE_FOLDER_NAME}/logs/yyyy-MM-dd-NullReferenceMusicLog.txt
 * (Android/data 아래가 아님)
 *
 * on/off — JS AsyncStorage 단일 저장. 네이티브는 세션 메모리만 (기본 off).
 */
object NrmFileLogger {
  private const val LEGACY_PREFS_NAME = "nrm_file_logging"
  private const val LEGACY_KEY_ENABLED = "enabled"

  private const val LOG_TAG = "NrmFileLogger"
  private const val LOG_FILE_BASE = "NullReferenceMusicLog.txt"
  /** 레거시 파일 — 삭제·정리 시에만 참조 */
  private const val LEGACY_LOG_FILE_PREFIX = "nrm-debug-"
  private val folderRelPath = "${NrmBrand.STORAGE_FOLDER_NAME}/logs"
  private const val FAILURE_PAD = "\n\n\n"

  @Volatile private var appContext: Context? = null
  @Volatile private var userLoggingEnabled: Boolean = false
  private val lock = Any()
  private var mediaStoreUri: Uri? = null
  private var legacyLogFile: File? = null
  private var activeLogDate: String? = null
  private var displayPath: String = ""

  fun init(context: Context) {
    if (appContext != null) return
    synchronized(lock) {
      if (appContext != null) return
      appContext = context.applicationContext
      userLoggingEnabled = false
      clearLegacyLoggingPreference(context.applicationContext)
      displayPath = buildDisplayPath(todayLogFileName())
    }
  }

  /** 예전 네이티브 SharedPreferences 플래그 제거 — JS AsyncStorage만 사용 */
  fun clearLegacyLoggingPreference(context: Context) {
    try {
      context.getSharedPreferences(LEGACY_PREFS_NAME, Context.MODE_PRIVATE)
          .edit()
          .clear()
          .apply()
    } catch (_: Exception) {
      /* ignore */
    }
  }

  fun setUserLoggingEnabled(enabled: Boolean) {
    synchronized(lock) {
      userLoggingEnabled = enabled
      if (!enabled) {
        resetLogSink()
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

  /** logs 폴더 내 모든 로그 파일 삭제 (일별·레거시·중복 포함) */
  fun deleteAllLogFiles(): Int {
    val ctx = appContext ?: return 0
    var removed = 0
    synchronized(lock) {
      resetLogSink()
      val rows = listLogFolderFiles(ctx)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        for (row in rows) {
          try {
            val uri = Uri.parse(row.uri)
            if (ctx.contentResolver.delete(uri, null, null) > 0) {
              removed++
            }
          } catch (e: Exception) {
            Log.w(LOG_TAG, "MediaStore delete failed: ${row.name} ${e.message}")
          }
        }
      }
      @Suppress("DEPRECATION")
      val dir =
          File(
              Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS),
              folderRelPath,
          )
      if (dir.isDirectory) {
        dir.listFiles()?.forEach { f ->
          if (f.isFile && isLogFileName(f.name) && f.delete()) {
            removed++
          }
        }
      }
      resetLogSink()
    }
    return removed
  }

  private fun isLogFileName(name: String): Boolean {
    val n = name.trim()
    if (n.isEmpty()) return false
    return n.contains("NullReferenceMusicLog") || n.startsWith(LEGACY_LOG_FILE_PREFIX)
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

  private fun todayDateKey(): String {
    val fmt = SimpleDateFormat("yyyy-MM-dd", Locale.US)
    fmt.timeZone = TimeZone.getDefault()
    return fmt.format(Date())
  }

  private fun todayLogFileName(): String = "${todayDateKey()}-$LOG_FILE_BASE"

  private fun mediaStoreRelativePath(): String =
      "${Environment.DIRECTORY_DOWNLOADS}/$folderRelPath/"

  private fun buildDisplayPath(fileName: String): String = "${mediaStoreRelativePath()}$fileName"

  private fun resetLogSink() {
    mediaStoreUri = null
    legacyLogFile = null
    activeLogDate = null
  }

  private fun ensureLogSink(createIfMissing: Boolean): Boolean {
    val fileName = todayLogFileName()
    val dateKey = todayDateKey()
    if (activeLogDate != dateKey) {
      resetLogSink()
      activeLogDate = dateKey
      displayPath = buildDisplayPath(fileName)
    }

    if (mediaStoreUri != null) return true
    if (legacyLogFile?.isFile == true) return true

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      val existing = resolveExistingMediaStoreUri(fileName)
      if (existing != null) {
        mediaStoreUri = existing
        displayPath = buildDisplayPath(fileName)
        return true
      }
      if (!createIfMissing) return false
      mediaStoreUri = createMediaStoreUri(fileName)
      displayPath = buildDisplayPath(fileName)
      return mediaStoreUri != null
    }

    @Suppress("DEPRECATION")
    val dir =
        File(
            Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS),
            folderRelPath,
        )
    val file = File(dir, fileName)
    if (file.isFile) {
      legacyLogFile = file
      displayPath = file.absolutePath
      return true
    }
    if (!createIfMissing) return false
    if (!dir.exists() && !dir.mkdirs()) {
      Log.w(LOG_TAG, "legacy log dir create failed: ${dir.absolutePath}")
      return false
    }
    legacyLogFile = file
    displayPath = file.absolutePath
    return true
  }

  /** 동일 파일명이 여러 개면 가장 큰 SIZE 항목 하나만 사용 (중복 생성 방지) */
  private fun resolveExistingMediaStoreUri(fileName: String): Uri? {
    val ctx = appContext ?: return null
    val relativePath = mediaStoreRelativePath()
    val collection = MediaStore.Downloads.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
    val projection =
        arrayOf(MediaStore.MediaColumns._ID, MediaStore.MediaColumns.SIZE)
    val selection =
        "${MediaStore.MediaColumns.DISPLAY_NAME} = ? AND ${MediaStore.MediaColumns.RELATIVE_PATH} = ?"
    val args = arrayOf(fileName, relativePath)

    var bestId: Long? = null
    var bestSize = -1L
    ctx.contentResolver.query(collection, projection, selection, args, null)?.use { cursor ->
      val idCol = cursor.getColumnIndexOrThrow(MediaStore.MediaColumns._ID)
      val sizeCol = cursor.getColumnIndexOrThrow(MediaStore.MediaColumns.SIZE)
      while (cursor.moveToNext()) {
        val size = cursor.getLong(sizeCol).coerceAtLeast(0L)
        if (size >= bestSize) {
          bestSize = size
          bestId = cursor.getLong(idCol)
        }
      }
    }
    if (bestId == null) return null
    return ContentUris.withAppendedId(collection, bestId!!)
  }

  private fun createMediaStoreUri(fileName: String): Uri? {
    val ctx = appContext ?: return null
    val relativePath = mediaStoreRelativePath()
    val collection = MediaStore.Downloads.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
    val values =
        ContentValues().apply {
          put(MediaStore.MediaColumns.DISPLAY_NAME, fileName)
          put(MediaStore.MediaColumns.MIME_TYPE, "text/plain")
          put(MediaStore.MediaColumns.RELATIVE_PATH, relativePath)
          put(MediaStore.MediaColumns.IS_PENDING, 0)
        }
    return ctx.contentResolver.insert(collection, values)
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

  data class FolderFileRow(val name: String, val uri: String, val sizeBytes: Long)

  /** 문의 첨부 — Download/{brand}/logs 폴더 파일 목록 */
  fun listLogFolderFiles(context: Context): List<FolderFileRow> {
    init(context)
    val out = mutableListOf<FolderFileRow>()
    val relativePath = mediaStoreRelativePath()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      val collection = MediaStore.Downloads.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
      val projection =
          arrayOf(
              MediaStore.MediaColumns._ID,
              MediaStore.MediaColumns.DISPLAY_NAME,
              MediaStore.MediaColumns.SIZE,
          )
      val selection = "${MediaStore.MediaColumns.RELATIVE_PATH} LIKE ?"
      val args = arrayOf("$relativePath%")
      context.contentResolver.query(collection, projection, selection, args, null)?.use { cursor ->
        val idCol = cursor.getColumnIndexOrThrow(MediaStore.MediaColumns._ID)
        val nameCol = cursor.getColumnIndexOrThrow(MediaStore.MediaColumns.DISPLAY_NAME)
        val sizeCol = cursor.getColumnIndexOrThrow(MediaStore.MediaColumns.SIZE)
        while (cursor.moveToNext()) {
          val id = cursor.getLong(idCol)
          val name = cursor.getString(nameCol) ?: continue
          val size = cursor.getLong(sizeCol).coerceAtLeast(0L)
          val uri = ContentUris.withAppendedId(collection, id).toString()
          out.add(FolderFileRow(name, uri, size))
        }
      }
    } else {
      @Suppress("DEPRECATION")
      val dir =
          File(
              Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS),
              folderRelPath,
          )
      if (dir.isDirectory) {
        dir.listFiles()?.forEach { f ->
          if (f.isFile) {
            out.add(FolderFileRow(f.name, Uri.fromFile(f).toString(), f.length()))
          }
        }
      }
    }
    return out.sortedByDescending { it.name }
  }

  fun queryDisplayName(context: Context, uri: Uri): String? {
    context.contentResolver.query(uri, arrayOf(MediaStore.MediaColumns.DISPLAY_NAME), null, null, null)
        ?.use { cursor ->
          if (cursor.moveToFirst()) {
            val col = cursor.getColumnIndex(MediaStore.MediaColumns.DISPLAY_NAME)
            if (col >= 0) return cursor.getString(col)
          }
        }
    return uri.lastPathSegment
  }

  fun querySizeBytes(context: Context, uri: Uri): Long {
    context.contentResolver.query(uri, arrayOf(MediaStore.MediaColumns.SIZE), null, null, null)?.use {
        cursor ->
      if (cursor.moveToFirst()) {
        val col = cursor.getColumnIndex(MediaStore.MediaColumns.SIZE)
        if (col >= 0) return cursor.getLong(col).coerceAtLeast(0L)
      }
    }
    return 0L
  }

  fun readUriAsBase64(context: Context, uriString: String): String {
    val uri = Uri.parse(uriString)
    val bytes =
        context.contentResolver.openInputStream(uri)?.use { it.readBytes() }
            ?: throw IOException("cannot open attachment")
    return android.util.Base64.encodeToString(bytes, android.util.Base64.NO_WRAP)
  }

  /** 문의 첨부 파일 선택기 — logs 폴더를 초기 경로로 */
  fun buildLogFolderDocumentUri(): Uri {
    val documentId = "primary:${Environment.DIRECTORY_DOWNLOADS}/$folderRelPath"
    return DocumentsContract.buildDocumentUri(
        "com.android.externalstorage.documents",
        documentId,
    )
  }
}
