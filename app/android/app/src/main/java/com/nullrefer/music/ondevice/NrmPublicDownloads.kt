package com.nullrefer.music.ondevice

import android.content.ContentUris
import android.content.ContentValues
import android.content.Context
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import com.nullrefer.music.NrmBrand
import java.io.File
import java.io.IOException

/** Download/{@link NrmBrand#STORAGE_FOLDER_NAME}/downloads/ — 앱 생성 파일(첨부 등) 저장 */
object NrmPublicDownloads {
  private val folderRelPath = "${NrmBrand.STORAGE_FOLDER_NAME}/downloads"

  fun displayFolderPath(): String = "Download/$folderRelPath/"

  fun saveLocalFile(
      context: Context,
      sourcePath: String,
      displayName: String,
      mimeType: String,
  ): String {
    val src = File(sourcePath.removePrefix("file://"))
    if (!src.isFile) throw IOException("소스 파일이 없습니다.")
    val safeName = displayName.trim().ifBlank { src.name }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      val relativePath = "${Environment.DIRECTORY_DOWNLOADS}/$folderRelPath/"
      val collection = MediaStore.Downloads.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
      val uri =
          resolveExistingUri(context, safeName, relativePath, collection)
              ?: createMediaStoreUri(context, safeName, mimeType, relativePath, collection)
      context.contentResolver.openOutputStream(uri, "wt")?.use { out ->
        src.inputStream().use { input -> input.copyTo(out) }
      } ?: throw IOException("MediaStore 쓰기 실패")
      return "${displayFolderPath()}$safeName"
    }

    @Suppress("DEPRECATION")
    val dir =
        File(
            Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS),
            folderRelPath,
        )
    if (!dir.exists() && !dir.mkdirs()) {
      throw IOException("다운로드 폴더를 만들지 못했습니다.")
    }
    val dest = File(dir, safeName)
    src.inputStream().use { input ->
      dest.outputStream().use { out -> input.copyTo(out) }
    }
    return "${displayFolderPath()}$safeName"
  }

  private fun resolveExistingUri(
      context: Context,
      fileName: String,
      relativePath: String,
      collection: Uri,
  ): Uri? {
    val projection = arrayOf(MediaStore.MediaColumns._ID)
    val selection =
        "${MediaStore.MediaColumns.DISPLAY_NAME} = ? AND ${MediaStore.MediaColumns.RELATIVE_PATH} = ?"
    val args = arrayOf(fileName, relativePath)
    context.contentResolver.query(collection, projection, selection, args, null)?.use { cursor ->
      if (cursor.moveToFirst()) {
        val idCol = cursor.getColumnIndexOrThrow(MediaStore.MediaColumns._ID)
        val id = cursor.getLong(idCol)
        return ContentUris.withAppendedId(collection, id)
      }
    }
    return null
  }

  private fun createMediaStoreUri(
      context: Context,
      fileName: String,
      mimeType: String,
      relativePath: String,
      collection: Uri,
  ): Uri {
    val values =
        ContentValues().apply {
          put(MediaStore.MediaColumns.DISPLAY_NAME, fileName)
          put(MediaStore.MediaColumns.MIME_TYPE, mimeType.ifBlank { "application/octet-stream" })
          put(MediaStore.MediaColumns.RELATIVE_PATH, relativePath)
          put(MediaStore.MediaColumns.IS_PENDING, 0)
        }
    return context.contentResolver.insert(collection, values)
        ?: throw IOException("MediaStore 파일을 만들지 못했습니다.")
  }
}
