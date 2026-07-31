import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
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
  /**
   * value가 아직 없을 때 기본 모델을 고를 때 호출(저장 없이 UI만 채울 때 사용).
   * 없으면 onChange를 쓴다.
   */
  onDefaultSelect?: (modelId: number) => void;
  /** false면 기본 모델 자동 선택을 하지 않음(선호값 로딩 대기용) */
  allowAutoDefault?: boolean;
  /** chip: 상단 칩 / menuRow: 좌측 메뉴 행 */
  presentation?: 'chip' | 'menuRow';
};

const HEADER_HEIGHT = 52;
const ROW_MIN_HEIGHT = 52;

/**
 * AI Lab — LLMModel(Type=LLM) 모델 선택.
 *
 * 정책:
 * - 목록: preference ASC(null 후순위) → IsActive 우선 → ModelID DESC → ProviderID DESC
 * - isRecommand면 모델명 옆「추천 👍」
 * - value===null이고 allowAutoDefault면 pickDefaultLlmModelId (onDefaultSelect 우선, 저장은 부모 책임)
 * - IsActive=false는 표시만, 선택 불가
 * - presentation: chip | menuRow
 *
 * 스크롤: Modal 안 중첩 Pressable로 FlatList를 감싸지 않는다.
 * (Android에서 리스트 끝 도달 후 위로 스크롤이 잠기던 원인이었음)
 */
