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

import { NrmAiLabUsageDonut } from '@/components/nrm/discover/NrmAiLabUsageDonut';
import { nrmTokens } from '@/constants/nrmTokens';
import { logNrmRunError } from '@/lib/nrmDevLog';
import { fetchLlmModelsForAiLab } from '@/lib/nrmLlmModelClient';
import {
  fetchLlmUsageMonthSnapshot,
  fetchLlmUsageProviderOptions,
  isNrmLlmAllocationUnlimited,
  type NrmLlmUsageMonthSnapshot,
  type NrmLlmUsageProviderOption,
} from '@/lib/nrmLlmUsageClient';
import {
  nrmCurrentTargetMonth,
  nrmFormatTargetMonthLabel,
  nrmIsFutureTargetMonth,
  nrmShiftTargetMonth,
} from '@/lib/nrmLlmUsageMonth';
import { getNrmModalScrimColor } from '@/lib/nrmUiAppearanceColors';

type Props = {
  isDark: boolean;
  /** 앱 SerialNo (LLM 관련 테이블용). null이면 아직 확정되지 않음. */
  serialNo: string | null;
  /**
   * AI Lab에서 현재 선택된 모델(LLMModel.ModelID).
   * 승인된 제공자 목록에서 해당 모델의 providerId를 찾아 기본 선택값으로 쓴다.
   */
  preferredModelId?: number | null;
};

