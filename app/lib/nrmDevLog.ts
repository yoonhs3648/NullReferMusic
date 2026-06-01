import { Platform } from 'react-native';

import { appendNrmFileLog } from '@/lib/nrmFileLog';
import { NRM_FILE_LOGGING_ENABLED } from '@/lib/nrmFileLoggingPolicy';

function toFilePayload(payload: Record<string, unknown>): string {
  try {
    return JSON.stringify(payload);
  } catch {
    return String(payload);
  }
}

/** Release APK 포함 — Android에서 파일 로그 기록 */
export function logNrmDev(
  tag: string,
  payload: Record<string, unknown>,
): void {
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    console.warn(`[NRM:dev][${tag}]`, payload);
  }
  if (NRM_FILE_LOGGING_ENABLED && Platform.OS === 'android') {
    appendNrmFileLog(tag, 'info', toFilePayload(payload));
  }
}

/** Release APK 포함 — Android에서 파일 로그 기록 */
export function logNrmRunError(
  tag: string,
  err: unknown,
  context?: Record<string, unknown>,
): void {
  const extra = context && Object.keys(context).length ? context : undefined;
  if (err instanceof Error) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.error(`[NRM:err][${tag}]`, err.message, extra ?? '');
      if (err.stack) {
        console.error(err.stack);
      }
    }
    if (NRM_FILE_LOGGING_ENABLED && Platform.OS === 'android') {
      const ctx = extra ? ` ${toFilePayload(extra)}` : '';
      appendNrmFileLog(tag, 'error', `${err.message}${ctx}\n${err.stack ?? ''}`);
    }
    return;
  }
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    console.error(`[NRM:err][${tag}]`, err, extra ?? '');
  }
  if (NRM_FILE_LOGGING_ENABLED && Platform.OS === 'android') {
    const ctx = extra ? ` ${toFilePayload(extra)}` : '';
    appendNrmFileLog(tag, 'error', `${String(err)}${ctx}`);
  }
}
