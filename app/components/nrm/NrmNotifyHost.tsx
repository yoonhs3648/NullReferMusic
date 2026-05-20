import { useCallback, useEffect, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { NrmLogo } from '@/components/nrm/NrmLogo';
import { nrmTokens } from '@/constants/nrmTokens';
import { useNrmUiAppearance } from '@/context/NrmUiAppearanceContext';
import {
  registerNotifyListener,
  type NotifyPayload,
} from '@/lib/nrmUserNotify';

export function NrmNotifyHost() {
  const { isDark } = useNrmUiAppearance();
  const [open, setOpen] = useState(false);
  const [payload, setPayload] = useState<NotifyPayload | null>(null);

  const show = useCallback((p: NotifyPayload) => {
    setPayload(p);
    setOpen(true);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setPayload(null);
  }, []);

  useEffect(() => {
    registerNotifyListener(show);
    return () => registerNotifyListener(null);
  }, [show]);

  const cardBg = isDark ? nrmTokens.color.surfaceTile1 : nrmTokens.color.canvas;
  const cardBorder = isDark ? nrmTokens.color.borderOnDark : nrmTokens.color.hairline;
  const msgColor = isDark ? nrmTokens.color.textMuted : nrmTokens.color.inkMuted80;

  return (
    <Modal
      visible={open}
      transparent
      animationType="fade"
      onRequestClose={close}
      statusBarTranslucent>
      <View style={styles.wrap}>
        <Pressable
          style={[StyleSheet.absoluteFill, styles.dim]}
          onPress={close}
          accessibilityRole="button"
          accessibilityLabel="닫기"
        />
        <View
          style={[
            styles.card,
            {
              backgroundColor: cardBg,
              borderColor: cardBorder,
            },
          ]}
          accessibilityViewIsModal>
          <NrmLogo compact tone={isDark ? 'dark' : 'light'} />
          <Text style={[styles.message, { color: msgColor }]}>
            {payload?.message ?? ''}
          </Text>
          <Pressable
            onPress={close}
            style={({ pressed }) => [
              styles.cta,
              pressed && styles.ctaPressed,
            ]}
            accessibilityRole="button">
            <Text style={styles.ctaLabel}>알겠어요</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: nrmTokens.space.lg,
    ...Platform.select({
      /** 웹: 메뉴 Modal보다 알림 레이어가 위로 오도록 */
      web: { zIndex: 2147483646 },
      default: {},
    }),
  },
  dim: {
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  card: {
    width: '100%',
    maxWidth: 360,
    borderRadius: nrmTokens.radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: nrmTokens.space.lg,
    paddingTop: nrmTokens.space.xl,
    paddingBottom: nrmTokens.space.lg,
    zIndex: 1,
  },
  message: {
    marginTop: nrmTokens.space.md,
    fontSize: nrmTokens.font.body,
    lineHeight: 25,
    fontWeight: '400',
    letterSpacing: -0.37,
  },
  cta: {
    marginTop: nrmTokens.space.xl,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    paddingHorizontal: 22,
    borderRadius: nrmTokens.radius.pill,
    backgroundColor: nrmTokens.color.primary,
  },
  ctaPressed: {
    transform: [{ scale: 0.95 }],
    opacity: 0.98,
  },
  ctaLabel: {
    color: nrmTokens.color.onPrimary,
    fontSize: nrmTokens.font.body,
    fontWeight: '400',
    letterSpacing: -0.37,
  },
});
