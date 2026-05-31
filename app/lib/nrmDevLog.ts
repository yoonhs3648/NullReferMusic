import { Platform } from 'react-native';

import { appendNrmFileLog } from '@/lib/nrmFileLog';

function toFilePayload(payload: Record<string, unknown>): string {
  try {
    return JSON.stringify(payload);
  } catch {
    return String(payload);
  }
}

export function logNrmDev(
  tag: string,
  payload: Record<string, unknown>,
): void {
  console.warn(`[NRM:dev][${tag}]`, payload);
  if (Platform.OS === 'android') {
    appendNrmFileLog(tag, 'info', toFilePayload(payload));
  }
}

/**
 * Expo Go·Metro 터미널에 반드시 보이도록 `console.error`로만 기록합니다.
 * (기기 화면의 모달·LogBox와 별개로 CMD에 스택을 남깁니다.)
 */
export function logNrmRunError(
  tag: string,
  err: unknown,
  context?: Record<string, unknown>,
): void {
  const extra = context && Object.keys(context).length ? context : undefined;
  if (err instanceof Error) {
    console.error(`[NRM:err][${tag}]`, err.message, extra ?? '');
    if (err.stack) {
      console.error(err.stack);
    }
    if (Platform.OS === 'android') {
      const ctx = extra ? ` ${toFilePayload(extra)}` : '';
      appendNrmFileLog(tag, 'error', `${err.message}${ctx}\n${err.stack ?? ''}`);
    }
    return;
  }
  console.error(`[NRM:err][${tag}]`, err, extra ?? '');
  if (Platform.OS === 'android') {
    const ctx = extra ? ` ${toFilePayload(extra)}` : '';
    appendNrmFileLog(tag, 'error', `${String(err)}${ctx}`);
  }
}
