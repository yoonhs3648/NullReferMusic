package com.nullrefer.music.ondevice

import android.os.Build
import android.os.SystemClock
import java.io.File
import java.util.Locale
import java.util.regex.Pattern

/**
 * Whisper 성능 진단 빌드(1.5.13+) — 단계별 타이밍·whisper-cli stdout 파싱.
 * 로그 태그: whisper-perf (Download/NullReferenceMusic/logs/nrm-debug.log)
 */
object NrmWhisperPerfLog {
  const val TAG = "whisper-perf"
  const val ENABLED = true

  private val systemInfoRe =
      Pattern.compile(
          "system_info:.*n_threads\\s*=\\s*(\\d+).*",
          Pattern.CASE_INSENSITIVE,
      )
  private val neonRe = Pattern.compile("NEON\\s*=\\s*(\\d+)", Pattern.CASE_INSENSITIVE)
  private val armFmaRe = Pattern.compile("ARM_FMA\\s*=\\s*(\\d+)", Pattern.CASE_INSENSITIVE)
  private val fp16VaRe = Pattern.compile("FP16_VA\\s*=\\s*(\\d+)", Pattern.CASE_INSENSITIVE)
  private val rtfRe =
      Pattern.compile(
          "(?:rtf|real[\\s_-]*time[\\s_-]*factor)\\s*[=:]\\s*([0-9.]+)",
          Pattern.CASE_INSENSITIVE,
      )
  private val timingLineRe =
      Pattern.compile(
          "(load|encode|decode|total|prompt|sample)\\s+time\\s*=\\s*([0-9.]+)\\s*ms",
          Pattern.CASE_INSENSITIVE,
      )

  data class ParsedWhisperOutput(
      val systemInfoLine: String? = null,
      val nThreadsReported: Int? = null,
      val neon: Int? = null,
      val armFma: Int? = null,
      val fp16Va: Int? = null,
      val rtf: Double? = null,
      val timingMs: Map<String, Double> = emptyMap(),
      val noteworthyLines: List<String> = emptyList(),
  )

  class Session(private val label: String) {
    private val t0 = SystemClock.elapsedRealtime()
    private var lastMark = t0

    fun mark(phase: String, extra: String = "") {
      if (!ENABLED) return
      val now = SystemClock.elapsedRealtime()
      val delta = now - lastMark
      val total = now - t0
      lastMark = now
      val msg =
          buildString {
            append("phase=$phase")
            append(" phaseMs=$delta")
            append(" totalMs=$total")
            if (extra.isNotBlank()) append(' ').append(extra)
          }
      NrmFileLogger.log(TAG, msg)
    }

    fun end(extra: String = "") {
      if (!ENABLED) return
      val total = SystemClock.elapsedRealtime() - t0
      NrmFileLogger.log(TAG, "=== WHISPER_PERF_END label=$label totalMs=$total $extra ===")
    }
  }

  fun session(label: String): Session = Session(label)

  fun logDeviceSnapshot() {
    if (!ENABLED) return
    val rt = Runtime.getRuntime()
    val cores = Runtime.getRuntime().availableProcessors()
    NrmFileLogger.log(
        TAG,
        buildString {
          append("deviceSnapshot ")
          append("manufacturer=${Build.MANUFACTURER}")
          append(" model=${Build.MODEL}")
          append(" device=${Build.DEVICE}")
          append(" hardware=${Build.HARDWARE}")
          append(" abis=${Build.SUPPORTED_ABIS.joinToString(",")}")
          append(" sdk=${Build.VERSION.SDK_INT}")
          append(" cores=$cores")
          append(" heapMaxMb=${rt.maxMemory() / (1024 * 1024)}")
          append(" heapFreeMb=${rt.freeMemory() / (1024 * 1024)}")
        },
    )
  }

  fun logFileInfo(label: String, file: File) {
    if (!ENABLED) return
    val dur = if (file.extension.equals("wav", ignoreCase = true)) wavDurationSec(file) else null
    NrmFileLogger.log(
        TAG,
        buildString {
          append("$label path=${file.absolutePath}")
          append(" exists=${file.isFile}")
          append(" bytes=${file.length()}")
          if (dur != null) append(" audioDurationSec=${"%.2f".format(Locale.US, dur)}")
        },
    )
  }

  fun logThreadPlan(availableCores: Int, chosenThreads: Int, reason: String) {
    if (!ENABLED) return
    NrmFileLogger.log(
        TAG,
        "threadPlan availableCores=$availableCores chosenThreads=$chosenThreads reason=$reason",
    )
  }

  fun logPaths(cliPath: String, modelPath: String, libDir: String, ldLibraryPath: String?) {
    if (!ENABLED) return
    NrmFileLogger.log(
        TAG,
        buildString {
          append("paths cli=$cliPath")
          append(" model=$modelPath")
          append(" libDir=$libDir")
          append(" LD_LIBRARY_PATH=${ldLibraryPath ?: "(unset)"}")
          val cli = if (cliPath.isNotBlank()) File(cliPath) else null
          val model = if (modelPath.isNotBlank()) File(modelPath) else null
          if (cli?.isFile == true) append(" cliBytes=${cli.length()}")
          if (model?.isFile == true) append(" modelBytes=${model.length()}")
        },
    )
  }

  fun logStdoutLine(line: String) {
    if (!ENABLED) return
    val t = line.trim()
    if (t.isEmpty()) return
    NrmFileLogger.log(TAG, "stdout | $t")
  }

