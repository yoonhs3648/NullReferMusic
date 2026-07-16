import Ionicons from '@expo/vector-icons/Ionicons';
import { Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { nrmTokens } from '@/constants/nrmTokens';
import { NRM_AI_LAB_COMPOSER_PLACEHOLDER } from '@/lib/nrmAiLabChatUi';

type Props = {
  isDark: boolean;
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  disabled?: boolean;
};

/** AI Lab 하단 입력 — 키보드 전송(return)으로 전송. */
export function NrmAiLabComposer({ isDark, value, onChangeText, onSend, disabled }: Props) {
  const titleColor = isDark ? nrmTokens.color.bodyOnDark : nrmTokens.color.ink;
  const hairline = isDark ? nrmTokens.color.borderOnDark : nrmTokens.color.hairline;
  const inputBg = isDark ? 'rgba(255,255,255,0.06)' : nrmTokens.color.canvas;
  const placeholderColor = isDark ? '#6b7288' : '#9ca3af';
  const canSend = value.trim().length > 0 && !disabled;
  const borderW = Platform.OS === 'web' ? StyleSheet.hairlineWidth : 1;

  const trySend = () => {
    if (canSend) onSend();
  };

  return (
    <View style={styles.wrap}>
      <View
        style={[
          styles.shell,
          { backgroundColor: inputBg, borderColor: hairline, borderWidth: borderW },
        ]}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={NRM_AI_LAB_COMPOSER_PLACEHOLDER}
          placeholderTextColor={placeholderColor}
          editable={!disabled}
          style={[styles.input, { color: titleColor }]}
          returnKeyType="send"
          submitBehavior="submit"
          blurOnSubmit
          enablesReturnKeyAutomatically
          onSubmitEditing={trySend}
        />
        <Pressable
          onPress={trySend}
          disabled={!canSend}
          style={({ pressed }) => [
            styles.sendBtn,
            !canSend && styles.sendBtnDisabled,
            pressed && canSend && styles.sendBtnPressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel="전송">
          <Ionicons name="arrow-up" size={20} color={nrmTokens.color.onPrimary} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: nrmTokens.space.sm,
    paddingTop: nrmTokens.space.sm,
    paddingBottom: nrmTokens.space.sm,
  },
  shell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: nrmTokens.space.xs,
    borderRadius: nrmTokens.radius.lg,
    paddingLeft: nrmTokens.space.md,
    paddingRight: nrmTokens.space.xs,
    paddingVertical: nrmTokens.space.xs,
    minHeight: 52,
  },
  input: {
    flex: 1,
    minHeight: 36,
    paddingVertical: Platform.OS === 'ios' ? 8 : 6,
    fontSize: nrmTokens.font.body,
    lineHeight: 22,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: nrmTokens.color.primary,
  },
  sendBtnDisabled: {
    backgroundColor: nrmTokens.color.inkMuted48,
    opacity: 0.45,
  },
  sendBtnPressed: { opacity: 0.88, transform: [{ scale: 0.95 }] },
});
