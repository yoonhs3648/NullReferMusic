import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  NrmUserNotifyOverlay,
  type UserNotifyOverlayMode,
} from '@/components/nrm/NrmUserNotifyOverlay';
import {
  registerMenuChoiceListener,
  registerMenuConfirmListener,
  registerMenuNotifyListener,
  registerMenuPromptListener,
} from '@/lib/nrmUserNotify';

type Props = {
  isDark: boolean;
  /** 메뉴 드로어가 열려 있을 때만 리스너 등록 */
  active: boolean;
};

/** NrmAppMenu Modal 내부 — API 토큰 저장·미저장 확인이 메뉴 위에 보이도록 */
export function NrmMenuNotifyHost({ isDark, active }: Props) {
  const [overlay, setOverlay] = useState<UserNotifyOverlayMode | null>(null);
  const close = useCallback(() => setOverlay(null), []);

  useEffect(() => {
    if (!active) {
      registerMenuNotifyListener(null);
      registerMenuConfirmListener(null);
      registerMenuChoiceListener(null);
      registerMenuPromptListener(null);
      setOverlay(null);
      return;
    }
    registerMenuNotifyListener((p) => setOverlay({ kind: 'notify', payload: p }));
    registerMenuConfirmListener((p) => setOverlay({ kind: 'confirm', payload: p }));
    registerMenuChoiceListener((p) => setOverlay({ kind: 'choice', payload: p }));
    registerMenuPromptListener((p) => setOverlay({ kind: 'prompt', payload: p }));
    return () => {
      registerMenuNotifyListener(null);
      registerMenuConfirmListener(null);
      registerMenuChoiceListener(null);
      registerMenuPromptListener(null);
    };
  }, [active]);

  if (!overlay) return null;

  return (
    <View style={styles.host} pointerEvents="box-none">
      <NrmUserNotifyOverlay overlay={overlay} isDark={isDark} onClose={close} />
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 200,
    elevation: 200,
  },
});
