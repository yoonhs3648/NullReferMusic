import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { NrmAiLabUsageDonut } from '@/components/nrm/discover/NrmAiLabUsageDonut';
import { NrmMenuDrawerScroll } from '@/components/nrm/NrmMenuDrawerScroll';
import { NrmAdminLlmProviderPickerModal } from '@/components/nrm/settings/NrmAdminLlmProviderPickerModal';
import { NrmAdminMonthNavRow } from '@/components/nrm/settings/NrmAdminMonthNavRow';
import { NrmAdminUserPickerModal } from '@/components/nrm/settings/NrmAdminUserPickerModal';
import { nrmTokens } from '@/constants/nrmTokens';
import { logNrmRunError } from '@/lib/nrmDevLog';
import {
  fetchAllLlmProvidersForAdmin,
  fetchProviderQuotaSnapshot,
  type NrmLlmAdminProviderOption,
  type NrmLlmProviderQuotaSnapshot,
} from '@/lib/nrmLlmAdminTokenClient';
import {
  fetchLlmUsageMonthSnapshot,
  isNrmLlmAllocationUnlimited,
  type NrmLlmUsageMonthSnapshot,
} from '@/lib/nrmLlmUsageClient';
import { nrmCurrentTargetMonth } from '@/lib/nrmLlmUsageMonth';
import type { NrmUserListEntry } from '@/lib/nrmUserListClient';

type Props = {
  titleColor: string;
  bodyColor: string;
  isDark: boolean;
  onBack: () => void;
};

type LookupTab = 'all' | 'perUser';

function MenuBackRow({ onPress }: { onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.backRow} accessibilityRole="button" accessibilityLabel="뒤로">
      <Ionicons name="chevron-back" size={22} color={nrmTokens.color.primary} />
      <Text style={styles.backText}>뒤로</Text>
    </Pressable>
  );
}

