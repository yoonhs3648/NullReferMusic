import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

import { NrmMenuDrawerScroll } from '@/components/nrm/NrmMenuDrawerScroll';
import { nrmTokens } from '@/constants/nrmTokens';
import {
  fetchMusicSyncAdminOverview,
  type NrmMusicAdminOverview,
} from '@/lib/nrmMusicSyncAdminClient';
import {
  fetchAllSystemSchedules,
  fetchSystemSchedules,
  jobKindLabel,
  runSystemScheduleNow,
  setSystemScheduleEnabled,
  updateSystemSchedule,
} from '@/lib/nrmSystemScheduleAdminClient';
import type {
  NrmSupabaseMusicScheduleRunRow,
  NrmSupabaseSystemScheduleRow,
} from '@/lib/nrmSupabaseDatabase.types';
import { notifyUserError } from '@/lib/nrmDevLog';
import { notifyUser } from '@/lib/nrmUserNotify';

type Props = {
  titleColor: string;
  bodyColor: string;
  isDark: boolean;
  onBack: () => void;
};

type Tab = 'schedules' | 'runs' | 'failures';
const TABS: { id: Tab; label: string }[] = [
  { id: 'schedules', label: '스케줄' },
  { id: 'runs', label: '실행' },
  { id: 'failures', label: '실패' },
];
const PAGE_SIZE = 20;
const RUN_PAGE_SIZE = 10;
const INPUT_BORDER = Platform.OS === 'web' ? StyleSheet.hairlineWidth : 1;
const INTERVAL_MIN = 1;
const INTERVAL_MAX = 1440;

function numberValue(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('ko-KR');
}

function formatBytes(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function timingLabel(row: Pick<NrmSupabaseSystemScheduleRow, 'schedule_kind' | 'daily_time_kst' | 'interval_minutes'>): string {
  return row.schedule_kind === 'daily'
    ? `매일 ${row.daily_time_kst ?? '—'} KST`
    : `${row.interval_minutes ?? '—'}분 간격`;
}

function isSuccessfulRun(run: NrmSupabaseMusicScheduleRunRow): boolean {
  return run.run_status === 'completed' || run.run_status === 'partial';
}

function isFailedRun(run: NrmSupabaseMusicScheduleRunRow): boolean {
  return run.run_status === 'failed' || run.failure_count > 0 || Boolean(run.error_message);
}

function BackRow({ onBack }: { onBack: () => void }) {
  return (
    <Pressable onPress={onBack} style={styles.backRow} accessibilityRole="button">
      <Ionicons name="chevron-back" size={22} color={nrmTokens.color.primary} />
      <Text style={styles.backText}>뒤로</Text>
    </Pressable>
  );
}

function ActionButton({
  label,
  onPress,
  disabled,
  secondary,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.actionButton,
        secondary ? styles.actionButtonSecondary : styles.actionButtonPrimary,
        (pressed || disabled) && styles.dimmed,
      ]}>
      <Text style={secondary ? styles.actionTextSecondary : styles.actionTextPrimary}>{label}</Text>
    </Pressable>
  );
}

function Field({
  label,
  value,
  onChangeText,
  titleColor,
  bodyColor,
  isDark,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  titleColor: string;
  bodyColor: string;
  isDark: boolean;
  keyboardType?: 'default' | 'number-pad';
}) {
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: bodyColor }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        placeholderTextColor={bodyColor}
        style={[
          styles.input,
          {
            color: titleColor,
            borderColor: isDark ? nrmTokens.color.borderOnDark : nrmTokens.color.hairline,
            backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)',
          },
        ]}
      />
    </View>
  );
}

function DetailRow({
  label,
  value,
  titleColor,
  bodyColor,
}: {
  label: string;
  value: string;
  titleColor: string;
  bodyColor: string;
}) {
  return (
    <View style={styles.detailRow}>
      <Text style={[styles.detailLabel, { color: bodyColor }]}>{label}</Text>
      <Text style={[styles.detailValue, { color: titleColor }]}>{value}</Text>
    </View>
  );
}

