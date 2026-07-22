import Ionicons from '@expo/vector-icons/Ionicons';
import {
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ListRenderItemInfo,
} from 'react-native';

import { nrmTokens } from '@/constants/nrmTokens';
import type { NrmLlmAdminProviderOption } from '@/lib/nrmLlmAdminTokenClient';
import { getNrmModalScrimColor } from '@/lib/nrmUiAppearanceColors';

type Props = {
  visible: boolean;
  onClose: () => void;
  options: NrmLlmAdminProviderOption[];
  selectedProviderId: number | null;
  onSelect: (providerId: number) => void;
  titleColor: string;
  bodyColor: string;
  isDark: boolean;
};

/** 관리자 AI토큰 화면 공통 — 제공자 선택 팝업. */
export function NrmAdminLlmProviderPickerModal({
  visible,
  onClose,
  options,
  selectedProviderId,
  onSelect,
  titleColor,
  bodyColor,
  isDark,
}: Props) {
  const { height: windowHeight } = useWindowDimensions();
  const hairline = isDark ? nrmTokens.color.borderOnDark : nrmTokens.color.hairline;
  const rowHover = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)';
  const sheetBg = isDark ? nrmTokens.color.surfaceTile2 : nrmTokens.color.canvas;

  const cardHeight = Math.min(
    windowHeight * 0.55,
    Math.max(160, 52 + options.length * 52 + nrmTokens.space.md),
  );

  const renderRow = ({ item }: ListRenderItemInfo<NrmLlmAdminProviderOption>) => {
    const isSelected = item.providerId === selectedProviderId;
    return (
      <Pressable
        onPress={() => {
          onSelect(item.providerId);
          onClose();
        }}
        style={({ pressed }) => [
          styles.optionRow,
          isSelected && {
            backgroundColor: isDark ? 'rgba(0,102,204,0.22)' : 'rgba(0,102,204,0.10)',
          },
          pressed && !isSelected && { backgroundColor: rowHover },
        ]}
        accessibilityRole="button"
        accessibilityState={{ selected: isSelected }}>
        <View style={styles.optionTextWrap}>
          <Text
            style={[styles.optionLabel, { color: titleColor }, isSelected && styles.optionLabelSelected]}
            numberOfLines={2}>
            {item.providerName}
          </Text>
        </View>
        {isSelected ? <Ionicons name="checkmark" size={20} color={nrmTokens.color.primary} /> : null}
      </Pressable>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        style={[styles.pickerBackdrop, { backgroundColor: getNrmModalScrimColor(isDark) }]}
        onPress={onClose}>
        <Pressable
          onPress={() => {}}
          style={[
            styles.pickerCard,
            {
              height: cardHeight,
              backgroundColor: sheetBg,
              borderColor: hairline,
            },
          ]}>
          <View style={[styles.pickerHeader, { borderColor: hairline }]}>
            <Text style={[styles.pickerTitle, { color: titleColor }]}>제공자 선택</Text>
            <Pressable
              onPress={onClose}
              hitSlop={8}
              style={({ pressed }) => [styles.pickerClose, pressed && { opacity: 0.7 }]}
              accessibilityRole="button"
              accessibilityLabel="닫기">
              <Ionicons name="close" size={22} color={bodyColor} />
            </Pressable>
          </View>
          {options.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={[styles.emptyText, { color: bodyColor }]}>등록된 제공자가 없습니다.</Text>
            </View>
          ) : (
            <FlatList
              style={styles.pickerList}
              data={options}
              keyExtractor={(item) => String(item.providerId)}
              renderItem={renderRow}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={Platform.OS !== 'web'}
              contentContainerStyle={styles.pickerListContent}
            />
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  pickerBackdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: nrmTokens.space.lg,
  },
  pickerCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: nrmTokens.radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: nrmTokens.space.md,
    paddingVertical: nrmTokens.space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  pickerTitle: {
    fontSize: nrmTokens.font.body,
    fontWeight: '600',
  },
  pickerClose: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: nrmTokens.radius.md,
  },
  /** 고정 height 카드 안에서 목록이 보이도록 flex:1 (maxHeight만 쓰면 Android에서 0px). */
  pickerList: {
    flex: 1,
  },
  pickerListContent: {
    paddingBottom: nrmTokens.space.md,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: nrmTokens.space.md,
  },
  emptyText: {
    fontSize: nrmTokens.font.body,
    textAlign: 'center',
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: nrmTokens.space.sm,
    paddingVertical: nrmTokens.space.md,
    paddingHorizontal: nrmTokens.space.md,
  },
  optionTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  optionLabel: {
    fontSize: nrmTokens.font.body,
  },
  optionLabelSelected: {
    fontWeight: '600',
  },
});
