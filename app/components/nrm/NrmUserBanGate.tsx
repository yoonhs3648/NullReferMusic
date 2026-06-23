import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, BackHandler, Platform, type AppStateStatus } from 'react-native';

import { getNrmAppSerialNo } from '@/lib/nrmAppSerialNo';
import {
  fetchUserBanList,
  resolveBanStateForSerial,
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

/** SerialNo가 있는 APK 사용자 — 원격 차단 목록을 주기적으로 확인 (캐시 없음) */
export function NrmUserBanGate({ children }: Props) {
  const [gateOpen, setGateOpen] = useState(true);
  const banActiveRef = useRef(false);

  const runCheck = useCallback(async () => {
    const serial = await getNrmAppSerialNo();
    if (!serial) {
      banActiveRef.current = false;
      setGateOpen(false);
      return;
    }
    try {
      const rows = await fetchUserBanList();
      const state = resolveBanStateForSerial(rows, serial);
      if (state.banned) {
        setGateOpen(true);
        if (!banActiveRef.current) {
          banActiveRef.current = true;
          notifyUser(state.content.trim() || ' ', {
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
