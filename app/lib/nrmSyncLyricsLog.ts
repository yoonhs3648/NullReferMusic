/**
 * 싱크 가사(LRC) 전문을 디버그 로그에 그대로 남긴다.
 * — eSpeak 전처리본+타임스탬프, Whisper/wav2vec2 결과 확인용.
 */
import { Platform } from 'react-native';

import { logNrmDev } from '@/lib/nrmDevLog';
import { appendNrmFileLog } from '@/lib/nrmFileLog';
import { isNrmFileLoggingActive } from '@/lib/nrmFileLoggingRuntime';

export type SyncLyricsLogEngine =
  | 'whisper'
  | 'wav2vec2'
  | 'aeneas'
  | 'espeak-align'
  | string;

export type SyncLyricsLogKind =
  /** eSpeak 전처리(발음) 가사에 FA 타임스탬프를 붙인 결과 */
  | 'phonetic_timed'
  /** 엔진이 만든 싱크 LRC (원문/전사 텍스트) */
  | 'sync_lrc'
  /** eSpeak 후 원문 가사로 복원한 LRC */
  | 'restored_lrc';

function countNonEmptyLines(lrc: string): number {
  return lrc.split(/\r?\n/).filter((l) => l.trim().length > 0).length;
}

/** 타임스탬프 포함 LRC 전문을 메타 + 파일 로그 블록으로 기록 */
export function logSyncLyricsLrcDump(opts: {
  engine: SyncLyricsLogEngine;
  kind: SyncLyricsLogKind;
  lrc: string;
  extra?: Record<string, unknown>;
}): void {
  const trimmed = opts.lrc.trim();
  if (!trimmed) return;

  const lineCount = countNonEmptyLines(trimmed);
  logNrmDev('sync-lyrics', {
    event: 'lrc_dump',
    engine: opts.engine,
    kind: opts.kind,
    lineCount,
    chars: trimmed.length,
    ...(opts.extra ?? {}),
  });

  if (!isNrmFileLoggingActive()) return;
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') return;

  const header =
    `===== sync-lyrics engine=${opts.engine} kind=${opts.kind} lines=${lineCount} chars=${trimmed.length} =====`;
  appendNrmFileLog(
    'sync-lyrics',
    'info',
    `${header}\n${trimmed}\n===== end sync-lyrics =====`,
  );
}