/** AI Lab 좌측 메뉴 「사용량 조회」 — 제공자별 월간 할당/사용 토큰을 도넛 차트로 표시. */
export function NrmAiLabUsagePanel({ isDark, serialNo, preferredModelId = null }: Props) {
  const { height: windowHeight } = useWindowDimensions();
  const titleColor = isDark ? nrmTokens.color.bodyOnDark : nrmTokens.color.ink;
  const bodyColor = isDark ? nrmTokens.color.textMuted : nrmTokens.color.inkMuted80;
  const hairline = isDark ? nrmTokens.color.borderOnDark : nrmTokens.color.hairline;
  const rowHover = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)';
  const inputBg = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)';
  const sheetBg = isDark ? nrmTokens.color.surfaceTile2 : nrmTokens.color.canvas;
  const trackColor = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)';

  const [options, setOptions] = useState<NrmLlmUsageProviderOption[]>([]);
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [selectedProviderId, setSelectedProviderId] = useState<number | null>(null);
  const [preferredProviderId, setPreferredProviderId] = useState<number | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const [targetMonth, setTargetMonth] = useState(() => nrmCurrentTargetMonth());
  const [snapshot, setSnapshot] = useState<NrmLlmUsageMonthSnapshot | null>(null);
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (preferredModelId == null) {
        if (!cancelled) setPreferredProviderId(null);
        return;
      }
      try {
        const models = await fetchLlmModelsForAiLab();
        const model = models.find((m) => m.modelId === preferredModelId);
        if (!cancelled) setPreferredProviderId(model?.providerId ?? null);
      } catch (e) {
        logNrmRunError('ailab.usage', e, { event: 'resolve-preferred-provider-failed' });
        if (!cancelled) setPreferredProviderId(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [preferredModelId]);

  const loadOptions = useCallback(async () => {
    if (!serialNo) {
      setOptions([]);
      setOptionsLoading(false);
      return;
    }
    setOptionsLoading(true);
    setOptionsError(null);
    try {
      const rows = await fetchLlmUsageProviderOptions(serialNo);
      setOptions(rows);
      if (rows.length === 0) {
        setOptionsError('사용 가능한 제공자가 없습니다. 관리자에게 문의해주세요.');
      }
    } catch (e) {
      logNrmRunError('ailab.usage', e, { event: 'load-options-failed' });
      setOptions([]);
      setOptionsError('제공자 목록을 불러오지 못했습니다.');
    } finally {
      setOptionsLoading(false);
    }
  }, [serialNo]);

  useEffect(() => {
    void loadOptions();
  }, [loadOptions]);

  useEffect(() => {
    setSelectedProviderId(null);
  }, [serialNo]);

  useEffect(() => {
    if (selectedProviderId != null || options.length === 0) return;
    const preferred =
      preferredProviderId != null
        ? options.find((o) => o.providerId === preferredProviderId)
        : undefined;
    setSelectedProviderId((preferred ?? options[0]).providerId);
  }, [options, preferredProviderId, selectedProviderId]);

  const loadSnapshot = useCallback(async () => {
    if (!serialNo || selectedProviderId == null) {
      setSnapshot(null);
      return;
    }
    setSnapshotLoading(true);
    setSnapshotError(null);
    try {
      const result = await fetchLlmUsageMonthSnapshot(serialNo, selectedProviderId, targetMonth);
      setSnapshot(result);
      if (!result) setSnapshotError('사용량을 불러오지 못했습니다.');
    } catch (e) {
      logNrmRunError('ailab.usage', e, { event: 'load-snapshot-failed' });
      setSnapshot(null);
      setSnapshotError('사용량을 불러오지 못했습니다.');
    } finally {
      setSnapshotLoading(false);
    }
  }, [serialNo, selectedProviderId, targetMonth]);

  useEffect(() => {
    void loadSnapshot();
  }, [loadSnapshot]);

  const selectedOption = useMemo(
    () => options.find((o) => o.providerId === selectedProviderId) ?? null,
    [options, selectedProviderId],
  );

  const filteredOptions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.providerName.toLowerCase().includes(q));
  }, [options, searchQuery]);

  const showPickerSearch = options.length > 6;
  /** NrmAdminLlmProviderPickerModal 과 동일 — maxHeight만 주면 Android에서 FlatList가 0px로 접힌다. */
  const pickerCardHeight = Math.min(
    windowHeight * 0.55,
    Math.max(
      200,
      52 + (showPickerSearch ? 48 : 0) + filteredOptions.length * 64 + nrmTokens.space.md,
    ),
  );

  const unlimited = snapshot ? isNrmLlmAllocationUnlimited(snapshot.allocatedToken) : false;
  const percent =
    snapshot && !unlimited && snapshot.allocatedToken > 0
      ? snapshot.usedToken / snapshot.allocatedToken
      : unlimited
        ? 1
        : 0;
  const overLimit =
    !unlimited &&
    !!snapshot &&
    snapshot.allocatedToken > 0 &&
    snapshot.usedToken >= snapshot.allocatedToken;

  const progressColor = overLimit
    ? nrmTokens.color.danger
    : unlimited
      ? nrmTokens.color.success
      : nrmTokens.color.primary;

  const isFuture = nrmIsFutureTargetMonth(targetMonth);

  const renderOptionRow = useCallback(
    ({ item }: ListRenderItemInfo<NrmLlmUsageProviderOption>) => {
      const isSelected = item.providerId === selectedProviderId;
      return (
        <Pressable
          onPress={() => {
            setPickerOpen(false);
            if (item.providerId !== selectedProviderId) setSelectedProviderId(item.providerId);
          }}
          style={({ pressed }) => [
            styles.optionRow,
            isSelected && {
              backgroundColor: isDark ? 'rgba(0,102,204,0.22)' : 'rgba(0,102,204,0.10)',
            },
            pressed && !isSelected && { backgroundColor: rowHover },
          ]}
          accessibilityRole="button"
          accessibilityState={{ selected: isSelected }}
          accessibilityLabel={item.providerName}>
          <View style={styles.optionTextWrap}>
            <Text
              style={[
                styles.optionLabel,
                { color: titleColor },
                isSelected && styles.optionLabelSelected,
              ]}
              numberOfLines={2}>
              {item.providerName}
            </Text>
            <Text style={[styles.optionHint, { color: bodyColor }]}>
              {isNrmLlmAllocationUnlimited(item.allocatedToken)
                ? '무제한'
                : `할당 ${item.allocatedToken.toLocaleString()} 토큰`}
            </Text>
          </View>
          {isSelected ? (
            <Ionicons name="checkmark" size={20} color={nrmTokens.color.primary} />
          ) : null}
        </Pressable>
      );
    },
    [bodyColor, isDark, rowHover, selectedProviderId, titleColor],
  );

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={() => options.length > 0 && setPickerOpen(true)}
        disabled={options.length === 0}
        style={({ pressed }) => [
          styles.modelTrigger,
          { borderColor: hairline, backgroundColor: inputBg },
          pressed && options.length > 0 && { opacity: 0.85 },
        ]}
        accessibilityRole="button"
        accessibilityLabel={`제공자 ${selectedOption?.providerName ?? ''}`}>
        <View style={styles.modelTriggerLeft}>
          <Ionicons name="cloud-outline" size={18} color={bodyColor} />
          <Text style={[styles.modelTriggerLabel, { color: titleColor }]} numberOfLines={1}>
            {optionsLoading ? '불러오는 중…' : selectedOption?.providerName ?? '제공자 선택'}
          </Text>
        </View>
        {options.length > 0 ? (
          <Ionicons name="chevron-down" size={16} color={bodyColor} />
        ) : null}
      </Pressable>

      {optionsError && options.length === 0 ? (
        <Text style={[styles.stateText, { color: bodyColor }]}>{optionsError}</Text>
      ) : (
        <>
          <View style={styles.monthNav}>
            <Pressable
              onPress={() => setTargetMonth((m) => nrmShiftTargetMonth(m, -1))}
              hitSlop={10}
              style={({ pressed }) => [styles.monthNavBtn, pressed && { opacity: 0.7 }]}
              accessibilityRole="button"
              accessibilityLabel="이전 달">
              <Ionicons name="chevron-back" size={20} color={titleColor} />
            </Pressable>
            <Text style={[styles.monthLabel, { color: titleColor }]}>
              {nrmFormatTargetMonthLabel(targetMonth)}
            </Text>
            <Pressable
              onPress={() => !isFuture && setTargetMonth((m) => nrmShiftTargetMonth(m, 1))}
              disabled={isFuture}
              hitSlop={10}
              style={({ pressed }) => [
                styles.monthNavBtn,
                pressed && !isFuture && { opacity: 0.7 },
                isFuture && styles.monthNavBtnDisabled,
              ]}
              accessibilityRole="button"
              accessibilityLabel="다음 달">
              <Ionicons
                name="chevron-forward"
                size={20}
                color={isFuture ? bodyColor : titleColor}
              />
            </Pressable>
          </View>

          <View style={styles.donutWrap}>
            {snapshotLoading ? (
              <ActivityIndicator color={nrmTokens.color.primary} />
            ) : snapshotError ? (
              <Text style={[styles.stateText, { color: bodyColor }]}>{snapshotError}</Text>
            ) : snapshot && !snapshot.isApproved ? (
              <Text style={[styles.stateText, { color: bodyColor }]}>
                {'이 제공자에 대한 사용 권한이 없습니다.\n관리자에게 문의해주세요.'}
              </Text>
            ) : snapshot ? (
              <NrmAiLabUsageDonut
                percent={percent}
                trackColor={trackColor}
                progressColor={progressColor}>
                {unlimited ? (
                  <>
                    <Ionicons name="infinite" size={30} color={progressColor} />
                    <Text style={[styles.donutCenterSub, { color: bodyColor }]}>무제한</Text>
                  </>
                ) : (
                  <>
                    <Text style={[styles.donutCenterMain, { color: titleColor }]}>
                      {Math.round(Math.min(percent, 1) * 100)}%
                    </Text>
                    <Text style={[styles.donutCenterSub, { color: bodyColor }]}>사용</Text>
                  </>
                )}
              </NrmAiLabUsageDonut>
            ) : null}
          </View>

          {snapshot && snapshot.isApproved ? (
            <View style={styles.statBlock}>
              <View style={styles.statRow}>
                <Text style={[styles.statLabel, { color: bodyColor }]}>사용한 토큰</Text>
                <Text style={[styles.statValue, { color: titleColor }]}>
                  {snapshot.usedToken.toLocaleString()}
                </Text>
              </View>
              <View style={[styles.statRow, styles.statRowDivider, { borderTopColor: hairline }]}>
                <Text style={[styles.statLabel, { color: bodyColor }]}>사용 가능한 토큰</Text>
                <Text style={[styles.statValue, { color: titleColor }]}>
                  {unlimited ? '무제한' : snapshot.allocatedToken.toLocaleString()}
                </Text>
              </View>
              {!unlimited ? (
                <View
                  style={[styles.statRow, styles.statRowDivider, { borderTopColor: hairline }]}>
                  <Text style={[styles.statLabel, { color: bodyColor }]}>남은 토큰</Text>
                  <Text
                    style={[
                      styles.statValue,
                      { color: overLimit ? nrmTokens.color.danger : titleColor },
                    ]}>
                    {Math.max(snapshot.allocatedToken - snapshot.usedToken, 0).toLocaleString()}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </>
      )}

      <Modal
        visible={pickerOpen}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setPickerOpen(false)}>
        <Pressable
          style={[styles.pickerBackdrop, { backgroundColor: getNrmModalScrimColor(isDark) }]}
          onPress={() => setPickerOpen(false)}>
          {/* onStartShouldSetResponder(raw) 대신 Pressable no-op — 안드로이드에서 FlatList가
              끝에 도달한 뒤 위로 스크롤하는 새 제스처를 responder에게 빼앗기는 문제 방지 */}
          <Pressable
            onPress={() => {}}
            style={[
              styles.pickerCard,
              {
                height: pickerCardHeight,
                backgroundColor: sheetBg,
                borderColor: hairline,
              },
            ]}>
            <View style={[styles.pickerHeader, { borderColor: hairline }]}>
              <Text style={[styles.pickerTitle, { color: titleColor }]}>제공자 선택</Text>
              <Pressable
                onPress={() => setPickerOpen(false)}
                hitSlop={8}
                style={({ pressed }) => [styles.pickerClose, pressed && { opacity: 0.7 }]}
                accessibilityRole="button"
                accessibilityLabel="닫기">
                <Ionicons name="close" size={22} color={bodyColor} />
              </Pressable>
            </View>
            {showPickerSearch ? (
              <View
                style={[
                  styles.pickerSearchBox,
                  { borderColor: hairline, backgroundColor: inputBg },
                ]}>
                <Ionicons name="search-outline" size={18} color={bodyColor} />
                <TextInput
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="제공자 이름 검색"
                  placeholderTextColor={isDark ? '#6b7288' : '#9ca3af'}
                  style={[styles.pickerSearchInput, { color: titleColor }]}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            ) : null}
            {filteredOptions.length === 0 ? (
              <View style={styles.pickerEmpty}>
                <Text style={[styles.pickerEmptyText, { color: bodyColor }]}>
                  검색 결과가 없습니다.
                </Text>
              </View>
            ) : (
              <FlatList
                style={styles.pickerList}
                data={filteredOptions}
                keyExtractor={(item) => String(item.providerId)}
                renderItem={renderOptionRow}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={Platform.OS !== 'web'}
                contentContainerStyle={styles.pickerListContent}
              />
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: nrmTokens.space.md,
  },
  modelTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
    paddingHorizontal: nrmTokens.space.sm,
    borderRadius: nrmTokens.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  modelTriggerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: nrmTokens.space.xs,
    flex: 1,
    minWidth: 0,
  },
  modelTriggerLabel: {
    fontSize: nrmTokens.font.body,
    fontWeight: '600',
    flexShrink: 1,
  },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: nrmTokens.space.md,
  },
  monthNavBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: nrmTokens.radius.pill,
  },
  monthNavBtnDisabled: {
    opacity: 0.35,
  },
  monthLabel: {
    fontSize: nrmTokens.font.body,
    fontWeight: '700',
    minWidth: 110,
    textAlign: 'center',
  },
  donutWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 200,
    paddingVertical: nrmTokens.space.sm,
  },
  donutCenterMain: {
    fontSize: 28,
    fontWeight: '800',
  },
  donutCenterSub: {
    fontSize: nrmTokens.font.caption,
    fontWeight: '600',
    marginTop: 2,
  },
  statBlock: {
    borderRadius: nrmTokens.radius.md,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: nrmTokens.space.sm,
  },
  statRowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  statLabel: {
    fontSize: nrmTokens.font.body,
  },
  statValue: {
    fontSize: nrmTokens.font.body,
    fontWeight: '700',
  },
  stateText: {
    fontSize: nrmTokens.font.body,
    textAlign: 'center',
    paddingVertical: nrmTokens.space.lg,
    lineHeight: 22,
  },
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
  pickerSearchBox: {
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
  pickerSearchInput: {
    flex: 1,
    fontSize: nrmTokens.font.body,
    paddingVertical: Platform.OS === 'ios' ? 8 : 6,
  },
  /** 고정 height 카드 안에서 목록이 보이도록 flex:1 (maxHeight만 쓰면 Android에서 0px). */
  pickerList: {
    flex: 1,
  },
  pickerListContent: {
    paddingBottom: nrmTokens.space.md,
  },
  pickerEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: nrmTokens.space.md,
  },
  pickerEmptyText: {
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
});
