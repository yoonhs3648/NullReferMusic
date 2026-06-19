import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { nrmTokens } from '@/constants/nrmTokens';
import { getNrmModalScrimColor } from '@/lib/nrmUiAppearanceColors';

type Props = {
  isDark: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/** 우측 알림 레이어 — 메뉴 드로어와 동일한 크기·스크림·닫기 동작 */
export function NrmAppNotificationDrawer({ isDark, open, onOpenChange }: Props) {
  const { width: windowWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const drawerW = Math.min(380, Math.round(windowWidth * 0.88));
  const translateX = useRef(new Animated.Value(drawerW)).current;
  const [visible, setVisible] = useState(open);

  const titleColor = isDark ? nrmTokens.color.bodyOnDark : nrmTokens.color.ink;
  const bodyColor = isDark ? nrmTokens.color.textMuted : nrmTokens.color.inkMuted48;
  const modalScrim = getNrmModalScrimColor(isDark);

  const dismiss = useCallback(() => {
    Animated.timing(translateX, {
      toValue: drawerW,
      duration: 220,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setVisible(false);
        onOpenChange(false);
      }
    });
  }, [drawerW, onOpenChange, translateX]);

  useEffect(() => {
    if (open) {
      setVisible(true);
      translateX.setValue(drawerW);
      Animated.timing(translateX, {
        toValue: 0,
        duration: 260,
        useNativeDriver: true,
      }).start();
      return;
    }
    if (visible) dismiss();
  }, [dismiss, drawerW, open, translateX, visible]);

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="none" onRequestClose={dismiss}>
      <View style={styles.modalRoot}>
        <Pressable
          style={[StyleSheet.absoluteFill, { backgroundColor: modalScrim }]}
          onPress={dismiss}
          accessibilityLabel="닫기"
        />
        <Animated.View
          style={[
            styles.drawer,
            {
              width: drawerW,
              paddingTop: insets.top,
              paddingBottom: insets.bottom + nrmTokens.layout.menuDrawerCloseBottomGap,
              backgroundColor: isDark ? nrmTokens.color.surfaceTile1 : nrmTokens.color.canvas,
              transform: [{ translateX }],
            },
          ]}>
          <View style={styles.drawerColumn}>
            <View style={styles.body}>
              <Text style={[styles.title, { color: titleColor }]}>알림</Text>
              <Text style={[styles.hint, { color: bodyColor }]}>
                알림 내용은 추후 추가됩니다.
              </Text>
            </View>
            <Pressable
              onPress={dismiss}
              style={({ pressed }) => [styles.footerClose, pressed && styles.footerClosePressed]}
              accessibilityRole="button"
              accessibilityLabel="닫기">
              <Text style={[styles.footerCloseLabel, { color: titleColor }]}>닫기</Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  drawer: {
    height: '100%',
    borderTopLeftRadius: nrmTokens.radius.lg,
    borderBottomLeftRadius: nrmTokens.radius.lg,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: -2, height: 0 },
        shadowOpacity: 0.18,
        shadowRadius: 12,
      },
      android: { elevation: 16 },
      default: {},
    }),
  },
  drawerColumn: {
    flex: 1,
  },
  body: {
    flex: 1,
    paddingHorizontal: nrmTokens.space.lg,
    paddingTop: nrmTokens.space.lg,
  },
  title: {
    fontSize: nrmTokens.font.leadAiry,
    fontWeight: '700',
    marginBottom: nrmTokens.space.sm,
  },
  hint: {
    fontSize: nrmTokens.font.body,
    lineHeight: 22,
  },
  footerClose: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: nrmTokens.layout.touchMin,
    marginHorizontal: nrmTokens.space.lg,
    borderRadius: nrmTokens.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(128,128,128,0.35)',
  },
  footerClosePressed: {
    opacity: 0.88,
  },
  footerCloseLabel: {
    fontSize: nrmTokens.font.bodyStrong,
    fontWeight: '600',
  },
});
