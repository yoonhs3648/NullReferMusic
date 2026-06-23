import { useCallback, useEffect, useState } from 'react';
import { Modal } from 'react-native';

import {
  NrmUserNotifyOverlay,
  type UserNotifyOverlayMode,
} from '@/components/nrm/NrmUserNotifyOverlay';
import { useNrmUiAppearance } from '@/context/NrmUiAppearanceContext';
import {
  registerChoiceListener,
  registerConfirmListener,
  registerNotifyListener,
  registerPromptListener,
} from '@/lib/nrmUserNotify';

export function NrmNotifyHost() {
  const { isDark } = useNrmUiAppearance();
  const [overlay, setOverlay] = useState<UserNotifyOverlayMode | null>(null);

  const close = useCallback(() => setOverlay(null), []);

  useEffect(() => {
    registerNotifyListener((p) => setOverlay({ kind: 'notify', payload: p }));
    registerConfirmListener((p) => setOverlay({ kind: 'confirm', payload: p }));
    registerChoiceListener((p) => setOverlay({ kind: 'choice', payload: p }));
    registerPromptListener((p) => setOverlay({ kind: 'prompt', payload: p }));
    return () => {
      registerNotifyListener(null);
      registerConfirmListener(null);
      registerChoiceListener(null);
      registerPromptListener(null);
    };
  }, []);

  const open = overlay != null;

  return (
    <Modal
      visible={open}
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (overlay?.kind === 'notify' && overlay.payload.blocking) return;
        if (
          overlay?.kind !== 'confirm' &&
          overlay?.kind !== 'choice' &&
          overlay?.kind !== 'prompt'
        ) {
          close();
        }
      }}
      statusBarTranslucent>
      {overlay ? (
        <NrmUserNotifyOverlay overlay={overlay} isDark={isDark} onClose={close} />
      ) : null}
    </Modal>
  );
}
