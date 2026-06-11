package com.nullrefer.music.ondevice

import android.content.Context
import java.io.File
import java.io.FileOutputStream

/** libshine shineenc CLI — APK assets, LGPL MP3 인코더 (ffmpeg libshine 미포함 시 mp3 변환용). */
object ShineBootstrap {
  private const val MIN_CLI_BYTES = 10_000L
  /** assets shineenc 교체 시 증가 — code_cache 구버전(정적 ET_EXEC) 무효화 */
  private const val ASSET_GENERATION = 2

  @Volatile private var sessionCli: File? = null

  fun ensure(context: Context): File? {
    sessionCli?.let { cached ->
      if (cached.isFile && cached.length() >= MIN_CLI_BYTES && ShineExec.probeIfNeeded(cached)) {
        return cached
      }
    }

    val dir = NrmExecutableFile.execBaseDir(context, "shine")
    val cli = File(dir, "shineenc")
    val genMarker = File(dir, ".shine-asset-gen")

    val cachedGen = runCatching { genMarker.readText().trim() }.getOrDefault("")
    if (cachedGen != ASSET_GENERATION.toString()) {
      NrmFileLogger.log("shine", "asset generation 변경 ($cachedGen -> $ASSET_GENERATION) — 재복사")
      cli.delete()
      File(dir, "${cli.name}.use-linker").delete()
      genMarker.writeText(ASSET_GENERATION.toString())
    }

    if (!cli.isFile || cli.length() < MIN_CLI_BYTES || !ShineExec.probeIfNeeded(cli)) {
      NrmFileLogger.log("shine", "CLI asset 복사 시도")
      cli.delete()
      File(dir, "${cli.name}.use-linker").delete()
      NrmExecutableFile.prepareWritable(cli)
      if (!copyAssetIfPresent(context, "shine/shineenc", cli)) {
        NrmFileLogger.warn("shine", "shineenc asset 없음")
        return null
      }
    }

    if (!cli.isFile || cli.length() < MIN_CLI_BYTES) {
      NrmFileLogger.warn("shine", "shineenc 크기 이상 bytes=${cli.length()}")
      return null
    }

    NrmExecutableFile.prepareForExecution(cli)
    if (!NrmExecutableFile.isExecReady(cli)) {
      NrmExecutableFile.mirrorToExecCache(context, cli, "shine-exec")?.let { mirrored ->
        NrmExecutableFile.ensureExecMode(mirrored, NrmExecutableFile.PROBE_HELP)
        if (ShineExec.probeIfNeeded(mirrored)) {
          NrmFileLogger.log("shine", "codeCache CLI OK path=${mirrored.absolutePath}")
          return mirrored
        }
        mirrored.delete()
        File(mirrored.parentFile, "${mirrored.name}.use-linker").delete()
      }
    }

    NrmExecutableFile.ensureExecMode(cli, NrmExecutableFile.PROBE_HELP)
    if (!ShineExec.probe(cli)) {
      NrmFileLogger.warn("shine", "shineenc 프로브 실패 — asset 재복사")
      cli.delete()
      File(dir, "${cli.name}.use-linker").delete()
      NrmExecutableFile.prepareWritable(cli)
      if (!copyAssetIfPresent(context, "shine/shineenc", cli)) return null
      NrmExecutableFile.ensureExecMode(cli, NrmExecutableFile.PROBE_HELP)
      if (!ShineExec.probe(cli)) {
        NrmFileLogger.warn("shine", "shineenc 프로브 재시도 실패")
        return null
      }
    }

    NrmFileLogger.log("shine", "CLI OK path=${cli.absolutePath} bytes=${cli.length()}")
    sessionCli = cli
    return cli
  }

  private fun copyAssetIfPresent(context: Context, assetName: String, dest: File): Boolean {
    return try {
      context.assets.open(assetName).use { input ->
        dest.parentFile?.mkdirs()
        FileOutputStream(dest).use { output -> input.copyTo(output) }
      }
      dest.isFile && dest.length() >= MIN_CLI_BYTES
    } catch (e: Exception) {
      NrmFileLogger.warn("shine", "asset 복사 실패: ${e.message}")
      false
    }
  }
}
