package com.nullrefer.music.ondevice

import android.content.Context
import android.os.Build
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/**
 * yt-dlp 독립 실행 바이너리를 앱 내부 저장소에 다운로드하고 관리합니다.
 *
 * Python 런타임 없이 직접 실행 가능한 바이너리를 사용하므로
 * Chaquopy 같은 추가 Gradle 플러그인이 전혀 필요 없습니다.
 *
 * 업데이트: GitHub Releases의 `latest` URL을 사용하므로
 * 앱 업데이트 없이도 자동으로 최신 버전을 사용합니다.
 */
object YtDlpBootstrap {
    private const val MIN_BYTES = 10_000_000L // yt-dlp 바이너리 ~30-50MB

    private fun ytDlpSlugForAbi(): String {
        val abi = Build.SUPPORTED_ABIS.firstOrNull().orEmpty()
        return when {
            abi.startsWith("arm64") -> "linux_aarch64"
            abi.startsWith("armeabi") -> "linux_armv7l"
            abi == "x86_64" -> "linux_x86_64"
            else -> "linux_aarch64"
        }
    }

    /**
     * yt-dlp 바이너리가 없거나 손상됐으면 GitHub에서 다운로드합니다.
     * @return yt-dlp 바이너리의 절대 경로
     */
    fun ensure(context: Context): String {
        val binDir = File(context.filesDir, "ytdlp")
        val bin = File(binDir, "yt-dlp")

        if (bin.exists() && bin.length() > MIN_BYTES) {
            makeExecutable(bin)
            return bin.absolutePath
        }

        binDir.mkdirs()
        if (bin.exists()) bin.delete()

        val slug = ytDlpSlugForAbi()
        val urlStr = "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_$slug"

        val conn = (URL(urlStr).openConnection() as HttpURLConnection).apply {
            connectTimeout = 120_000
            readTimeout = 900_000
            instanceFollowRedirects = true
        }
        conn.connect()
        if (conn.responseCode !in 200..299) {
            throw Exception("yt-dlp 다운로드 실패: HTTP ${conn.responseCode}")
        }

        conn.inputStream.use { input ->
            bin.outputStream().use { output ->
                input.copyTo(output)
            }
        }

        if (!bin.exists() || bin.length() < MIN_BYTES) {
            throw Exception("yt-dlp 바이너리를 다운로드하지 못했습니다.")
        }
        makeExecutable(bin)
        return bin.absolutePath
    }

    /**
     * 바이너리 실행 권한을 설정합니다.
     * setExecutable 외에 chmod 명령으로 한 번 더 설정해
     * 일부 Android 기기의 SELinux/W^X 정책을 우회합니다.
     */
    private fun makeExecutable(file: File) {
        file.setReadable(true, false)
        file.setExecutable(true, false)
        try {
            ProcessBuilder(listOf("chmod", "755", file.absolutePath))
                .redirectErrorStream(true)
                .start()
                .waitFor()
        } catch (_: Exception) {}
    }
}
