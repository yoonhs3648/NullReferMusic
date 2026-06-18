import { Pressable, StyleSheet, Text, View } from 'react-native';

import { NrmLogo } from '@/components/nrm/NrmLogo';
import { nrmTokens } from '@/constants/nrmTokens';
import {
  getNrmModalScrimColor,
  getNrmRootBackgroundColor,
} from '@/lib/nrmUiAppearanceColors';
import type { ChoicePayload, ConfirmPayload, NotifyPayload } from '@/lib/nrmUserNotify';

export type UserNotifyOverlayMode =
  | { kind: 'notify'; payload: NotifyPayload }
  | { kind: 'confirm'; payload: ConfirmPayload }
  | { kind: 'choice'; payload: ChoicePayload };

type Props = {
  overlay: UserNotifyOverlayMode;
  isDark: boolean;
  onClose: () => void;
};

export function NrmUserNotifyOverlay({ overlay, isDark, onClose }: Props) {
  const rootBg = getNrmRootBackgroundColor(isDark);
  const modalScrim = getNrmModalScrimColor(isDark);
  const cardBg = isDark ? nrmTokens.color.surfaceTile1 : nrmTokens.color.canvas;
  const cardBorder = isDark ? nrmTokens.color.borderOnDark : nrmTokens.color.hairline;
  const msgColor = isDark ? nrmTokens.color.textMuted : nrmTokens.color.inkMuted80;
  const highlightColor = isDark ? nrmTokens.color.primaryOnDark : nrmTokens.color.primary;
  const isConfirm = overlay.kind === 'confirm';
  const isChoice = overlay.kind === 'choice';
  const blocksBackdropClose = isConfirm || isChoice;

  return (
    <View style={[styles.wrap, { backgroundColor: rootBg }]} pointerEvents="box-none">
      {!blocksBackdropClose ? (
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
        {isConfirm && overlay.kind === 'confirm' && overlay.payload.highlight ? (
          <Text style={[styles.message, { color: msgColor }]}>
            <Text style={[styles.messageHighlight, { color: highlightColor }]}>
              {overlay.payload.highlight}
            </Text>
            {overlay.payload.message}
          </Text>
        ) : (
          <Text style={[styles.message, { color: msgColor }]}>
            {overlay.payload.message}
          </Text>
        )}
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
        ) : isChoice && overlay.kind === 'choice' ? (
          <View style={styles.choiceCol}>
            {overlay.payload.options.map((opt) => (
              <Pressable
                key={opt.id}
                onPress={() => {
                  overlay.payload.resolve(opt.id);
                  onClose();
                }}
                style={({ pressed }) => [
                  styles.choiceBtn,
                  styles.confirmBtnPrimary,
                  pressed && styles.confirmBtnPressed,
                ]}
                accessibilityRole="button">
                <Text style={styles.confirmBtnPrimaryLabel}>{opt.label}</Text>
              </Pressable>
            ))}
            <Pressable
              onPress={() => {
                overlay.payload.resolve(null);
                onClose();
              }}
              style={({ pressed }) => [
                styles.choiceBtn,
                styles.confirmBtnSecondary,
                { borderColor: cardBorder },
                pressed && styles.confirmBtnPressed,
              ]}
              accessibilityRole="button">
              <Text style={[styles.confirmBtnSecondaryLabel, { color: msgColor }]}>
                {overlay.payload.cancelLabel ?? '취소'}
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

const styles = StyleSheet.create({
  wrap: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: nrmTokens.space.lg,
    zIndex: 100,
    elevation: 100,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    borderRadius: nrmTokens.radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: nrmTokens.space.lg,
    paddingTop: nrmTokens.space.xl,
    paddingBottom: nrmTokens.space.lg,
    zIndex: 101,
    elevation: 101,
  },
  message: {
    marginTop: nrmTokens.space.md,
    fontSize: nrmTokens.font.body,
    lineHeight: 25,
    fontWeight: '400',
    letterSpacing: -0.37,
  },
  messageHighlight: {
    fontWeight: '700',
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
  choiceCol: {
    gap: nrmTokens.space.sm,
    marginTop: nrmTokens.space.xl,
    alignSelf: 'stretch',
  },
  choiceBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    paddingHorizontal: nrmTokens.space.sm,
    borderRadius: nrmTokens.radius.pill,
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
