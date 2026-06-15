package com.nullrefer.music.ondevice

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.Build

/** Wi‑Fi·셀룰러·이더넷 등 인터넷 연결 상태 */
object NrmNetworkConnectivity {
  fun isInternetConnected(context: Context): Boolean {
    val cm =
        context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
            ?: return false
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      val network = cm.activeNetwork ?: return false
      val caps = cm.getNetworkCapabilities(network) ?: return false
      if (!caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)) return false
      return caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) ||
          caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) ||
          caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET)
    }
    @Suppress("DEPRECATION")
    val info = cm.activeNetworkInfo ?: return false
    @Suppress("DEPRECATION")
    return info.isConnected
  }

  /** 네트워크 복구 대기 (Wi‑Fi→데이터 전환 포함) */
  fun waitUntilConnected(
      context: Context,
      timeoutMs: Long,
      pollMs: Long = 1500L,
  ): Boolean {
    if (isInternetConnected(context)) return true
    val deadline = System.currentTimeMillis() + timeoutMs
    while (System.currentTimeMillis() < deadline) {
      Thread.sleep(pollMs)
      if (isInternetConnected(context)) return true
    }
    return isInternetConnected(context)
  }
}