function ScheduleEditor({
  row,
  titleColor,
  bodyColor,
  isDark,
  onCancel,
  onSaved,
}: {
  row: NrmSupabaseSystemScheduleRow;
  titleColor: string;
  bodyColor: string;
  isDark: boolean;
  onCancel: () => void;
  onSaved: () => Promise<void>;
}) {
  const isRetention =
    row.job_kind === 'ailab_chat_retention' || row.job_kind === 'track_history_retention';
  const [scheduleKind, setScheduleKind] = useState<'daily' | 'interval'>(row.schedule_kind);
  const [dailyTime, setDailyTime] = useState(row.daily_time_kst ?? '09:00:00');
  const [intervalMinutes, setIntervalMinutes] = useState(
    Math.min(INTERVAL_MAX, Math.max(INTERVAL_MIN, row.interval_minutes ?? 60)),
  );
  const [enabled, setEnabled] = useState(row.is_enabled);
  const [retentionDays, setRetentionDays] = useState(
    row.retention_days ?? (row.job_kind === 'track_history_retention' ? 180 : 30),
  );
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (scheduleKind === 'interval' && (intervalMinutes < INTERVAL_MIN || intervalMinutes > INTERVAL_MAX)) {
      void notifyUser(`실행 간격은 ${INTERVAL_MIN}~${INTERVAL_MAX}분이어야 합니다.`);
      return;
    }
    if (isRetention && (retentionDays < 1 || retentionDays > 3650)) {
      void notifyUser('보관 일수는 1~3650이어야 합니다.');
      return;
    }

    setSaving(true);
    try {
      if (isRetention) {
        await updateSystemSchedule(row.schedule_id, {
          schedule_kind: scheduleKind,
          daily_time_kst: scheduleKind === 'daily' ? dailyTime : null,
          interval_minutes: scheduleKind === 'interval' ? intervalMinutes : null,
          is_enabled: enabled,
          retention_days: retentionDays,
        });
      } else {
        await updateSystemSchedule(row.schedule_id, {
          schedule_kind: scheduleKind,
          daily_time_kst: scheduleKind === 'daily' ? dailyTime : null,
          interval_minutes: scheduleKind === 'interval' ? intervalMinutes : null,
          is_enabled: enabled,
        });
      }
      void notifyUser('스케줄을 저장했습니다.');
      await onSaved();
      onCancel();
    } catch (error) {
      notifyUserError('admin.systemSchedule.save', error, '스케줄을 저장하지 못했습니다.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View
      style={[
        styles.editor,
        {
          borderColor: isDark ? nrmTokens.color.borderOnDark : nrmTokens.color.hairline,
          backgroundColor: isDark ? 'rgba(255,255,255,0.035)' : '#fafafa',
        },
      ]}>
      <Text style={[styles.editorTitle, { color: titleColor }]}>스케줄 수정</Text>
      <Text style={[styles.meta, { color: bodyColor }]}>
        {row.display_name}
      </Text>
      <Text style={[styles.meta, { color: bodyColor, marginBottom: nrmTokens.space.sm }]}>
        {jobKindLabel(row.job_kind)} · 실행 주기와 활성 여부만 변경할 수 있습니다.
      </Text>

      <View style={styles.choiceRow}>
        {(['daily', 'interval'] as const).map((kind) => (
          <Pressable
            key={kind}
            onPress={() => setScheduleKind(kind)}
            style={[styles.choice, scheduleKind === kind && styles.choiceActive]}>
            <Text style={{ color: scheduleKind === kind ? nrmTokens.color.onPrimary : titleColor }}>
              {kind === 'daily' ? '매일' : '간격'}
            </Text>
          </Pressable>
        ))}
      </View>
      {scheduleKind === 'daily' ? (
        <Field
          label="실행 시각 (KST, HH:MM:SS)"
          value={dailyTime}
          onChangeText={setDailyTime}
          {...{ titleColor, bodyColor, isDark }}
        />
      ) : (
        <Field
          label={`실행 간격 (분, ${INTERVAL_MIN}~${INTERVAL_MAX})`}
          value={String(intervalMinutes)}
          onChangeText={(v) => setIntervalMinutes(numberValue(v, 60))}
          keyboardType="number-pad"
          {...{ titleColor, bodyColor, isDark }}
        />
      )}
      {isRetention ? (
        <Field
          label="보관 일수 (해당 일 이전 채팅 삭제)"
          value={String(retentionDays)}
          onChangeText={(v) => setRetentionDays(numberValue(v, 30))}
          keyboardType="number-pad"
          {...{ titleColor, bodyColor, isDark }}
        />
      ) : null}
      <View style={styles.switchRow}>
        <Text style={[styles.bodyStrong, { color: titleColor }]}>활성화</Text>
        <Switch value={enabled} onValueChange={setEnabled} />
      </View>

      <View style={styles.actions}>
        <ActionButton label="취소" onPress={onCancel} secondary />
        <ActionButton label={saving ? '저장 중…' : '저장'} onPress={() => void save()} disabled={saving} />
      </View>
    </View>
  );
}

function RunSummaryCard({
  run,
  scheduleName,
  titleColor,
  bodyColor,
  isDark,
  tone,
  onPress,
}: {
  run: NrmSupabaseMusicScheduleRunRow;
  scheduleName: string;
  titleColor: string;
  bodyColor: string;
  isDark: boolean;
  tone: 'success' | 'failure';
  onPress: () => void;
}) {
  const accent = tone === 'failure' ? nrmTokens.color.danger : nrmTokens.color.success;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        {
          borderColor: isDark ? nrmTokens.color.borderOnDark : nrmTokens.color.hairline,
          opacity: pressed ? 0.85 : 1,
        },
      ]}>
      <View style={styles.cardHead}>
        <View style={styles.flex}>
          <Text style={[styles.cardTitle, { color: titleColor }]}>{scheduleName}</Text>
          <Text style={[styles.meta, { color: bodyColor }]}>{formatDate(run.started_at)}</Text>
        </View>
        <Text style={[styles.badge, { color: accent }]}>{run.run_status}</Text>
      </View>
      <Text style={[styles.meta, { color: bodyColor }]}>
        {tone === 'success'
          ? `발견 ${run.discovered_count} · 삽입 ${run.inserted_count} · 갱신 ${run.updated_count}`
          : run.error_message
            ? run.error_message
            : `실패 ${run.failure_count}건`}
      </Text>
      <Text style={[styles.meta, { color: nrmTokens.color.primary }]}>상세 보기</Text>
    </Pressable>
  );
}

