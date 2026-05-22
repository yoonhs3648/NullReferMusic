/**
 * 웹 전용 NrmNotifyHost
 *
 * React Native Web의 Modal은 document.body에 포털을 생성하지만,
 * 마운트 순서에 따라 NrmAppMenu 메뉴 Modal 포털보다 앞에 생성될 수 있어
 * 메뉴 뒤에 가려지는 문제가 있습니다.
 *
 * 해결: ReactDOM.createPortal + 명시적 z-index DOM div를 직접 body에 삽입.
 * 오버레이가 열릴 때마다 새 div를 body 맨 끝에 추가하므로
 * 항상 기존 Modal 포털보다 DOM에서 뒤에 위치하고,
 * z-index: 2147483647 로 모든 레이어 위에 표시됩니다.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { NrmLogo } from '@/components/nrm/NrmLogo';
import { nrmTokens } from '@/constants/nrmTokens';
import { useNrmUiAppearance } from '@/context/NrmUiAppearanceContext';
import {
  getNrmModalScrimColor,
  getNrmRootBackgroundColor,
} from '@/lib/nrmUiAppearanceColors';
import {
  registerConfirmListener,
  registerNotifyListener,
  type ConfirmPayload,
  type NotifyPayload,
} from '@/lib/nrmUserNotify';

type OverlayMode =
  | { kind: 'notify'; payload: NotifyPayload }
  | { kind: 'confirm'; payload: ConfirmPayload };

const FADE_DURATION = 180;

function OverlayContent({
  overlay,
  isDark,
  onClose,
}: {
  overlay: OverlayMode;
  isDark: boolean;
  onClose: () => void;
}) {
  const rootBg = getNrmRootBackgroundColor(isDark);
  const modalScrim = getNrmModalScrimColor(isDark);
  const cardBg = isDark ? nrmTokens.color.surfaceTile1 : nrmTokens.color.canvas;
  const cardBorder = isDark ? nrmTokens.color.borderOnDark : nrmTokens.color.hairline;
  const msgColor = isDark ? nrmTokens.color.textMuted : nrmTokens.color.inkMuted80;
  const isConfirm = overlay.kind === 'confirm';

  return (
    <View style={[styles.wrap, { backgroundColor: rootBg }]}>
      {!isConfirm ? (
        <Pressable
          style={[StyleSheet.absoluteFill, { backgroundColor: modalScrim }]}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="닫기"
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: modalScrim }]} />
      )}
      <View
        style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}
        accessibilityViewIsModal>
        <NrmLogo compact tone={isDark ? 'dark' : 'light'} />
        <Text style={[styles.message, { color: msgColor }]}>
          {overlay.payload.message}
        </Text>
        {isConfirm && overlay.kind === 'confirm' ? (
          <View style={styles.confirmRow}>
            <Pressable
              onPress={() => {
                overlay.payload.resolve(false);
                onClose();
              }}
              style={({ pressed }) => [
                styles.confirmBtn,
                styles.confirmBtnSecondary,
                { borderColor: cardBorder },
                pressed && styles.confirmBtnPressed,
              ]}
              accessibilityRole="button">
              <Text style={[styles.confirmBtnSecondaryLabel, { color: msgColor }]}>
                {overlay.payload.cancelLabel}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                overlay.payload.resolve(true);
                onClose();
              }}
              style={({ pressed }) => [
                styles.confirmBtn,
                styles.confirmBtnPrimary,
                pressed && styles.confirmBtnPressed,
              ]}
              accessibilityRole="button">
              <Text style={styles.confirmBtnPrimaryLabel}>
                {overlay.payload.confirmLabel}
              </Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            onPress={onClose}
            style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
            accessibilityRole="button">
            <Text style={styles.ctaLabel}>알겠어요</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

export function NrmNotifyHost() {
  const { isDark } = useNrmUiAppearance();
  const [overlay, setOverlay] = useState<OverlayMode | null>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const portalElRef = useRef<HTMLDivElement | null>(null);
  const [portalReady, setPortalReady] = useState(false);

  const close = useCallback(() => setOverlay(null), []);

  useEffect(() => {
    registerNotifyListener((p) => setOverlay({ kind: 'notify', payload: p }));
    registerConfirmListener((p) => setOverlay({ kind: 'confirm', payload: p }));
    return () => {
      registerNotifyListener(null);
      registerConfirmListener(null);
    };
  }, []);

  const open = overlay != null;

  // 오버레이가 열릴 때마다 body 맨 끝에 새 div 삽입 → 항상 최상단 DOM 위치 보장
  useEffect(() => {
    if (!open) {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: FADE_DURATION,
        useNativeDriver: true,
      }).start(() => {
        if (portalElRef.current) {
          portalElRef.current.remove();
          portalElRef.current = null;
          setPortalReady(false);
        }
      });
      return;
    }

    const div = document.createElement('div');
    div.style.cssText =
      'position:fixed;top:0;left:0;right:0;bottom:0;z-index:2147483647;';
    document.body.appendChild(div);
    portalElRef.current = div;
    setPortalReady(true);

    fadeAnim.setValue(0);
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: FADE_DURATION,
      useNativeDriver: true,
    }).start();

    return () => {
      div.remove();
      if (portalElRef.current === div) {
        portalElRef.current = null;
        setPortalReady(false);
      }
    };
  }, [open, fadeAnim]);

  if (!open || !portalReady || !portalElRef.current) return null;

  return createPortal(
    <Animated.View style={[StyleSheet.absoluteFill, { opacity: fadeAnim }]}>
      {overlay ? (
        <OverlayContent overlay={overlay} isDark={isDark} onClose={close} />
      ) : null}
    </Animated.View>,
    portalElRef.current,
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: nrmTokens.space.lg,
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
  confirmRow: {
    flexDirection: 'row',
    gap: nrmTokens.space.sm,
    marginTop: nrmTokens.space.xl,
    alignSelf: 'stretch',
  },
  confirmBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    paddingHorizontal: nrmTokens.space.sm,
    borderRadius: nrmTokens.radius.pill,
  },
  confirmBtnSecondary: {
    borderWidth: StyleSheet.hairlineWidth,
  },
  confirmBtnPrimary: {
    backgroundColor: nrmTokens.color.primary,
  },
  confirmBtnPressed: {
    transform: [{ scale: 0.95 }],
    opacity: 0.98,
  },
  confirmBtnSecondaryLabel: {
    fontSize: nrmTokens.font.body,
    fontWeight: '400',
    letterSpacing: -0.37,
  },
  confirmBtnPrimaryLabel: {
    color: nrmTokens.color.onPrimary,
    fontSize: nrmTokens.font.body,
    fontWeight: '400',
    letterSpacing: -0.37,
  },
});
