package com.nullrefer.music.ondevice



import android.os.Build

import android.os.Handler

import android.os.Looper

import android.webkit.CookieManager

import android.webkit.WebSettings

import android.webkit.WebStorage

import com.facebook.react.bridge.Promise

import com.facebook.react.bridge.ReactApplicationContext

import com.facebook.react.bridge.ReactContextBaseJavaModule

import com.facebook.react.bridge.ReactMethod



/** WebView(sharedCookiesEnabled) 로그인 후 시스템 CookieManager에서 sp_dc 추출 */

class NrmSpotifyCookieModule(reactContext: ReactApplicationContext) :

  ReactContextBaseJavaModule(reactContext) {



  override fun getName(): String = "NrmSpotifyCookie"



  companion object {

    private const val COOKIE_EXPIRY = "Thu, 01 Jan 1970 00:00:00 GMT"



    private val SPOTIFY_URLS =

        listOf(

            "https://accounts.spotify.com",

            "https://open.spotify.com",

            "https://www.spotify.com",

            "https://charts.spotify.com",

            "https://spotify.com",

        )



    private val SPOTIFY_ORIGINS =

        listOf(

            "https://accounts.spotify.com",

            "https://charts.spotify.com",

            "https://open.spotify.com",

            "https://www.spotify.com",

        )



    private val KNOWN_COOKIE_NAMES =

        listOf(

            "sp_dc",

            "sp_key",

            "sp_t",

            "sp_landing",

            "sp_m",

            "sp_adid",

            "__Host-sp_csrf_sid",

            "sp_sso_csrf_token",

            "csrf_token",

        )

  }



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

    for (url in SPOTIFY_URLS) {

      val found = parseSpDc(cookieManager.getCookie(url))

      if (found != null) return found

    }

    return null

  }



  private fun expireCookie(cookieManager: CookieManager, url: String, name: String) {

    val variants =

        listOf(

            "$name=; Max-Age=0; Expires=$COOKIE_EXPIRY; Path=/",

            "$name=; Max-Age=0; Expires=$COOKIE_EXPIRY; Path=/; Secure",

            "$name=; Max-Age=0; Expires=$COOKIE_EXPIRY; Path=/; Secure; HttpOnly",

            "$name=; Max-Age=0; Expires=$COOKIE_EXPIRY; Domain=.spotify.com; Path=/",

            "$name=; Max-Age=0; Expires=$COOKIE_EXPIRY; Domain=spotify.com; Path=/",

            "$name=; Max-Age=0; Expires=$COOKIE_EXPIRY; Domain=.accounts.spotify.com; Path=/",

        )

    for (variant in variants) {

      cookieManager.setCookie(url, variant)

    }

  }



  private fun collectSpotifyCookieNames(cookieManager: CookieManager): Set<String> {

    val names = KNOWN_COOKIE_NAMES.toMutableSet()

    for (url in SPOTIFY_URLS) {

      val raw = cookieManager.getCookie(url) ?: continue

      for (part in raw.split(";")) {

        val trimmed = part.trim()

        val eq = trimmed.indexOf('=')

        if (eq > 0) {

          val cookieName = trimmed.substring(0, eq).trim()

          if (cookieName.isNotEmpty()) names.add(cookieName)

        }

      }

    }

    return names

  }



  private fun clearSpotifyWebStorage() {

    val storage = WebStorage.getInstance()

    for (origin in SPOTIFY_ORIGINS) {

      storage.deleteOrigin(origin)

    }

  }



  private fun clearSpotifyCookiesSync() {

    val cookieManager = CookieManager.getInstance()

    cookieManager.setAcceptCookie(true)

    cookieManager.flush()



    val names = collectSpotifyCookieNames(cookieManager)

    for (url in SPOTIFY_URLS) {

      for (name in names) {

        expireCookie(cookieManager, url, name)

      }

      cookieManager.setCookie(url, "")

    }



    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {

      cookieManager.removeSessionCookies(null)

    } else {

      @Suppress("DEPRECATION")

      cookieManager.removeSessionCookie()

    }



    clearSpotifyWebStorage()

    cookieManager.flush()



    val spDcAfter = readSpDcSync()

    NrmFileLogger.log(

        "spotify-cookie",

        "cleared names=${names.joinToString()} sp_dc_after=${spDcAfter ?: "(none)"}",

    )

  }



  @ReactMethod

  fun getWebViewUserAgent(promise: Promise) {

    try {

      val raw = WebSettings.getDefaultUserAgent(reactApplicationContext)

      promise.resolve(raw.replace("; wv)", ")"))

    } catch (e: Exception) {

      promise.reject("spotify_ua_error", e.message, e)

    }

  }



  /** Charts WebView 로그인 세션 제거 — 다음 로그인 시 로그인 페이지부터 */

  @ReactMethod

  fun clearSpotifyLoginCookies(promise: Promise) {

    val run = Runnable {

      try {

        clearSpotifyCookiesSync()

        promise.resolve(true)

      } catch (e: Exception) {

        promise.reject("spotify_cookie_clear_error", e.message, e)

      }

    }

    if (Looper.myLooper() == Looper.getMainLooper()) {

      run.run()

    } else {

      Handler(Looper.getMainLooper()).post(run)

    }

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

