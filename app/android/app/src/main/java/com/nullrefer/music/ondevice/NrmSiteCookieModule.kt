package com.nullrefer.music.ondevice

import android.os.Build
import android.os.Handler
import android.os.Looper
import android.webkit.CookieManager
import android.webkit.WebStorage
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/** Last.fm · DeepL 브라우저/WebView 로그인 쿠키 조회·삭제 */
class NrmSiteCookieModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "NrmSiteCookie"

  companion object {
    private const val COOKIE_EXPIRY = "Thu, 01 Jan 1970 00:00:00 GMT"

    private val LASTFM_URLS =
        listOf(
            "https://www.last.fm",
            "https://last.fm",
            "https://www.last.fm/api",
            "https://secure.last.fm",
        )

    private val LASTFM_ORIGINS =
        listOf(
            "https://www.last.fm",
            "https://last.fm",
            "https://secure.last.fm",
        )

    private val LASTFM_KNOWN_COOKIE_NAMES =
        listOf(
            "sessionid",
            "lfm_session",
            "csrftoken",
            "spm",
            "XuI",
        )

    private val DEEPL_URLS =
        listOf(
            "https://www.deepl.com",
            "https://deepl.com",
            "https://www.deepl.com/account",
            "https://account.deepl.com",
        )

    private val DEEPL_ORIGINS =
        listOf(
            "https://www.deepl.com",
            "https://deepl.com",
            "https://account.deepl.com",
        )

    private val DEEPL_KNOWN_COOKIE_NAMES =
        listOf(
            "dl_session",
            "LMT_bk",
            "releaseGroupsEnabled",
            "il",
            "userPreferredLocales",
            "privacySettings",
        )
  }

  private fun runOnMain(run: () -> Unit) {
    if (Looper.myLooper() == Looper.getMainLooper()) {
      run()
    } else {
      Handler(Looper.getMainLooper()).post(run)
    }
  }

  private fun expireCookie(cookieManager: CookieManager, url: String, name: String) {
    val domain = run {
      val host = url.removePrefix("https://").removePrefix("http://").substringBefore('/')
      when {
        host.startsWith("www.") -> host.removePrefix("www.")
        else -> host
      }
    }
    val variants =
        listOf(
            "$name=; Max-Age=0; Expires=$COOKIE_EXPIRY; Path=/",
            "$name=; Max-Age=0; Expires=$COOKIE_EXPIRY; Path=/; Secure",
            "$name=; Max-Age=0; Expires=$COOKIE_EXPIRY; Path=/; Secure; HttpOnly",
            "$name=; Max-Age=0; Expires=$COOKIE_EXPIRY; Domain=.$domain; Path=/",
            "$name=; Max-Age=0; Expires=$COOKIE_EXPIRY; Domain=$domain; Path=/",
        )
    for (variant in variants) {
      cookieManager.setCookie(url, variant)
    }
  }

  private fun collectCookieNames(
      cookieManager: CookieManager,
      urls: List<String>,
      knownNames: List<String>,
  ): Set<String> {
    val names = knownNames.toMutableSet()
    for (url in urls) {
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

  private fun clearWebStorageForOrigins(origins: List<String>) {
    val storage = WebStorage.getInstance()
    for (origin in origins) {
      storage.deleteOrigin(origin)
    }
  }

  private fun hasCookiesForUrls(urls: List<String>): Boolean {
    val cookieManager = CookieManager.getInstance()
    cookieManager.flush()
    for (url in urls) {
      val raw = cookieManager.getCookie(url)?.trim()
      if (!raw.isNullOrEmpty()) return true
    }
    return false
  }

  private fun clearCookiesForSite(
      logTag: String,
      urls: List<String>,
      origins: List<String>,
      knownNames: List<String>,
  ) {
    val cookieManager = CookieManager.getInstance()
    cookieManager.setAcceptCookie(true)
    cookieManager.flush()

    val names = collectCookieNames(cookieManager, urls, knownNames)
    for (url in urls) {
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

    clearWebStorageForOrigins(origins)
    cookieManager.flush()

    val cookiesAfter = hasCookiesForUrls(urls)
    NrmFileLogger.log(
        logTag,
        "cleared names=${names.joinToString()} cookies_remaining=$cookiesAfter",
    )
  }

  @ReactMethod
  fun hasLastfmLoginCookies(promise: Promise) {
    runOnMain {
      try {
        promise.resolve(hasCookiesForUrls(LASTFM_URLS))
      } catch (e: Exception) {
        promise.reject("lastfm_cookie_probe_error", e.message, e)
      }
    }
  }

  @ReactMethod
  fun clearLastfmLoginCookies(promise: Promise) {
    runOnMain {
      try {
        clearCookiesForSite(
            "lastfm-cookie",
            LASTFM_URLS,
            LASTFM_ORIGINS,
            LASTFM_KNOWN_COOKIE_NAMES,
        )
        promise.resolve(true)
      } catch (e: Exception) {
        promise.reject("lastfm_cookie_clear_error", e.message, e)
      }
    }
  }

  @ReactMethod
  fun hasDeepLLoginCookies(promise: Promise) {
    runOnMain {
      try {
        promise.resolve(hasCookiesForUrls(DEEPL_URLS))
      } catch (e: Exception) {
        promise.reject("deepl_cookie_probe_error", e.message, e)
      }
    }
  }

  @ReactMethod
  fun clearDeepLLoginCookies(promise: Promise) {
    runOnMain {
      try {
        clearCookiesForSite(
            "deepl-cookie",
            DEEPL_URLS,
            DEEPL_ORIGINS,
            DEEPL_KNOWN_COOKIE_NAMES,
        )
        promise.resolve(true)
      } catch (e: Exception) {
        promise.reject("deepl_cookie_clear_error", e.message, e)
      }
    }
  }
}