export function NrmAdminLlmTokenLookupPanel({ titleColor, bodyColor, isDark, onBack }: Props) {
  const hairline = isDark ? nrmTokens.color.borderOnDark : nrmTokens.color.hairline;
  const inputBg = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)';
  const trackColor = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)';
  const tabTrackBg = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)';

  const [tab, setTab] = useState<LookupTab>('all');
  const [targetMonth, setTargetMonth] = useState(() => nrmCurrentTargetMonth());

  const [providers, setProviders] = useState<NrmLlmAdminProviderOption[]>([]);
  const [providersLoading, setProvidersLoading] = useState(true);
  const [selectedProviderId, setSelectedProviderId] = useState<number | null>(null);
  const [providerPickerOpen, setProviderPickerOpen] = useState(false);

  const [selectedUser, setSelectedUser] = useState<NrmUserListEntry | null>(null);
  const [userPickerOpen, setUserPickerOpen] = useState(false);

  const [quotaSnapshot, setQuotaSnapshot] = useState<NrmLlmProviderQuotaSnapshot | null>(null);
  const [aggregateLoading, setAggregateLoading] = useState(false);

  const [userSnapshot, setUserSnapshot] = useState<NrmLlmUsageMonthSnapshot | null>(null);
  const [userSnapshotLoading, setUserSnapshotLoading] = useState(false);

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
        if (!cancelled) logNrmRunError('admin.llmTokenLookup', e, { event: 'load-providers-failed' });
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

  const loadAggregate = useCallback(async () => {
    if (selectedProviderId == null) {
      setQuotaSnapshot(null);
      return;
    }
    setAggregateLoading(true);
    try {
      const result = await fetchProviderQuotaSnapshot(selectedProviderId, targetMonth);
      setQuotaSnapshot(result);
    } finally {
      setAggregateLoading(false);
    }
  }, [selectedProviderId, targetMonth]);

  useEffect(() => {
    if (tab === 'all') void loadAggregate();
  }, [tab, loadAggregate]);

  const loadUserSnapshot = useCallback(async () => {
    if (!selectedUser || selectedProviderId == null) {
      setUserSnapshot(null);
      return;
    }
    setUserSnapshotLoading(true);
    try {
      const result = await fetchLlmUsageMonthSnapshot(selectedUser.SerialNo, selectedProviderId, targetMonth);
      setUserSnapshot(result);
    } catch (e) {
      logNrmRunError('admin.llmTokenLookup', e, { event: 'load-user-snapshot-failed' });
      setUserSnapshot(null);
    } finally {
      setUserSnapshotLoading(false);
    }
  }, [selectedUser, selectedProviderId, targetMonth]);

  useEffect(() => {
    if (tab === 'perUser') void loadUserSnapshot();
  }, [tab, loadUserSnapshot]);

  // Google 등 공식 잔여쿼터 REST가 없어 availableToken=null → 도넛은 used만(percent=0) + 중앙에 사용량
  const allPercent = 0;
  const allProgressColor = nrmTokens.color.primary;

  const userUnlimited = userSnapshot ? isNrmLlmAllocationUnlimited(userSnapshot.allocatedToken) : false;
  const userPercent =
    userSnapshot && !userUnlimited && userSnapshot.allocatedToken > 0
      ? userSnapshot.usedToken / userSnapshot.allocatedToken
      : userUnlimited
        ? 1
        : 0;
  const userOverLimit =
    !userUnlimited && !!userSnapshot && userSnapshot.allocatedToken > 0 && userSnapshot.usedToken >= userSnapshot.allocatedToken;
  const userProgressColor = userOverLimit
    ? nrmTokens.color.danger
    : userUnlimited
      ? nrmTokens.color.success
      : nrmTokens.color.primary;

  return (
    <NrmMenuDrawerScroll>
      <MenuBackRow onPress={onBack} />
      <Text style={[styles.title, { color: titleColor }]}>AI토큰 조회</Text>

      <View style={[styles.tabTrack, { backgroundColor: tabTrackBg }]}>
        <Pressable
          onPress={() => setTab('all')}
          style={[styles.tabBtn, tab === 'all' && styles.tabBtnActive]}
          accessibilityRole="button"
          accessibilityState={{ selected: tab === 'all' }}>
          <Text style={[styles.tabBtnText, { color: tab === 'all' ? nrmTokens.color.onPrimary : titleColor }]}>
            전체
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setTab('perUser')}
          style={[styles.tabBtn, tab === 'perUser' && styles.tabBtnActive]}
          accessibilityRole="button"
          accessibilityState={{ selected: tab === 'perUser' }}>
          <Text
            style={[styles.tabBtnText, { color: tab === 'perUser' ? nrmTokens.color.onPrimary : titleColor }]}>
            사용자별
          </Text>
        </Pressable>
      </View>

      {tab === 'perUser' ? (
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
      ) : null}

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

      {tab === 'all' ? (
        <>
          <View style={styles.donutWrap}>
            {aggregateLoading ? (
              <ActivityIndicator color={nrmTokens.color.primary} />
            ) : quotaSnapshot ? (
              <NrmAiLabUsageDonut percent={allPercent} trackColor={trackColor} progressColor={allProgressColor}>
                <Text style={[styles.donutCenterMain, { color: titleColor }]}>
                  {quotaSnapshot.usedToken.toLocaleString()}
                </Text>
                <Text style={[styles.donutCenterSub, { color: bodyColor }]}>사용(앱)</Text>
              </NrmAiLabUsageDonut>
            ) : null}
          </View>

          {quotaSnapshot ? (
            <View style={styles.statBlock}>
              <View style={styles.statRow}>
                <Text style={[styles.statLabel, { color: bodyColor }]}>사용한 토큰(앱)</Text>
                <Text style={[styles.statValue, { color: titleColor }]}>
                  {quotaSnapshot.usedToken.toLocaleString()}
                </Text>
              </View>
              <View style={[styles.statRow, styles.statRowDivider, { borderTopColor: hairline }]}>
                <Text style={[styles.statLabel, { color: bodyColor }]}>Google 한도</Text>
                <Text style={[styles.statValue, { color: titleColor }]}>AI Studio에서 확인</Text>
              </View>
              <View style={[styles.statRow, styles.statRowDivider, { borderTopColor: hairline }]}>
                <Text style={[styles.statLabel, { color: bodyColor }]}>참여 사용자 수</Text>
                <Text style={[styles.statValue, { color: titleColor }]}>
                  {quotaSnapshot.userCount.toLocaleString()}명
                </Text>
              </View>
            </View>
          ) : null}
        </>
      ) : (
        <>
          {!selectedUser ? (
            <Text style={[styles.stateText, { color: bodyColor }]}>사용자를 선택하세요.</Text>
          ) : (
            <>
              <View style={styles.donutWrap}>
                {userSnapshotLoading ? (
                  <ActivityIndicator color={nrmTokens.color.primary} />
                ) : userSnapshot && !userSnapshot.isApproved ? (
                  <Text style={[styles.stateText, { color: bodyColor }]}>
                    {'이 제공자에 대한 사용 권한이 없습니다.'}
                  </Text>
                ) : userSnapshot ? (
                  <NrmAiLabUsageDonut
                    percent={userPercent}
                    trackColor={trackColor}
                    progressColor={userProgressColor}>
                    {userUnlimited ? (
                      <>
                        <Ionicons name="infinite" size={30} color={userProgressColor} />
                        <Text style={[styles.donutCenterSub, { color: bodyColor }]}>무제한</Text>
                      </>
                    ) : (
                      <>
                        <Text style={[styles.donutCenterMain, { color: titleColor }]}>
                          {Math.round(Math.min(userPercent, 1) * 100)}%
                        </Text>
                        <Text style={[styles.donutCenterSub, { color: bodyColor }]}>사용</Text>
                      </>
                    )}
                  </NrmAiLabUsageDonut>
                ) : null}
              </View>

              {userSnapshot && userSnapshot.isApproved ? (
                <View style={styles.statBlock}>
                  <View style={styles.statRow}>
                    <Text style={[styles.statLabel, { color: bodyColor }]}>사용한 토큰</Text>
                    <Text style={[styles.statValue, { color: titleColor }]}>
                      {userSnapshot.usedToken.toLocaleString()}
                    </Text>
                  </View>
                  <View style={[styles.statRow, styles.statRowDivider, { borderTopColor: hairline }]}>
                    <Text style={[styles.statLabel, { color: bodyColor }]}>할당된 토큰</Text>
                    <Text style={[styles.statValue, { color: titleColor }]}>
                      {userUnlimited ? '무제한' : userSnapshot.allocatedToken.toLocaleString()}
                    </Text>
                  </View>
                  {!userUnlimited ? (
                    <View style={[styles.statRow, styles.statRowDivider, { borderTopColor: hairline }]}>
                      <Text style={[styles.statLabel, { color: bodyColor }]}>남은 토큰</Text>
                      <Text
                        style={[
                          styles.statValue,
                          { color: userOverLimit ? nrmTokens.color.danger : titleColor },
                        ]}>
                        {Math.max(userSnapshot.allocatedToken - userSnapshot.usedToken, 0).toLocaleString()}
                      </Text>
                    </View>
                  ) : null}
                </View>
              ) : null}
            </>
          )}
        </>
      )}

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
  tabTrack: {
    flexDirection: 'row',
    borderRadius: nrmTokens.radius.pill,
    padding: 3,
    marginBottom: nrmTokens.space.md,
  },
  tabBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: nrmTokens.radius.pill,
  },
  tabBtnActive: {
    backgroundColor: nrmTokens.color.primary,
  },
  tabBtnText: {
    fontSize: nrmTokens.font.body,
    fontWeight: '600',
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
    marginBottom: nrmTokens.space.xs,
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
});
