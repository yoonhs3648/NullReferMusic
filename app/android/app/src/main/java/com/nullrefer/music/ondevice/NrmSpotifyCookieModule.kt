package com.nullrefer.music.ondevice

import android.os.Handler
import android.os.Looper
import android.webkit.CookieManager
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/** WebView(sharedCookiesEnabled) 로그인 후 시스템 CookieManager에서 sp_dc 추출 */
class NrmSpotifyCookieModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "NrmSpotifyCookie"

  private fun parseSpDc(raw: String?): String? {
    if (raw.isNullOrBlank()) return null
    for (part in raw.split(";")) {
      val trimmed = part.trim()
      val eq = trimmed.indexOf('=')
      if (eq <= 0) continue
      if (trimmed.substring(0, eq).trim() == "sp_dc") {
        val value = trimmed.substring(eq + 1).trim()
        if (value.isNotEmpty()) return value
      }
    }
    return null
  }

  private fun readSpDcSync(): String? {
    val cookieManager = CookieManager.getInstance()
    cookieManager.flush()
    val urls =
        listOf(
            "https://open.spotify.com",
            "https://accounts.spotify.com",
            "https://www.spotify.com",
        )
    for (url in urls) {
      val found = parseSpDc(cookieManager.getCookie(url))
      if (found != null) return found
    }
    return null
  }

  @ReactMethod
  fun getSpDcCookie(promise: Promise) {
    val run = Runnable {
      try {
        promise.resolve(readSpDcSync())
      } catch (e: Exception) {
        promise.reject("spotify_cookie_error", e.message, e)
      }
    }
    if (Looper.myLooper() == Looper.getMainLooper()) {
      run.run()
    } else {
      Handler(Looper.getMainLooper()).post(run)
    }
  }
}
