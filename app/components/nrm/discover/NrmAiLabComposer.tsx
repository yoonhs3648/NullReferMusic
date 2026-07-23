import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useMemo, useState } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';

import { nrmTokens } from '@/constants/nrmTokens';
import { NRM_AI_LAB_COMPOSER_PLACEHOLDER } from '@/lib/nrmAiLabChatUi';

type Props = {
  isDark: boolean;
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  disabled?: boolean;
};

/** 한 줄 높이(기존과 동일). 줄바꿈·래핑 시 이 값부터 늘어난다. */
const INPUT_MIN_HEIGHT = 36;
const INPUT_LINE_HEIGHT = 22;

/** AI Lab 하단 입력 — 길면 가로 스크롤 대신 높이가 늘어나 입력 내용이 보이게 한다. */
export function NrmAiLabComposer({ isDark, value, onChangeText, onSend, disabled }: Props) {
  const { height: windowHeight } = useWindowDimensions();
  const titleColor = isDark ? nrmTokens.color.bodyOnDark : nrmTokens.color.ink;
  const hairline = isDark ? nrmTokens.color.borderOnDark : nrmTokens.color.hairline;
  const inputBg = isDark ? 'rgba(255,255,255,0.06)' : nrmTokens.color.canvas;
  const placeholderColor = isDark ? '#6b7288' : '#9ca3af';
  const canSend = value.trim().length > 0 && !disabled;
  const borderW = Platform.OS === 'web' ? StyleSheet.hairlineWidth : 1;
  const [inputHeight, setInputHeight] = useState(INPUT_MIN_HEIGHT);
  /** 화면의 약 40%까지 키우고, 그 이상은 입력란 내부 스크롤 */
  const inputMaxHeight = useMemo(
    () => Math.max(INPUT_LINE_HEIGHT * 8, Math.round(windowHeight * 0.4)),
    [windowHeight],
  );

  useEffect(() => {
    if (!value.trim()) setInputHeight(INPUT_MIN_HEIGHT);
  }, [value]);

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
          multiline
          scrollEnabled={inputHeight >= inputMaxHeight}
          onContentSizeChange={(e) => {
            const next = Math.ceil(e.nativeEvent.contentSize.height);
            setInputHeight(Math.min(inputMaxHeight, Math.max(INPUT_MIN_HEIGHT, next)));
          }}
          style={[styles.input, { color: titleColor, height: inputHeight }]}
          returnKeyType="send"
          submitBehavior="submit"
          blurOnSubmit
          enablesReturnKeyAutomatically
          onSubmitEditing={trySend}
          textAlignVertical="center"
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
    paddingHorizontal: 0,
    paddingTop: nrmTokens.space.sm,
    paddingBottom: nrmTokens.space.sm,
  },
  shell: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: nrmTokens.space.xs,
    borderRadius: nrmTokens.radius.lg,
    paddingLeft: nrmTokens.space.md,
    paddingRight: nrmTokens.space.xs,
    paddingVertical: nrmTokens.space.xs,
    minHeight: 52,
  },
  input: {
    flex: 1,
    minHeight: INPUT_MIN_HEIGHT,
    paddingTop: Platform.OS === 'ios' ? 8 : 6,
    paddingBottom: Platform.OS === 'ios' ? 8 : 6,
    fontSize: nrmTokens.font.body,
    lineHeight: INPUT_LINE_HEIGHT,
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