function RunDetailView({
  run,
  scheduleName,
  titleColor,
  bodyColor,
  isDark,
  onBack,
}: {
  run: NrmSupabaseMusicScheduleRunRow;
  scheduleName: string;
  titleColor: string;
  bodyColor: string;
  isDark: boolean;
  onBack: () => void;
}) {
  return (
    <View>
      <BackRow onBack={onBack} />
      <Text style={[styles.editorTitle, { color: titleColor }]}>{scheduleName}</Text>
      <View
        style={[
          styles.detailCard,
          {
            borderColor: isDark ? nrmTokens.color.borderOnDark : nrmTokens.color.hairline,
            backgroundColor: isDark ? 'rgba(255,255,255,0.035)' : '#fafafa',
          },
        ]}>
        <DetailRow label="상태" value={run.run_status} {...{ titleColor, bodyColor }} />
        <DetailRow label="시작" value={formatDate(run.started_at)} {...{ titleColor, bodyColor }} />
        <DetailRow label="종료" value={formatDate(run.finished_at)} {...{ titleColor, bodyColor }} />
        <DetailRow label="수집 기간" value={`${run.date_from} ~ ${run.date_to}`} {...{ titleColor, bodyColor }} />
        <DetailRow label="요청" value={String(run.request_count)} {...{ titleColor, bodyColor }} />
        <DetailRow label="발견" value={String(run.discovered_count)} {...{ titleColor, bodyColor }} />
        <DetailRow label="삽입" value={String(run.inserted_count)} {...{ titleColor, bodyColor }} />
        <DetailRow label="갱신" value={String(run.updated_count)} {...{ titleColor, bodyColor }} />
        <DetailRow label="중복" value={String(run.duplicate_count)} {...{ titleColor, bodyColor }} />
        <DetailRow label="실패" value={String(run.failure_count)} {...{ titleColor, bodyColor }} />
        <DetailRow
          label="용량"
          value={`${formatBytes(run.capacity_before_bytes)} → ${formatBytes(run.capacity_after_bytes)}`}
          {...{ titleColor, bodyColor }}
        />
        {run.error_message ? (
          <View style={styles.detailBlock}>
            <Text style={[styles.detailLabel, { color: bodyColor }]}>오류</Text>
            <Text style={styles.errorText}>{run.error_message}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

export function NrmAdminMusicBrainzSyncPanel({
  titleColor,
  bodyColor,
  isDark,
  onBack,
}: Props) {
  const [tab, setTab] = useState<Tab>('schedules');
  const [overview, setOverview] = useState<NrmMusicAdminOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(0);
  const [runPage, setRunPage] = useState(0);
  const [failurePage, setFailurePage] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingSchedule, setEditingSchedule] = useState<NrmSupabaseSystemScheduleRow | undefined>(undefined);
  const [systemSchedules, setSystemSchedules] = useState<NrmSupabaseSystemScheduleRow[]>([]);
  const [selectedRun, setSelectedRun] = useState<NrmSupabaseMusicScheduleRunRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [nextOverview, schedules] = await Promise.all([
        fetchMusicSyncAdminOverview(Math.max(PAGE_SIZE, 50), 0),
        fetchSystemSchedules(PAGE_SIZE, page * PAGE_SIZE),
      ]);
      setOverview(nextOverview);
      setSystemSchedules(schedules);
    } catch (loadError) {
      setOverview(null);
      setSystemSchedules([]);
      setError(loadError instanceof Error ? loadError.message : '관리자 정보를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setSelectedRun(null);
  }, [tab]);

  const scheduleNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of systemSchedules) {
      if (row.music_schedule) map.set(row.music_schedule.schedule_id, row.display_name);
    }
    for (const row of overview?.schedules ?? []) {
      if (!map.has(row.schedule_id)) map.set(row.schedule_id, row.display_name);
    }
    return map;
  }, [overview?.schedules, systemSchedules]);

  const successRuns = useMemo(
    () => (overview?.recentRuns ?? []).filter(isSuccessfulRun),
    [overview?.recentRuns],
  );
  const failureRuns = useMemo(
    () => (overview?.recentRuns ?? []).filter(isFailedRun),
    [overview?.recentRuns],
  );

  const toggleAll = async (enabled: boolean) => {
    setBusyId('master');
    try {
      const schedules = await fetchAllSystemSchedules();
      await Promise.all(schedules.map((item) => setSystemScheduleEnabled(item.schedule_id, enabled)));
      await load();
    } catch (toggleError) {
      notifyUserError('admin.systemSchedule.master', toggleError, '스케줄 전체 상태를 바꾸지 못했습니다.');
    } finally {
      setBusyId(null);
    }
  };

  const toggleSchedule = async (row: NrmSupabaseSystemScheduleRow, enabled: boolean) => {
    setBusyId(row.schedule_id);
    try {
      await setSystemScheduleEnabled(row.schedule_id, enabled);
      await load();
    } catch (toggleError) {
      notifyUserError('admin.systemSchedule.toggle', toggleError, '스케줄 상태를 바꾸지 못했습니다.');
    } finally {
      setBusyId(null);
    }
  };

  const runNow = async (scheduleId: string) => {
    setBusyId(`run:${scheduleId}`);
    try {
      const queued = await runSystemScheduleNow(scheduleId);
      void notifyUser(queued ? '즉시 실행을 예약했습니다.' : '활성화된 스케줄만 즉시 실행할 수 있습니다.');
      await load();
    } catch (runError) {
      notifyUserError('admin.systemSchedule.runNow', runError, '즉시 실행을 예약하지 못했습니다.');
    } finally {
      setBusyId(null);
    }
  };

  const renderSchedules = () => {
    if (editingSchedule) {
      return (
        <ScheduleEditor
          row={editingSchedule}
          {...{ titleColor, bodyColor, isDark }}
          onCancel={() => setEditingSchedule(undefined)}
          onSaved={load}
        />
      );
    }
    return (
      <>
        <View style={styles.summaryRow}>
          <View>
            <Text style={[styles.bodyStrong, { color: titleColor }]}>시스템 스케줄</Text>
            <Text style={[styles.meta, { color: bodyColor }]}>
              등록·삭제 없음 · 주기와 on/off만 편집
            </Text>
          </View>
          <Switch
            value={systemSchedules.length > 0 && systemSchedules.every((item) => item.is_enabled)}
            onValueChange={(value) => void toggleAll(value)}
            disabled={busyId === 'master' || systemSchedules.length === 0}
          />
        </View>
        {systemSchedules.length === 0 ? (
          <Text style={[styles.empty, { color: bodyColor }]}>등록된 스케줄이 없습니다.</Text>
        ) : (
          systemSchedules.map((row) => (
            <View
              key={row.schedule_id}
              style={[
                styles.card,
                { borderColor: isDark ? nrmTokens.color.borderOnDark : nrmTokens.color.hairline },
              ]}>
              <View style={styles.cardHead}>
                <View style={styles.flex}>
                  <Text style={[styles.cardTitle, { color: titleColor }]}>{row.display_name}</Text>
                  <Text style={[styles.meta, { color: bodyColor }]}>{jobKindLabel(row.job_kind)}</Text>
                </View>
                <Switch
                  value={row.is_enabled}
                  onValueChange={(value) => void toggleSchedule(row, value)}
                  disabled={busyId === row.schedule_id}
                />
              </View>
              <Text style={[styles.stats, { color: titleColor }]}>{timingLabel(row)}</Text>
              <Text style={[styles.meta, { color: bodyColor }]}>다음 실행 {formatDate(row.next_run_at)}</Text>
              {row.job_kind === 'ailab_chat_retention' ? (
                <Text style={[styles.meta, { color: bodyColor }]}>
                  보관 {row.retention_days ?? '—'}일 이전 채팅 삭제
                </Text>
              ) : null}
              {row.job_kind === 'track_history_retention' ? (
                <Text style={[styles.meta, { color: bodyColor }]}>
                  보관 {row.retention_days ?? '—'}일 이전 Track History 삭제
                </Text>
              ) : null}
              <View style={styles.actions}>
                <ActionButton label="수정" onPress={() => setEditingSchedule(row)} secondary />
                <ActionButton
                  label={busyId === `run:${row.schedule_id}` ? '예약 중…' : '즉시 실행'}
                  onPress={() => void runNow(row.schedule_id)}
                  disabled={!row.is_enabled || busyId != null}
                />
              </View>
            </View>
          ))
        )}
        <View style={styles.pager}>
          <ActionButton
            label="이전"
            onPress={() => setPage((value) => Math.max(0, value - 1))}
            disabled={page === 0}
            secondary
          />
          <Text style={[styles.meta, { color: bodyColor }]}>{page + 1} 페이지</Text>
          <ActionButton
            label="다음"
            onPress={() => setPage((value) => value + 1)}
            disabled={systemSchedules.length < PAGE_SIZE}
            secondary
          />
        </View>
      </>
    );
  };

  const renderRunList = (mode: 'success' | 'failure') => {
    const allRuns = mode === 'success' ? successRuns : failureRuns;
    const currentPage = mode === 'success' ? runPage : failurePage;
    const setCurrentPage = mode === 'success' ? setRunPage : setFailurePage;
    const visible = allRuns.slice(currentPage * RUN_PAGE_SIZE, (currentPage + 1) * RUN_PAGE_SIZE);

    if (selectedRun) {
      return (
        <RunDetailView
          run={selectedRun}
          scheduleName={scheduleNames.get(selectedRun.schedule_id) ?? selectedRun.schedule_id}
          {...{ titleColor, bodyColor, isDark }}
          onBack={() => setSelectedRun(null)}
        />
      );
    }

    if (visible.length === 0) {
      return (
        <Text style={[styles.empty, { color: bodyColor }]}>
          {mode === 'success' ? '성공한 실행 기록이 없습니다.' : '실패한 실행 기록이 없습니다.'}
        </Text>
      );
    }

    return (
      <>
        {visible.map((run) => (
          <RunSummaryCard
            key={run.schedule_run_id}
            run={run}
            scheduleName={scheduleNames.get(run.schedule_id) ?? run.schedule_id}
            tone={mode}
            onPress={() => setSelectedRun(run)}
            {...{ titleColor, bodyColor, isDark }}
          />
        ))}
        <View style={styles.pager}>
          <ActionButton
            label="이전"
            onPress={() => setCurrentPage((value) => Math.max(0, value - 1))}
            disabled={currentPage === 0}
            secondary
          />
          <Text style={[styles.meta, { color: bodyColor }]}>{currentPage + 1} 페이지</Text>
          <ActionButton
            label="다음"
            onPress={() => setCurrentPage((value) => value + 1)}
            disabled={(currentPage + 1) * RUN_PAGE_SIZE >= allRuns.length}
            secondary
          />
        </View>
      </>
    );
  };

  return (
    <NrmMenuDrawerScroll>
      <BackRow onBack={onBack} />
      <View style={styles.titleRow}>
        <View style={styles.flex}>
          <Text style={[styles.title, { color: titleColor }]}>시스템 스케줄 관리</Text>
          <Text style={[styles.meta, { color: bodyColor }]}>
            MusicBrainz 수집 · AI Lab 채팅 삭제 · 대기 {overview?.pendingJobs ?? 0}개
          </Text>
        </View>
        <Pressable onPress={() => void load()} disabled={loading} style={styles.refresh}>
          <Ionicons name="refresh" size={20} color={nrmTokens.color.primary} />
        </Pressable>
      </View>
      <View style={styles.tabs}>
        {TABS.map((item) => (
          <Pressable
            key={item.id}
            onPress={() => setTab(item.id)}
            style={[styles.tab, tab === item.id && styles.tabActive]}>
            <Text
              style={[
                styles.tabText,
                { color: tab === item.id ? nrmTokens.color.onPrimary : bodyColor },
              ]}>
              {item.label}
            </Text>
          </Pressable>
        ))}
      </View>
      {loading ? (
        <ActivityIndicator color={nrmTokens.color.primary} style={styles.loader} />
      ) : error ? (
        <View style={styles.stateBlock}>
          <Text style={styles.errorText}>{error}</Text>
          <ActionButton label="다시 시도" onPress={() => void load()} />
        </View>
      ) : (
        <>
          {tab === 'schedules' ? renderSchedules() : null}
          {tab === 'runs' ? renderRunList('success') : null}
          {tab === 'failures' ? renderRunList('failure') : null}
        </>
      )}
    </NrmMenuDrawerScroll>
  );
}