  fun parseAndSummarize(fullOutput: String): ParsedWhisperOutput {
    var systemInfo: String? = null
    var nThreads: Int? = null
    var neon: Int? = null
    var armFma: Int? = null
    var fp16Va: Int? = null
    var rtf: Double? = null
    val timings = linkedMapOf<String, Double>()
    val noteworthy = mutableListOf<String>()

    for (raw in fullOutput.lineSequence()) {
      val line = raw.trim()
      if (line.isEmpty()) continue
      val lower = line.lowercase(Locale.US)

      if (lower.contains("system_info")) {
        systemInfo = line
        systemInfoRe.matcher(line).let { m ->
          if (m.find()) nThreads = m.group(1)?.toIntOrNull()
        }
        neonRe.matcher(line).let { m -> if (m.find()) neon = m.group(1)?.toIntOrNull() }
        armFmaRe.matcher(line).let { m -> if (m.find()) armFma = m.group(1)?.toIntOrNull() }
        fp16VaRe.matcher(line).let { m -> if (m.find()) fp16Va = m.group(1)?.toIntOrNull() }
      }

      rtfRe.matcher(line).let { m ->
        if (m.find()) rtf = m.group(1)?.toDoubleOrNull()
      }

      timingLineRe.matcher(line).let { m ->
        if (m.find()) {
          val key = m.group(1)?.lowercase(Locale.US) ?: return@let
          val ms = m.group(2)?.toDoubleOrNull() ?: return@let
          timings[key] = ms
        }
      }

      if (
          lower.contains("whisper_") ||
              lower.contains("ggml_") ||
              lower.contains("error") ||
              lower.contains("warning") ||
              lower.contains("fallback") ||
              lower.contains("backend") ||
              lower.contains("openmp") ||
              lower.contains("neon") ||
              lower.contains("time =") ||
              lower.contains("rtf")
      ) {
        if (noteworthy.size < 80) noteworthy.add(line)
      }
    }

    return ParsedWhisperOutput(
        systemInfoLine = systemInfo,
        nThreadsReported = nThreads,
        neon = neon,
        armFma = armFma,
        fp16Va = fp16Va,
        rtf = rtf,
        timingMs = timings,
        noteworthyLines = noteworthy,
    )
  }

  fun logParsedSummary(parsed: ParsedWhisperOutput, wallMs: Long, wavDurationSec: Double?) {
    if (!ENABLED) return
    val impliedRtf =
        if (wavDurationSec != null && wavDurationSec > 0) {
          (wallMs / 1000.0) / wavDurationSec
        } else {
          null
        }
    NrmFileLogger.log(
        TAG,
        buildString {
          append("summary wallMs=$wallMs")
          if (wavDurationSec != null) {
            append(" wavDurationSec=${"%.2f".format(Locale.US, wavDurationSec)}")
          }
          if (impliedRtf != null) {
            append(" impliedRtf=${"%.3f".format(Locale.US, impliedRtf)}")
          }
          parsed.rtf?.let { append(" cliReportedRtf=${"%.3f".format(Locale.US, it)}") }
          parsed.nThreadsReported?.let { append(" cliThreads=$it") }
          parsed.neon?.let { append(" NEON=$it") }
          parsed.armFma?.let { append(" ARM_FMA=$it") }
          parsed.fp16Va?.let { append(" FP16_VA=$it") }
          if (parsed.timingMs.isNotEmpty()) {
            append(" timingsMs=")
            append(parsed.timingMs.entries.joinToString(",") { "${it.key}=${it.value}" })
          }
        },
    )
    parsed.systemInfoLine?.let { NrmFileLogger.log(TAG, "system_info | $it") }
    if (parsed.neon == 0) {
      NrmFileLogger.warn(TAG, "NEON=0 — ARM SIMD 비활성 가능성 (빌드/바이너리 점검)")
    }
    if (impliedRtf != null && impliedRtf > 5.0) {
      NrmFileLogger.warn(
          TAG,
          "impliedRtf=${"%.1f".format(Locale.US, impliedRtf)} — 실시간 대비 5배 초과 (성능 누수 의심)",
      )
    }
    for (line in parsed.noteworthyLines.takeLast(24)) {
      NrmFileLogger.log(TAG, "noteworthy | $line")
    }
  }

  /** pcm_s16le mono 16kHz */
  fun wavDurationSec(wav: File): Double? {
    if (!wav.isFile) return null
    val bytes = wav.length()
    if (bytes <= 44) return null
    return (bytes - 44).toDouble() / (16000.0 * 2.0)
  }

  /**
   * LRC 속도·발열 균형. 큐에 대기 곡이 있으면 스레드를 줄여 연속 전사 시 발열 스로틀을 완화한다.
   *
   * @param queueDepthAtStart enqueue 시점 depth (1=대기 없음, 2+=앞에 곡 있음)
   */
  fun resolveThreadCount(queueDepthAtStart: Int = 1): Int {
    val cores = Runtime.getRuntime().availableProcessors().coerceAtLeast(1)
    val backlog = (queueDepthAtStart - 1).coerceAtLeast(0)
    val chosen =
        when {
          backlog >= 2 -> 4.coerceAtMost(cores)
          backlog >= 1 -> 5.coerceAtMost(cores).coerceAtLeast(4)
          else -> cores.coerceIn(4, 6)
        }
    logThreadPlan(
        cores,
        chosen,
        "LRC speed queueDepth=$queueDepthAtStart backlog=$backlog + -bs 1 -bo 1",
    )
    return chosen
  }
}
