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
  fetchLlmModelsForAiLab,
  findLlmModelById,
  pickDefaultLlmModelId,
  type NrmLlmModelItem,
} from '@/lib/nrmLlmModelClient';
import { getNrmModalScrimColor } from '@/lib/nrmUiAppearanceColors';

type Props = {
  isDark: boolean;
  value: number | null;
  onChange: (modelId: number) => void;
  /** chip: 상단 칩 / menuRow: 좌측 메뉴 행 */
  presentation?: 'chip' | 'menuRow';
};

/** AI Lab — LLMModel(Type=LLM) 기반 모델 선택. */
export function NrmAiLabModelPicker({
  isDark,
  value,
  onChange,
  presentation = 'chip',
}: Props) {
  const { height: windowHeight } = useWindowDimensions();
  const [open, setOpen] = useState(false);
  const [models, setModels] = useState<NrmLlmModelItem[]>([]);
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

  const loadModels = useCallback(async (options?: { force?: boolean }) => {
    setLoading(true);
    setLoadError(null);
    try {
      const rows = await fetchLlmModelsForAiLab({ force: options?.force });
      setModels(rows);
    } catch {
      setModels([]);
      setLoadError('모델 목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadModels();
  }, [loadModels]);

  useEffect(() => {
    if (value != null || models.length === 0) return;
    const defaultId = pickDefaultLlmModelId(models);
    if (defaultId != null) onChange(defaultId);
  }, [onChange, models, value]);

  useEffect(() => {
    if (!open) setSearchQuery('');
  }, [open]);

  const selected = useMemo(
    () => findLlmModelById(models, value),
    [models, value],
  );

  const selectedLabel = useMemo(() => {
    if (loading && !selected) return '불러오는 중…';
    if (selected) return selected.modelDisplayName;
    if (loadError) return '모델 없음';
    return '모델 선택';
  }, [loadError, loading, selected]);

  const filteredModels = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return models;
    return models.filter((item) => item.modelDisplayName.toLowerCase().includes(q));
  }, [models, searchQuery]);

  const onPick = useCallback(
    (item: NrmLlmModelItem) => {
      if (!item.isActive) return;
      setOpen(false);
      if (item.modelId !== value) onChange(item.modelId);
    },
    [onChange, value],
  );

  const renderRow = useCallback(
    ({ item }: ListRenderItemInfo<NrmLlmModelItem>) => {
      const isSelected = item.modelId === value;
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
          {/*
            카드 내부 탭이 배경(닫기)으로 전파되지 않도록 onPress no-op으로 막는다.
            이전엔 onStartShouldSetResponder={() => true}를 썼는데, 이 raw responder API는
            터치 시작 시 무조건 이 뷰가 responder를 선점해버려 안드로이드에서 FlatList가
            리스트 끝에 도달한 뒤 "새로 시작하는" 위로 스크롤 제스처를 responder 협상에서
            빼앗기는 문제가 있었다(끝까지 내리면 다시 못 올라오는 버그의 실제 원인).
            Pressable은 스크롤 제스처와 충돌 없이 탭만 소비한다.
          */}
          <Pressable
            onPress={() => {}}
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
                  onPress={() => void loadModels({ force: true })}
                  style={({ pressed }) => [styles.retryBtn, pressed && { opacity: 0.85 }]}
                  accessibilityRole="button">
                  <Text style={[styles.retryLabel, { color: nrmTokens.color.primary }]}>
                    다시 시도
                  </Text>
                </Pressable>
              </View>
            ) : filteredModels.length === 0 ? (
              <View style={styles.centerState}>
                <Text style={[styles.stateText, { color: bodyColor }]}>
                  {searchQuery.trim() ? '검색 결과가 없습니다.' : '등록된 LLM 모델이 없습니다.'}
                </Text>
              </View>
            ) : (
              <FlatList
                style={styles.listFlex}
                data={filteredModels}
                keyExtractor={(item) => String(item.modelId)}
                renderItem={renderRow}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={Platform.OS !== 'web'}
                contentContainerStyle={styles.listContent}
              />
            )}
          </Pressable>
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
  /**
   * modalCard가 고정 height + overflow:hidden 안에서 FlatList가 남는 공간을 정확히
   * 채우도록 flex:1 필요 (없으면 contentSize 계산이 카드 표시 영역과 어긋남).
   */
  listFlex: {
    flex: 1,
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