const styles = StyleSheet.create({
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: nrmTokens.space.sm,
    marginBottom: nrmTokens.space.xs,
  },
  backText: { color: nrmTokens.color.primary, fontSize: nrmTokens.font.body, fontWeight: '500' },
  titleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: nrmTokens.space.md },
  title: { fontSize: 20, fontWeight: '700' },
  flex: { flex: 1, minWidth: 0 },
  refresh: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  tabs: { flexDirection: 'row', gap: 4, marginBottom: nrmTokens.space.md },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: nrmTokens.radius.pill,
    backgroundColor: 'rgba(128,128,128,0.12)',
  },
  tabActive: { backgroundColor: nrmTokens.color.primary },
  tabText: { fontSize: 12, fontWeight: '700' },
  loader: { marginVertical: nrmTokens.space.xl },
  stateBlock: { gap: nrmTokens.space.md, paddingVertical: nrmTokens.space.lg },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: nrmTokens.space.sm,
  },
  bodyStrong: { fontSize: nrmTokens.font.body, fontWeight: '600' },
  meta: { fontSize: nrmTokens.font.caption, lineHeight: 19 },
  stats: { fontSize: nrmTokens.font.caption, lineHeight: 20, fontWeight: '600', marginTop: 4 },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: nrmTokens.radius.md,
    padding: nrmTokens.space.md,
    marginTop: nrmTokens.space.sm,
    gap: 3,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: nrmTokens.space.sm },
  cardTitle: { fontSize: nrmTokens.font.body, fontWeight: '700' },
  badge: { fontSize: 12, fontWeight: '700' },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: nrmTokens.space.xs,
    marginTop: nrmTokens.space.sm,
  },
  actionButton: {
    minHeight: 38,
    paddingHorizontal: nrmTokens.space.md,
    borderRadius: nrmTokens.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: nrmTokens.space.xs,
  },
  actionButtonPrimary: { backgroundColor: nrmTokens.color.primary },
  actionButtonSecondary: { backgroundColor: 'rgba(0,102,204,0.12)' },
  actionTextPrimary: {
    color: nrmTokens.color.onPrimary,
    fontWeight: '700',
    fontSize: nrmTokens.font.caption,
  },
  actionTextSecondary: {
    color: nrmTokens.color.primary,
    fontWeight: '700',
    fontSize: nrmTokens.font.caption,
  },
  dimmed: { opacity: 0.5 },
  empty: {
    fontSize: nrmTokens.font.body,
    lineHeight: 23,
    textAlign: 'center',
    paddingVertical: nrmTokens.space.xl,
  },
  errorText: { color: nrmTokens.color.danger, fontSize: nrmTokens.font.caption, lineHeight: 20, marginTop: 4 },
  pager: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginVertical: nrmTokens.space.md,
  },
  editor: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: nrmTokens.radius.md,
    padding: nrmTokens.space.md,
  },
  editorTitle: {
    fontSize: nrmTokens.font.bodyStrong,
    fontWeight: '700',
    marginBottom: nrmTokens.space.sm,
  },
  field: { marginBottom: nrmTokens.space.sm },
  fieldLabel: { fontSize: nrmTokens.font.caption, fontWeight: '600', marginBottom: 5 },
  input: {
    minHeight: 42,
    borderWidth: INPUT_BORDER,
    borderRadius: nrmTokens.radius.md,
    paddingHorizontal: nrmTokens.space.sm,
    paddingVertical: 8,
    fontSize: nrmTokens.font.caption,
  },
  choiceRow: { flexDirection: 'row', gap: nrmTokens.space.xs, marginBottom: nrmTokens.space.sm },
  choice: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 9,
    borderRadius: nrmTokens.radius.pill,
    backgroundColor: 'rgba(128,128,128,0.12)',
  },
  choiceActive: { backgroundColor: nrmTokens.color.primary },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
  },
  detailCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: nrmTokens.radius.md,
    padding: nrmTokens.space.md,
    gap: 10,
  },
  detailRow: { gap: 2 },
  detailLabel: { fontSize: 12, fontWeight: '600' },
  detailValue: { fontSize: nrmTokens.font.body, lineHeight: 22 },
  detailBlock: { gap: 4, marginTop: 4 },
});
