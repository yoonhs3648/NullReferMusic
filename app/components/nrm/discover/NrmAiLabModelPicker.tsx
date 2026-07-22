import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type ListRenderItemInfo,
} from 'react-native';

import { nrmTokens } from '@/constants/nrmTokens';
import {
  fetchLlmProvidersForAiLab,
  findLlmProviderById,
  pickDefaultLlmProviderId,
  type NrmLlmProviderItem,
} from '@/lib/nrmLlmProviderClient';
import { getNrmModalScrimColor } from '@/lib/nrmUiAppearanceColors';

type Props = {
  isDark: boolean;
  value: number | null;
  onChange: (providerId: number) => void;
  /** chip: 상단 칩 / menuRow: 좌측 메뉴 행 */
  presentation?: 'chip' | 'menuRow';
};

/** AI Lab — LLMProvider(Type=LLM) 기반 모델 선택. */
export function NrmAiLabModelPicker({
  isDark,
  value,
  onChange,
  presentation = 'chip',
}: Props) {
  const { height: windowHeight } = useWindowDimensions();
  const [open, setOpen] = useState(false);
  const [providers, setProviders] = useState<NrmLlmProviderItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const titleColor = isDark ? nrmTokens.color.bodyOnDark : nrmTokens.color.ink;
  const bodyColor = isDark ? nrmTokens.color.textMuted : nrmTokens.color.inkMuted80;
  const hairline = isDark ? nrmTokens.color.borderOnDark : nrmTokens.color.hairline;
  const chipBg = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)';
  const sheetBg = isDark ? nrmTokens.color.surfaceTile2 : nrmTokens.color.canvas;
  const rowHover = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)';
  const inputBg = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)';

  const loadProviders = useCallback(async (options?: { force?: boolean }) => {
    setLoading(true);
    setLoadError(null);
    try {
      const rows = await fetchLlmProvidersForAiLab({ force: options?.force });
      setProviders(rows);
    } catch {
      setProviders([]);
      setLoadError('모델 목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProviders();
  }, [loadProviders]);

  useEffect(() => {
    if (value != null || providers.length === 0) return;
    const defaultId = pickDefaultLlmProviderId(providers);
    if (defaultId != null) onChange(defaultId);
  }, [onChange, providers, value]);

  useEffect(() => {
    if (!open) setSearchQuery('');
  }, [open]);

  const selected = useMemo(
    () => findLlmProviderById(providers, value),
    [providers, value],
  );

  const selectedLabel = useMemo(() => {
    if (loading && !selected) return '불러오는 중…';
    if (selected) return selected.modelDisplayName;
    if (loadError) return '모델 없음';
    return '모델 선택';
  }, [loadError, loading, selected]);

  const filteredProviders = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return providers;
    return providers.filter((item) => item.modelDisplayName.toLowerCase().includes(q));
  }, [providers, searchQuery]);

  const onPick = useCallback(
    (item: NrmLlmProviderItem) => {
      if (!item.isActive) return;
      setOpen(false);
      if (item.providerId !== value) onChange(item.providerId);
    },
    [onChange, value],
  );

  const renderRow = useCallback(
    ({ item }: ListRenderItemInfo<NrmLlmProviderItem>) => {
      const isSelected = item.providerId === value;
      const disabled = !item.isActive;
      return (
        <Pressable
          disabled={disabled}
          onPress={() => onPick(item)}
          style={({ pressed }) => [
            styles.optionRow,
            isSelected && !disabled && {
              backgroundColor: isDark ? 'rgba(0,102,204,0.22)' : 'rgba(0,102,204,0.10)',
            },
            pressed && !disabled && { backgroundColor: rowHover },
            disabled && styles.optionDisabled,
          ]}
          accessibilityRole="button"
          accessibilityState={{ selected: isSelected, disabled }}
          accessibilityLabel={item.modelDisplayName}>
          <View style={styles.optionTextWrap}>
            <Text
              style={[
                styles.optionLabel,
                { color: disabled ? bodyColor : titleColor },
                isSelected && !disabled && styles.optionLabelSelected,
              ]}
              numberOfLines={2}>
              {item.modelDisplayName}
            </Text>
            {!item.isActive ? (
              <Text style={[styles.optionHint, { color: bodyColor }]}>비활성</Text>
            ) : null}
          </View>
          {isSelected && !disabled ? (
            <Ionicons name="checkmark" size={20} color={nrmTokens.color.primary} />
          ) : null}
        </Pressable>
      );
    },
    [bodyColor, isDark, onPick, rowHover, titleColor, value],
  );

  const trigger =
    presentation === 'menuRow' ? (
      <Pressable
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          styles.menuRowTrigger,
          pressed && { backgroundColor: rowHover },
        ]}
        accessibilityRole="button"
        accessibilityLabel={`모델 ${selectedLabel}`}>
        <View style={styles.menuRowLeft}>
          <View style={styles.iconSlot}>
            <Ionicons name="hardware-chip-outline" size={22} color={titleColor} />
          </View>
          <Text style={[styles.menuRowLabel, { color: titleColor }]} numberOfLines={1}>
            {selectedLabel}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={bodyColor} />
      </Pressable>
    ) : (
      <Pressable
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          styles.trigger,
          { backgroundColor: chipBg, borderColor: hairline },
          pressed && styles.triggerPressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel={`모델 ${selectedLabel}`}>
        <Text style={[styles.triggerValue, { color: titleColor }]} numberOfLines={1}>
          {selectedLabel}
        </Text>
        <Ionicons name="chevron-down" size={16} color={bodyColor} />
      </Pressable>
    );

  return (
    <>
      {trigger}

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable
          style={[styles.modalRoot, { backgroundColor: getNrmModalScrimColor(isDark) }]}
          onPress={() => setOpen(false)}>
          <View
            onStartShouldSetResponder={() => true}
            style={[
              styles.modalCard,
              {
                height: Math.min(windowHeight * 0.78, 560),
                backgroundColor: sheetBg,
                borderColor: hairline,
              },
            ]}>
            <View style={[styles.modalHeader, { borderColor: hairline }]}>
              <Text style={[styles.modalTitle, { color: titleColor }]}>LLM 모델</Text>
              <Pressable
                onPress={() => setOpen(false)}
                hitSlop={8}
                style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.7 }]}
                accessibilityRole="button"
                accessibilityLabel="닫기">
                <Ionicons name="close" size={22} color={bodyColor} />
              </Pressable>
            </View>

            <View style={[styles.searchBox, { borderColor: hairline, backgroundColor: inputBg }]}>
              <Ionicons name="search-outline" size={18} color={bodyColor} />
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="모델 이름 검색"
                placeholderTextColor={isDark ? '#6b7288' : '#9ca3af'}
                style={[styles.searchInput, { color: titleColor }]}
                autoCapitalize="none"
                autoCorrect={false}
                clearButtonMode="while-editing"
              />
            </View>

            {loading ? (
              <View style={styles.centerState}>
                <ActivityIndicator color={nrmTokens.color.primary} />
              </View>
            ) : loadError ? (
              <View style={styles.centerState}>
                <Text style={[styles.stateText, { color: bodyColor }]}>{loadError}</Text>
                <Pressable
                  onPress={() => void loadProviders({ force: true })}
                  style={({ pressed }) => [styles.retryBtn, pressed && { opacity: 0.85 }]}
                  accessibilityRole="button">
                  <Text style={[styles.retryLabel, { color: nrmTokens.color.primary }]}>
                    다시 시도
                  </Text>
                </Pressable>
              </View>
            ) : filteredProviders.length === 0 ? (
              <View style={styles.centerState}>
                <Text style={[styles.stateText, { color: bodyColor }]}>
                  {searchQuery.trim() ? '검색 결과가 없습니다.' : '등록된 LLM 모델이 없습니다.'}
                </Text>
              </View>
            ) : (
              <FlatList
                data={filteredProviders}
                keyExtractor={(item) => String(item.providerId)}
                renderItem={renderRow}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={Platform.OS !== 'web'}
                contentContainerStyle={styles.listContent}
              />
            )}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 36,
    maxWidth: 160,
    paddingHorizontal: nrmTokens.space.sm,
    borderRadius: nrmTokens.radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  triggerPressed: { opacity: 0.88 },
  triggerValue: {
    flexShrink: 1,
    fontSize: nrmTokens.font.caption,
    fontWeight: '600',
  },
  menuRowTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: nrmTokens.space.md,
    paddingHorizontal: nrmTokens.space.xs,
    borderRadius: nrmTokens.radius.sm,
  },
  menuRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: nrmTokens.space.sm,
    flex: 1,
    minWidth: 0,
  },
  iconSlot: {
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuRowLabel: {
    fontSize: nrmTokens.font.body,
    fontWeight: '500',
    flex: 1,
  },
  modalRoot: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: nrmTokens.space.lg,
  },
  modalCard: {
    width: '100%',
    maxWidth: 440,
    borderRadius: nrmTokens.radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: nrmTokens.space.md,
    paddingVertical: nrmTokens.space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalTitle: {
    fontSize: nrmTokens.font.body,
    fontWeight: '600',
  },
  closeBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: nrmTokens.radius.md,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: nrmTokens.space.xs,
    marginHorizontal: nrmTokens.space.md,
    marginTop: nrmTokens.space.sm,
    marginBottom: nrmTokens.space.xs,
    paddingHorizontal: nrmTokens.space.sm,
    borderRadius: nrmTokens.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 40,
  },
  searchInput: {
    flex: 1,
    fontSize: nrmTokens.font.body,
    paddingVertical: Platform.OS === 'ios' ? 8 : 6,
  },
  listContent: {
    paddingBottom: nrmTokens.space.md,
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
    gap: 2,
  },
  optionLabel: {
    fontSize: nrmTokens.font.body,
  },
  optionLabelSelected: {
    fontWeight: '600',
  },
  optionHint: {
    fontSize: nrmTokens.font.caption,
  },
  optionDisabled: {
    opacity: 0.42,
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: nrmTokens.space.lg,
    gap: nrmTokens.space.sm,
  },
  stateText: {
    fontSize: nrmTokens.font.body,
    textAlign: 'center',
  },
  retryBtn: {
    paddingVertical: nrmTokens.space.xs,
    paddingHorizontal: nrmTokens.space.sm,
  },
  retryLabel: {
    fontSize: nrmTokens.font.body,
    fontWeight: '600',
  },
});
