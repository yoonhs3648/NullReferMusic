package com.nullrefer.music.ondevice

/**
 * JVM 스레드에서 잡히지 않은 예외를 파일 로그에 남긴 뒤 기본 핸들러로 넘깁니다.
 * (네이티브 OOM/SIGSEGV 등은 막을 수 없지만, Kotlin/Java 미처리 예외 추적에 유용합니다.)
 */
object NrmUncaughtExceptionHandler : Thread.UncaughtExceptionHandler {
  private var defaultHandler: Thread.UncaughtExceptionHandler? = null

  fun install() {
    if (defaultHandler != null) return
    defaultHandler = Thread.getDefaultUncaughtExceptionHandler()
    Thread.setDefaultUncaughtExceptionHandler(this)
  }

  override fun uncaughtException(thread: Thread, throwable: Throwable) {
    try {
      NrmFileLogger.error(
          "uncaught",
          "thread=${thread.name} err=${throwable.message ?: throwable.javaClass.simpleName}",
          throwable,
      )
    } catch (_: Throwable) {
      // 로깅 실패 시에도 기본 핸들러는 호출
    }
    defaultHandler?.uncaughtException(thread, throwable)
  }
}
