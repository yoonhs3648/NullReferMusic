import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, BackHandler, Platform, type AppStateStatus } from 'react-native';

import { getNrmAndroidIdSha256 } from '@/lib/nrmAppSerialNo';
import {
  fetchUserBanList,
  resolveBanStateForDevice,
  NRM_USER_BAN_POLL_INTERVAL_MS,
} from '@/lib/nrmUserBanClient';
import { notifyUser } from '@/lib/nrmUserNotify';

type Props = {
  children: ReactNode;
};

function exitApp(): void {
  if (Platform.OS === 'android') {
    BackHandler.exitApp();
  }
}

/**
 * 기기 ANDROID_ID(SHA-256)가 차단 목록의 device_id와 같고 최신 행이 차단이면 앱 사용 불가.
 * 로그인 계정(Google/Kakao)과 무관. 로그인 전에도 검사한다.
 */
export function NrmUserBanGate({ children }: Props) {
  const [gateOpen, setGateOpen] = useState(true);
  const banActiveRef = useRef(false);

  const runCheck = useCallback(async () => {
    const deviceId = await getNrmAndroidIdSha256();
    if (!deviceId) {
      banActiveRef.current = false;
      setGateOpen(false);
      return;
    }
    try {
      const rows = await fetchUserBanList();
      const state = resolveBanStateForDevice(rows, deviceId);
      if (state.banned) {
        setGateOpen(true);
        if (!banActiveRef.current) {
          banActiveRef.current = true;
          notifyUser(state.content.trim() || '이 기기는 이용이 제한되었습니다.', {
            actionLabel: '나가기',
            blocking: true,
            onAction: exitApp,
          });
        }
      } else {
        banActiveRef.current = false;
        setGateOpen(false);
      }
    } catch {
      banActiveRef.current = false;
      setGateOpen(false);
    }
  }, []);

  useEffect(() => {
    void runCheck();
    const timer = setInterval(() => {
      void runCheck();
    }, NRM_USER_BAN_POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [runCheck]);

  useEffect(() => {
    const onState = (state: AppStateStatus) => {
      if (state === 'active') void runCheck();
    };
    const sub = AppState.addEventListener('change', onState);
    return () => sub.remove();
  }, [runCheck]);

  if (gateOpen) return null;
  return children;
}
