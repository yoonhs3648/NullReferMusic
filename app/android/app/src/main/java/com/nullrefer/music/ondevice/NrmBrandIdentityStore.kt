package com.nullrefer.music.ondevice

import android.content.Context
import com.nullrefer.music.NrmBrand

/**
 * APK 내장 브랜드(빌드 시점)를 최초 1회 저장하고, 이후 업데이트·재설치(데이터 유지)에도 동일 identity 유지.
 * GitHub Releases 공개 APK(do-custom=N)로 덮어써도 커스텀 SerialNo·관리자 여부가 바뀌지 않음.
 */
object NrmBrandIdentityStore {
  private const val PREFS_NAME = "nrm_brand_identity_v1"
  private const val KEY_SERIAL = "serial_no"
  private const val KEY_USER = "user_name"
  private const val KEY_DISPLAY = "display_name"
  private const val KEY_STORAGE = "storage_folder_name"
  private const val KEY_ADMIN_BUILD = "version_info_admin_build"

  data class Identity(
      val serialNo: String,
      val userName: String,
      val displayName: String,
      val storageFolderName: String,
      val versionInfoAdminBuild: Boolean,
  )

  @Synchronized
  fun getIdentity(context: Context): Identity {
    val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    if (prefs.contains(KEY_SERIAL)) {
      return Identity(
          serialNo = prefs.getString(KEY_SERIAL, "") ?: "",
          userName = prefs.getString(KEY_USER, "") ?: "",
          displayName = prefs.getString(KEY_DISPLAY, NrmBrand.DISPLAY_NAME) ?: NrmBrand.DISPLAY_NAME,
          storageFolderName =
              prefs.getString(KEY_STORAGE, NrmBrand.STORAGE_FOLDER_NAME)
                  ?: NrmBrand.STORAGE_FOLDER_NAME,
          versionInfoAdminBuild = prefs.getBoolean(KEY_ADMIN_BUILD, false),
      )
    }

    val baked = bakedIdentity()
    prefs
        .edit()
        .putString(KEY_SERIAL, baked.serialNo)
        .putString(KEY_USER, baked.userName)
        .putString(KEY_DISPLAY, baked.displayName)
        .putString(KEY_STORAGE, baked.storageFolderName)
        .putBoolean(KEY_ADMIN_BUILD, baked.versionInfoAdminBuild)
        .apply()
    return baked
  }

  @Synchronized
  fun overwriteIdentity(context: Context, identity: Identity) {
    context
        .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        .edit()
        .putString(KEY_SERIAL, identity.serialNo)
        .putString(KEY_USER, identity.userName)
        .putString(KEY_DISPLAY, identity.displayName)
        .putString(KEY_STORAGE, identity.storageFolderName)
        .putBoolean(KEY_ADMIN_BUILD, identity.versionInfoAdminBuild)
        .apply()
  }

  private fun bakedIdentity(): Identity =
      Identity(
          serialNo = NrmBrand.SERIAL_NO,
          userName = NrmBrand.USER_NAME,
          displayName = NrmBrand.DISPLAY_NAME,
          storageFolderName = NrmBrand.STORAGE_FOLDER_NAME,
          versionInfoAdminBuild = NrmBrand.VERSION_INFO_ADMIN_BUILD,
      )
}
