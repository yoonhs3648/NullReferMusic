import { AppState, Platform, type AppStateStatus } from 'react-native';

import {
  nrmIsIgnoringBatteryOptimizations,
  nrmOpenBatteryOptimizationSettings,
} from '@/lib/nrmBackgroundWork.native';
import { notifyUser } from '@/lib/nrmUserNotify';

const BATTERY_REQUIRED_MESSAGE =
  '배터리 최적화 예외가 필요합니다. 다운로드를 시작할 수 없습니다.';

/** 시스템 다이얼로그에서 거부 후에도 앱이 active인 경우 */
const DIALOG_DENY_GRACE_MS = 12_000;

const SETTINGS_WAIT_MAX_MS = 180_000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 다운로드 enqueue 전 필수.
 * - 예외 없음 → 시스템 설정/다이얼로그
 * - 허용 전까지 enqueue 금지
 * - 복귀·거부 후에도 예외 없으면 안내 후 false
 */
export async function ensureBatteryOptimizationExemptForDownload(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;

  if (await nrmIsIgnoringBatteryOptimizations()) return true;

  await nrmOpenBatteryOptimizationSettings();

  const started = Date.now();
  let sawNonActive = AppState.currentState !== 'active';

  while (Date.now() - started < SETTINGS_WAIT_MAX_MS) {
    if (await nrmIsIgnoringBatteryOptimizations()) return true;

    const state: AppStateStatus = AppState.currentState;
    if (state !== 'active') {
      sawNonActive = true;
    }

    if (sawNonActive && state === 'active') {
      await delay(400);
      if (await nrmIsIgnoringBatteryOptimizations()) return true;
      notifyUser(BATTERY_REQUIRED_MESSAGE);
      return false;
    }

    if (!sawNonActive && Date.now() - started >= DIALOG_DENY_GRACE_MS) {
      if (!(await nrmIsIgnoringBatteryOptimizations())) {
        notifyUser(BATTERY_REQUIRED_MESSAGE);
        return false;
      }
      return true;
    }

    await delay(400);
  }

  notifyUser(BATTERY_REQUIRED_MESSAGE);
  return false;
}
