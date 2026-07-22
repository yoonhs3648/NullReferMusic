import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

import { NrmMenuDrawerScroll } from '@/components/nrm/NrmMenuDrawerScroll';
import { NrmAdminLlmProviderPickerModal } from '@/components/nrm/settings/NrmAdminLlmProviderPickerModal';
import { NrmAdminMonthNavRow } from '@/components/nrm/settings/NrmAdminMonthNavRow';
import { NrmAdminUserPickerModal } from '@/components/nrm/settings/NrmAdminUserPickerModal';
import { nrmTokens } from '@/constants/nrmTokens';
import { notifyUserError } from '@/lib/nrmDevLog';
import {
  fetchAllLlmProvidersForAdmin,
  fetchLlmUserMonthlyAllocationRecord,
  setLlmUserTokenAllocation,
  type NrmLlmAdminProviderOption,
} from '@/lib/nrmLlmAdminTokenClient';
import { fetchLlmUsageMonthSnapshot, type NrmLlmUsageMonthSnapshot } from '@/lib/nrmLlmUsageClient';
import { nrmCurrentTargetMonth } from '@/lib/nrmLlmUsageMonth';
import type { NrmSupabaseLlmUserMonthlyAllocationRow } from '@/lib/nrmSupabaseDatabase.types';
import { notifyUser } from '@/lib/nrmUserNotify';
import type { NrmUserListEntry } from '@/lib/nrmUserListClient';

type Props = {
  titleColor: string;
  bodyColor: string;
  isDark: boolean;
  onBack: () => void;
};

const INPUT_BORDER = Platform.OS === 'web' ? StyleSheet.hairlineWidth : 1;

function MenuBackRow({ onPress }: { onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.backRow} accessibilityRole="button" accessibilityLabel="뒤로">
      <Ionicons name="chevron-back" size={22} color={nrmTokens.color.primary} />
      <Text style={styles.backText}>뒤로</Text>
    </Pressable>
  );
}

function formatUpdateDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function NrmAdminLlmTokenAllocationPanel({ titleColor, bodyColor, isDark, onBack }: Props) {
  const hairline = isDark ? nrmTokens.color.borderOnDark : nrmTokens.color.hairline;
  const inputBg = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)';

  const [targetMonth, setTargetMonth] = useState(() => nrmCurrentTargetMonth());
  const isCurrentMonth = targetMonth === nrmCurrentTargetMonth();

  const [providers, setProviders] = useState<NrmLlmAdminProviderOption[]>([]);
  const [providersLoading, setProvidersLoading] = useState(true);
  const [selectedProviderId, setSelectedProviderId] = useState<number | null>(null);
  const [providerPickerOpen, setProviderPickerOpen] = useState(false);

  const [selectedUser, setSelectedUser] = useState<NrmUserListEntry | null>(null);
  const [userPickerOpen, setUserPickerOpen] = useState(false);

  const [liveSnapshot, setLiveSnapshot] = useState<NrmLlmUsageMonthSnapshot | null>(null);
  const [historyRecord, setHistoryRecord] = useState<NrmSupabaseLlmUserMonthlyAllocationRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [allocatedInput, setAllocatedInput] = useState('0');
  const [isApprovedInput, setIsApprovedInput] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setProvidersLoading(true);
      try {
        const rows = await fetchAllLlmProvidersForAdmin();
        if (cancelled) return;
        setProviders(rows);
        setSelectedProviderId((prev) => prev ?? rows[0]?.providerId ?? null);
      } catch (e) {
        if (!cancelled) notifyUserError('admin.llmTokenAllocation', e, '제공자 목록을 불러오지 못했습니다.');
      } finally {
        if (!cancelled) setProvidersLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedProvider = useMemo(
    () => providers.find((p) => p.providerId === selectedProviderId) ?? null,
    [providers, selectedProviderId],
  );

  const load = useCallback(async () => {
    if (!selectedUser || selectedProviderId == null) {
      setLiveSnapshot(null);
      setHistoryRecord(null);
      return;
    }
    setLoading(true);
    try {
      if (isCurrentMonth) {
        const snapshot = await fetchLlmUsageMonthSnapshot(selectedUser.SerialNo, selectedProviderId, targetMonth);
        setLiveSnapshot(snapshot);
        setAllocatedInput(String(snapshot?.allocatedToken ?? 0));
        setIsApprovedInput(snapshot?.isApproved ?? false);
        setHistoryRecord(null);
      } else {
        const [snapshot, record] = await Promise.all([
          fetchLlmUsageMonthSnapshot(selectedUser.SerialNo, selectedProviderId, targetMonth),
          fetchLlmUserMonthlyAllocationRecord(selectedUser.SerialNo, selectedProviderId, targetMonth),
        ]);
        setLiveSnapshot(snapshot);
        setHistoryRecord(record);
      }
    } catch (e) {
      notifyUserError('admin.llmTokenAllocation', e, '할당 정보를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [selectedUser, selectedProviderId, targetMonth, isCurrentMonth]);

  useEffect(() => {
    void load();
  }, [load]);

  const onSave = useCallback(async () => {
    if (!selectedUser || selectedProviderId == null) {
      void notifyUser('사용자와 제공자를 선택하세요.');
      return;
    }
    const parsed = Number(allocatedInput.trim());
    if (!Number.isFinite(parsed) || parsed < 0) {
      void notifyUser('할당 토큰은 0 이상의 숫자로 입력하세요. (0 = 무제한)');
      return;
    }
    setSaving(true);
    try {
      await setLlmUserTokenAllocation({
        serialNo: selectedUser.SerialNo,
        providerId: selectedProviderId,
        targetMonth,
        allocatedToken: parsed,
        isApproved: isApprovedInput,
      });
      void notifyUser('토큰 할당이 저장되었습니다.');
      await load();
    } catch (e) {
      notifyUserError('admin.llmTokenAllocation', e, '저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  }, [selectedUser, selectedProviderId, targetMonth, allocatedInput, isApprovedInput, load]);

  return (
    <NrmMenuDrawerScroll>
      <MenuBackRow onPress={onBack} />
      <Text style={[styles.title, { color: titleColor }]}>AI토큰 할당</Text>

      <View style={styles.pickerFieldBlock}>
        <Text style={[styles.fieldLabel, { color: bodyColor }]}>사용자</Text>
        <Pressable
          onPress={() => setUserPickerOpen(true)}
          style={({ pressed }) => [
            styles.trigger,
            { borderColor: hairline, backgroundColor: inputBg },
            pressed && { opacity: 0.85 },
          ]}
          accessibilityRole="button">
          <View style={styles.triggerLeft}>
            <Ionicons name="person-outline" size={18} color={bodyColor} />
            <Text style={[styles.triggerLabel, { color: titleColor }]} numberOfLines={1}>
              {selectedUser ? `${selectedUser.userName} (${selectedUser.SerialNo})` : '사용자 선택'}
            </Text>
          </View>
          <Ionicons name="chevron-down" size={16} color={bodyColor} />
        </Pressable>
      </View>

      <View style={styles.pickerFieldBlock}>
        <Text style={[styles.fieldLabel, { color: bodyColor }]}>제공자</Text>
        <Pressable
          onPress={() => providers.length > 0 && setProviderPickerOpen(true)}
          disabled={providers.length === 0}
          style={({ pressed }) => [
            styles.trigger,
            { borderColor: hairline, backgroundColor: inputBg },
            pressed && providers.length > 0 && { opacity: 0.85 },
          ]}
          accessibilityRole="button">
          <View style={styles.triggerLeft}>
            <Ionicons name="cloud-outline" size={18} color={bodyColor} />
            <Text style={[styles.triggerLabel, { color: titleColor }]} numberOfLines={1}>
              {providersLoading ? '불러오는 중…' : selectedProvider?.providerName ?? '제공자 선택'}
            </Text>
          </View>
          <Ionicons name="chevron-down" size={16} color={bodyColor} />
        </Pressable>
      </View>

      <View style={styles.monthNavBlock}>
        <NrmAdminMonthNavRow
          targetMonth={targetMonth}
          onChange={setTargetMonth}
          titleColor={titleColor}
          bodyColor={bodyColor}
        />
      </View>

      {!selectedUser || selectedProviderId == null ? (
        <Text style={[styles.stateText, { color: bodyColor }]}>사용자와 제공자를 선택하세요.</Text>
      ) : loading ? (
        <ActivityIndicator color={nrmTokens.color.primary} style={styles.loader} />
      ) : (
        <>
          {liveSnapshot ? (
            <View style={[styles.usageHintBox, { borderColor: hairline }]}>
              <Text style={[styles.usageHintText, { color: bodyColor }]}>
                이번 달 사용량: {liveSnapshot.usedToken.toLocaleString()} 토큰
              </Text>
            </View>
          ) : null}

          {isCurrentMonth ? (
            <>
              <Text style={[styles.fieldLabel, { color: titleColor, marginTop: nrmTokens.space.sm }]}>
                할당 토큰 (0 = 무제한)
              </Text>
              <TextInput
                value={allocatedInput}
                onChangeText={(t) => setAllocatedInput(t.replace(/[^0-9]/g, ''))}
                keyboardType="number-pad"
                style={[styles.input, { color: titleColor, borderColor: hairline, backgroundColor: inputBg }]}
              />

              <View style={styles.switchRow}>
                <Text style={[styles.switchLabel, { color: titleColor }]}>사용 승인</Text>
                <Switch
                  value={isApprovedInput}
                  onValueChange={setIsApprovedInput}
                  trackColor={{ false: 'rgba(128,128,128,0.35)', true: nrmTokens.color.accentDim }}
                  thumbColor={isApprovedInput ? nrmTokens.color.accent : '#f4f4f5'}
                />
              </View>

              <Pressable
                onPress={() => void onSave()}
                disabled={saving}
                style={({ pressed }) => [
                  styles.saveBtn,
                  (pressed || saving) && styles.saveBtnPressed,
                ]}
                accessibilityRole="button">
                <Text style={styles.saveBtnLabel}>저장</Text>
              </Pressable>
            </>
          ) : (
            <View style={[styles.historyBox, { borderColor: hairline }]}>
              <Text style={[styles.historyTitle, { color: titleColor }]}>이 달의 할당 기록</Text>
              {historyRecord ? (
                <>
                  <Text style={[styles.historyValue, { color: titleColor }]}>
                    {historyRecord.AllocatedToken === 0
                      ? '무제한'
                      : `${historyRecord.AllocatedToken.toLocaleString()} 토큰`}
                  </Text>
                  <Text style={[styles.historyMeta, { color: bodyColor }]}>
                    최종 설정: {formatUpdateDate(historyRecord.UpdateDate)}
                  </Text>
                </>
              ) : (
                <Text style={[styles.historyMeta, { color: bodyColor }]}>
                  이 달에 대한 할당 기록이 없습니다.
                </Text>
              )}
              <Text style={[styles.historyNote, { color: bodyColor }]}>
                과거 월의 할당량은 조회만 가능합니다. 수정은 이번 달에서만 할 수 있습니다.
              </Text>
            </View>
          )}
        </>
      )}

      <Modal visible={saving} transparent animationType="none" statusBarTranslucent>
        <View style={styles.savingOverlay}>
          <ActivityIndicator size="large" color={nrmTokens.color.primary} />
        </View>
      </Modal>

      <NrmAdminLlmProviderPickerModal
        visible={providerPickerOpen}
        onClose={() => setProviderPickerOpen(false)}
        options={providers}
        selectedProviderId={selectedProviderId}
        onSelect={setSelectedProviderId}
        titleColor={titleColor}
        bodyColor={bodyColor}
        isDark={isDark}
      />

      <NrmAdminUserPickerModal
        visible={userPickerOpen}
        onClose={() => setUserPickerOpen(false)}
        onSelect={setSelectedUser}
        onClear={() => setSelectedUser(null)}
        titleColor={titleColor}
        bodyColor={bodyColor}
        isDark={isDark}
      />
    </NrmMenuDrawerScroll>
  );
}

const styles = StyleSheet.create({
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: nrmTokens.space.sm,
    marginBottom: nrmTokens.space.sm,
  },
  backText: {
    color: nrmTokens.color.primary,
    fontSize: nrmTokens.font.body,
    fontWeight: '500',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: nrmTokens.space.md,
  },
  pickerFieldBlock: {
    marginBottom: nrmTokens.space.sm,
  },
  fieldLabel: {
    fontSize: nrmTokens.font.caption,
    fontWeight: '600',
    marginBottom: 6,
  },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
    paddingHorizontal: nrmTokens.space.sm,
    borderRadius: nrmTokens.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  triggerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: nrmTokens.space.xs,
    flex: 1,
    minWidth: 0,
  },
  triggerLabel: {
    fontSize: nrmTokens.font.body,
    fontWeight: '600',
    flexShrink: 1,
  },
  monthNavBlock: {
    marginTop: nrmTokens.space.sm,
    marginBottom: nrmTokens.space.md,
  },
  stateText: {
    fontSize: nrmTokens.font.body,
    textAlign: 'center',
    paddingVertical: nrmTokens.space.lg,
    lineHeight: 22,
  },
  loader: {
    marginTop: nrmTokens.space.lg,
  },
  usageHintBox: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: nrmTokens.radius.md,
    paddingVertical: nrmTokens.space.sm,
    paddingHorizontal: nrmTokens.space.md,
  },
  usageHintText: {
    fontSize: nrmTokens.font.caption,
    fontWeight: '600',
  },
  input: {
    borderWidth: INPUT_BORDER,
    borderRadius: nrmTokens.radius.md,
    paddingHorizontal: nrmTokens.space.md,
    paddingVertical: nrmTokens.space.sm,
    fontSize: nrmTokens.font.body,
    minHeight: 44,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: nrmTokens.space.md,
  },
  switchLabel: {
    fontSize: nrmTokens.font.body,
    fontWeight: '600',
  },
  saveBtn: {
    marginTop: nrmTokens.space.xl,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    borderRadius: nrmTokens.radius.pill,
    backgroundColor: nrmTokens.color.primary,
  },
  saveBtnPressed: { opacity: 0.92 },
  saveBtnLabel: {
    color: nrmTokens.color.onPrimary,
    fontSize: nrmTokens.font.bodyStrong,
    fontWeight: '600',
  },
  savingOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  historyBox: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: nrmTokens.radius.md,
    padding: nrmTokens.space.md,
    gap: 6,
  },
  historyTitle: {
    fontSize: nrmTokens.font.body,
    fontWeight: '700',
  },
  historyValue: {
    fontSize: 22,
    fontWeight: '800',
  },
  historyMeta: {
    fontSize: nrmTokens.font.caption,
  },
  historyNote: {
    fontSize: nrmTokens.font.caption,
    marginTop: nrmTokens.space.xs,
    lineHeight: 18,
  },
});
