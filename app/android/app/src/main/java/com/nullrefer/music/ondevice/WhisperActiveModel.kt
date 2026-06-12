package com.nullrefer.music.ondevice

import java.io.File

/**
 * 큐에 적재된 작업이 실행 시점에 최신 모델 설정을 반영할 수 있도록 하는 공유 상태.
 *
 * - [NrmWhisperModule.transcribeToLrc] 호출 시 자동 갱신
 * - JS [NrmWhisperModule.updateModelPreference] 호출 시 명시적 갱신
 * - 실행 대기 중인 작업은 이 값을 우선 사용하고, 없으면 제출 시점 값을 사용한다
 *
 * 모델 재로드 최소화:
 * 연속 전사 사이 쿨다운 기간에 OS 페이지 캐시를 백그라운드로 사전 적재.
 * whisper-cli는 매번 새 프로세스이므로, 모델 파일이 페이지 캐시에 남아 있으면
 * 다음 로드 시간이 디스크 I/O 없이 크게 단축된다(2,500ms → ~100ms 수준).
 */
object WhisperActiveModel {
    private const val WARMUP_BUF_BYTES = 256 * 1024

    @Volatile private var _preference: String? = null
    @Volatile private var warmupThread: Thread? = null
    @Volatile private var warmupModelPath: String? = null

    /** JS/Kotlin 양쪽에서 현재 사용 모델 설정 갱신 */
    fun setPreference(pref: String?) {
        val p = pref?.trim() ?: return
        if (p.isBlank()) return
        if (_preference != p) {
            // 모델이 바뀌면 현재 웜업을 취소
            if (warmupModelPath != null) cancelWarmup()
            _preference = p
        }
    }

    fun getPreference(): String? = _preference

    /**
     * 다음 작업이 동일 모델을 사용할 가능성이 높을 때 OS 페이지 캐시를 사전 적재.
     * 쿨다운 기간(3초) 동안 백그라운드 최저 우선도로 실행한다.
     *
     * @param modelPath 방금 처리했거나 곧 처리할 모델 파일 경로
     */
    fun scheduleWarmup(modelPath: String) {
        if (modelPath.isBlank()) return

        // 이미 같은 경로를 웜업 중이면 중복 실행 안 함
        if (warmupModelPath == modelPath && warmupThread?.isAlive == true) return

        warmupThread?.interrupt()

        val file = File(modelPath)
        if (!file.isFile || file.length() < 1_000_000L) return

        warmupModelPath = modelPath
        val t =
            Thread(
                {
                    try {
                        file.inputStream().buffered(WARMUP_BUF_BYTES).use { stream ->
                            val buf = ByteArray(WARMUP_BUF_BYTES)
                            while (!Thread.currentThread().isInterrupted && stream.read(buf) != -1) {
                                /* 읽기만으로 OS 페이지 캐시에 적재됨 */
                            }
                        }
                        if (NrmWhisperPerfLog.ENABLED) {
                            NrmFileLogger.log(
                                NrmWhisperPerfLog.TAG,
                                "model warmup done path=$modelPath bytes=${file.length()}",
                            )
                        }
                    } catch (_: InterruptedException) {
                        /* cancelled — 모델 변경 또는 앱 종료 */
                    } catch (e: Exception) {
                        NrmFileLogger.log("whisper-model", "warmup error: ${e.message}")
                    }
                },
                "nrm-whisper-warmup",
            )
        t.isDaemon = true
        t.priority = Thread.MIN_PRIORITY
        t.start()
        warmupThread = t
    }

    private fun cancelWarmup() {
        warmupThread?.interrupt()
        warmupThread = null
        warmupModelPath = null
    }
}