export function NrmAiLabModelPicker({
  isDark,
  value,
  onChange,
  onDefaultSelect,
  allowAutoDefault = true,
  presentation = 'chip',
}: Props) {
  const { height: windowHeight } = useWindowDimensions();
  const [open, setOpen] = useState(false);
  const [models, setModels] = useState<NrmLlmModelItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const titleColor = isDark ? nrmTokens.color.bodyOnDark : nrmTokens.color.ink;
  const bodyColor = isDark ? nrmTokens.color.textMuted : nrmTokens.color.inkMuted80;
  const hairline = isDark ? nrmTokens.color.borderOnDark : nrmTokens.color.hairline;
  const chipBg = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)';
  const sheetBg = isDark ? nrmTokens.color.surfaceTile2 : nrmTokens.color.canvas;
  const rowHover = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)';
  const selectedBg = isDark ? 'rgba(0,102,204,0.22)' : 'rgba(0,102,204,0.10)';

  const close = useCallback(() => setOpen(false), []);

  const loadModels = useCallback(async (options?: { force?: boolean }) => {
    setLoading(true);
    setLoadError(null);
    try {
      setModels(await fetchLlmModelsForAiLab({ force: options?.force }));
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
    if (!allowAutoDefault || value != null || models.length === 0) return;
    const defaultId = pickDefaultLlmModelId(models);
    if (defaultId != null) (onDefaultSelect ?? onChange)(defaultId);
  }, [allowAutoDefault, models, onChange, onDefaultSelect, value]);

  const selected = useMemo(() => findLlmModelById(models, value), [models, value]);

  const selectedLabel = useMemo(() => {
    if (loading && !selected) return '불러오는 중…';
    if (selected) return selected.modelDisplayName;
    if (loadError) return '모델 없음';
    return '모델 선택';
  }, [loadError, loading, selected]);

  const onPick = useCallback(
    (item: NrmLlmModelItem) => {
      if (!item.isActive) return;
      close();
      if (item.modelId !== value) onChange(item.modelId);
    },
    [close, onChange, value],
  );

  const sheetMaxHeight = Math.min(windowHeight * 0.75, 560);
  const listBodyHeight = Math.max(
    120,
    Math.min(sheetMaxHeight - HEADER_HEIGHT, models.length * ROW_MIN_HEIGHT + nrmTokens.space.md),
  );

  const trigger =
    presentation === 'menuRow' ? (
      <Pressable
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.menuRowTrigger, pressed && { backgroundColor: rowHover }]}
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

      <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
        {/*
          레이아웃: 루트 View + 절대 위치 스크림 Pressable + 카드 View.
          스크림이 카드를 감싸지 않으므로 리스트 스크롤 제스처와 닫기 탭이 분리된다.
        */}
        <View style={styles.root} pointerEvents="box-none">
          <Pressable
            style={[styles.scrim, { backgroundColor: getNrmModalScrimColor(isDark) }]}
            onPress={close}
            accessibilityRole="button"
            accessibilityLabel="닫기"
          />

          <View
            style={[
              styles.sheet,
              {
                maxHeight: sheetMaxHeight,
                backgroundColor: sheetBg,
                borderColor: hairline,
              },
            ]}
            accessibilityViewIsModal>
            <View style={[styles.header, { borderColor: hairline }]}>
              <Text style={[styles.headerTitle, { color: titleColor }]}>LLM 모델</Text>
              <Pressable
                onPress={close}
                hitSlop={8}
                style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.7 }]}
                accessibilityRole="button"
                accessibilityLabel="닫기">
                <Ionicons name="close" size={22} color={bodyColor} />
              </Pressable>
            </View>

            {loading ? (
              <View style={[styles.bodyState, { height: listBodyHeight }]}>
                <ActivityIndicator color={nrmTokens.color.primary} />
              </View>
            ) : loadError ? (
              <View style={[styles.bodyState, { height: listBodyHeight }]}>
                <Text style={[styles.stateText, { color: bodyColor }]}>{loadError}</Text>
                <Pressable
                  onPress={() => void loadModels({ force: true })}
                  style={({ pressed }) => [styles.retryBtn, pressed && { opacity: 0.85 }]}
                  accessibilityRole="button">
                  <Text style={[styles.retryLabel, { color: nrmTokens.color.primary }]}>다시 시도</Text>
                </Pressable>
              </View>
            ) : models.length === 0 ? (
              <View style={[styles.bodyState, { height: listBodyHeight }]}>
                <Text style={[styles.stateText, { color: bodyColor }]}>등록된 LLM 모델이 없습니다.</Text>
              </View>
            ) : (
              <ScrollView
                style={{ height: listBodyHeight }}
                contentContainerStyle={styles.listContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={Platform.OS !== 'web'}
                bounces
                overScrollMode="always"
                nestedScrollEnabled>
                {models.map((item) => {
                  const isSelected = item.modelId === value;
                  const disabled = !item.isActive;
                  const a11yLabel = item.isRecommand
                    ? `${item.modelDisplayName} 추천`
                    : item.modelDisplayName;
                  return (
                    <Pressable
                      key={item.modelId}
                      disabled={disabled}
                      onPress={() => onPick(item)}
                      style={({ pressed }) => [
                        styles.row,
                        isSelected && !disabled && { backgroundColor: selectedBg },
                        pressed && !disabled && { backgroundColor: rowHover },
                        disabled && styles.rowDisabled,
                      ]}
                      accessibilityRole="button"
                      accessibilityState={{ selected: isSelected, disabled }}
                      accessibilityLabel={a11yLabel}>
                      <View style={styles.rowLabelWrap}>
                        <Text
                          style={[
                            styles.rowLabel,
                            { color: disabled ? bodyColor : titleColor },
                            isSelected && !disabled && styles.rowLabelSelected,
                          ]}
                          numberOfLines={2}>
                          {item.modelDisplayName}
                        </Text>
                        {item.isRecommand ? (
                          <Text
                            style={[
                              styles.recommendBadge,
                              { color: disabled ? bodyColor : nrmTokens.color.primary },
                            ]}
                            numberOfLines={1}>
                            추천 {'\uD83D\uDC4D'}
                          </Text>
                        ) : null}
                      </View>
                      {isSelected && !disabled ? (
                        <Ionicons name="checkmark" size={20} color={nrmTokens.color.primary} />
                      ) : null}
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}
          </View>
        </View>
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
  root: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: nrmTokens.space.lg,
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
  },
  sheet: {
    width: '100%',
    maxWidth: 440,
    borderRadius: nrmTokens.radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    zIndex: 1,
  },
  header: {
    height: HEADER_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: nrmTokens.space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: {
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
  bodyState: {
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
  listContent: {
    paddingBottom: nrmTokens.space.md,
  },
  row: {
    minHeight: ROW_MIN_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: nrmTokens.space.sm,
    paddingVertical: nrmTokens.space.md,
    paddingHorizontal: nrmTokens.space.md,
  },
  rowDisabled: {
    opacity: 0.42,
  },
  rowLabelWrap: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  rowLabel: {
    flexShrink: 1,
    fontSize: nrmTokens.font.body,
  },
  recommendBadge: {
    flexShrink: 0,
    fontSize: nrmTokens.font.caption,
    fontWeight: '700',
  },
  rowLabelSelected: {
    fontWeight: '600',
  },
});
