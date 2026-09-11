import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import {
  ActivityIndicator,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
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
  fetchMusicScheduleRunFailures,
  fetchMusicScheduleRunInserts,
  fetchMusicScheduleRunJobs,
  fetchMusicSyncAdminOverview,
  type NrmMusicAdminOverview,
} from '@/lib/nrmMusicSyncAdminClient';
import {
  fetchAllSystemSchedules,
  jobKindLabel,
  runSystemScheduleNow,
  setSystemScheduleEnabled,
  updateSystemSchedule,
  type NrmSystemScheduleKind,
} from '@/lib/nrmSystemScheduleAdminClient';
import type {
  NrmSupabaseMusicAdminQueueDueSchedule,
  NrmSupabaseMusicAdminQueueOpenJob,
  NrmSupabaseMusicScheduleRunFailureRow,
  NrmSupabaseMusicScheduleRunInsertRow,
  NrmSupabaseMusicScheduleRunJobCount,
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
const RUN_BATCH_SIZE = 12;
const INSERT_PAGE_SIZE = 40;
const JOB_STATUS_ORDER = [
  'processing',
  'pending',
  'retry',
  'completed',
  'dead',
  'quarantined',
  'blocked',
];
const ATTENTION_JOB_STATUSES = new Set([
  'processing',
  'pending',
  'retry',
  'dead',
  'quarantined',
  'blocked',
]);
const WEEKDAY_LABELS = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
const SCHEDULE_KIND_CHOICES: { id: NrmSystemScheduleKind; label: string }[] = [
  { id: 'daily', label: '매일' },
  { id: 'weekly', label: '매주' },
  { id: 'monthly', label: '매월' },
  { id: 'once', label: '1회' },
  { id: 'interval', label: '매분' },
];
const INPUT_BORDER = Platform.OS === 'web' ? StyleSheet.hairlineWidth : 1;

function kstTodayYmd(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function normalizeTimeKst(raw: string | null | undefined): string {
  const value = (raw ?? '09:00:00').trim();
  const match = value.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return '09:00:00';
  const hour = Math.min(23, Math.max(0, Number(match[1]))).toString().padStart(2, '0');
  return `${hour}:${match[2]}:${match[3] ?? '00'}`;
}

function numberValue(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('ko-KR');
}

function timingLabel(
  row: Pick<
    NrmSupabaseSystemScheduleRow,
    'schedule_kind' | 'daily_time_kst' | 'interval_minutes' | 'weekly_weekday' | 'monthly_day' | 'once_on_date'
  >,
): string {
  const time = row.daily_time_kst ?? '—';
  if (row.schedule_kind === 'weekly') {
    const weekday = WEEKDAY_LABELS[row.weekly_weekday ?? 0] ?? '일요일';
    return `매주 ${weekday} ${time} KST`;
  }
  if (row.schedule_kind === 'monthly') {
    return `매월 ${row.monthly_day ?? 1}일 ${time} KST`;
  }
  if (row.schedule_kind === 'once') {
    return `${row.once_on_date ?? '—'} ${time} KST (1회)`;
  }
  if (row.schedule_kind === 'interval') {
    return `매 ${row.interval_minutes ?? 60}분`;
  }
  return `매일 ${time} KST`;
}

function isMb503RetryRun(run: NrmSupabaseMusicScheduleRunRow): boolean {
  return (
    run.schedule_key === 'musicbrainz-mb-503-retry' ||
    run.display_name === 'MusicBrainz 503 재시도'
  );
}

function mb503RetryShouldFailTab(run: NrmSupabaseMusicScheduleRunRow): boolean {
  if (!isMb503RetryRun(run) || run.run_status === 'running') return false;
  return (
    Number(run.failure_count) > 0 ||
    run.run_status === 'partial' ||
    run.run_status === 'failed' ||
    run.run_status === 'cancelled'
  );
}

function runStatusLabel(
  status: NrmSupabaseMusicScheduleRunRow['run_status'],
  run?: NrmSupabaseMusicScheduleRunRow,
): string {
  if (run && mb503RetryShouldFailTab(run) && status === 'completed') return '실패';
  switch (status) {
    case 'running':
      return '진행중';
    case 'completed':
      return '완료';
    case 'partial':
      return '부분성공';
    case 'failed':
      return '실패';
    case 'cancelled':
      return '취소';
    default:
      return status;
  }
}

function isExecutionRun(run: NrmSupabaseMusicScheduleRunRow): boolean {
  if (mb503RetryShouldFailTab(run)) return false;
  return run.run_status === 'running' || run.run_status === 'completed';
}

function isFailureRun(run: NrmSupabaseMusicScheduleRunRow): boolean {
  if (mb503RetryShouldFailTab(run)) return true;
  return (
    run.run_status === 'partial' ||
    run.run_status === 'failed' ||
    run.run_status === 'cancelled'
  );
}

function isRetentionRun(run: NrmSupabaseMusicScheduleRunRow): boolean {
  return (
    run.job_kind === 'ailab_chat_retention' ||
    run.job_kind === 'track_history_retention' ||
    run.job_kind === 'ops_cleanup'
  );
}

function resultNumber(result: Record<string, unknown> | null | undefined, key: string): number {
  const value = result?.[key];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function resultBool(result: Record<string, unknown> | null | undefined, key: string): boolean {
  const value = result?.[key];
  return value === true || value === 'true';
}

function resultErrorCount(result: Record<string, unknown> | null | undefined): number {
  const errors = result?.errors;
  return Array.isArray(errors) ? errors.length : 0;
}

function retentionDeletedCounts(run: NrmSupabaseMusicScheduleRunRow): Array<{ label: string; value: string }> {
  if (run.job_kind === 'ops_cleanup') {
    const logs =
      resultNumber(run.result, 'deleted_logs') +
      resultNumber(run.result, 'deleted_cron_logs') +
      resultNumber(run.result, 'deleted_pg_net_logs');
    const storage = resultNumber(run.result, 'deleted_storage_objects');
    const history =
      resultNumber(run.result, 'deleted_music_runs') +
      resultNumber(run.result, 'deleted_system_runs') +
      resultNumber(run.result, 'deleted_sync_jobs') +
      resultNumber(run.result, 'deleted_sync_runs') +
      resultNumber(run.result, 'deleted_dead_letters') +
      resultNumber(run.result, 'deleted_capacity_events') +
      resultNumber(run.result, 'deleted_capacity_snapshots');
    const rows: Array<{ label: string; value: string }> = [];
    if (logs > 0) rows.push({ label: '로그 삭제', value: `${logs}건` });
    if (storage > 0) rows.push({ label: 'Storage 삭제', value: `${storage}건` });
    if (history > 0) rows.push({ label: '스케줄 이력 삭제', value: `${history}건` });
    if (resultBool(run.result, 'truncated')) {
      rows.push({ label: '한도', value: '이번 실행에서 일부가 남아 다음 달에 이어서 지웁니다.' });
    }
    const errorCount = resultErrorCount(run.result);
    if (errorCount > 0) rows.push({ label: '단계 오류', value: `${errorCount}건` });
    return rows;
  }
  if (run.job_kind === 'ailab_chat_retention') {
    const sessions = resultNumber(run.result, 'deleted_sessions');
    const messages = resultNumber(run.result, 'deleted_messages');
    const tokens = resultNumber(run.result, 'deleted_token_history');
    const rows: Array<{ label: string; value: string }> = [];
    if (sessions > 0) rows.push({ label: '삭제 세션', value: String(sessions) });
    if (messages > 0) rows.push({ label: '삭제 메시지', value: String(messages) });
    if (tokens > 0) rows.push({ label: '삭제 토큰이력', value: String(tokens) });
    return rows;
  }
  if (run.job_kind === 'track_history_retention') {
    const deleted = resultNumber(run.result, 'deleted_rows');
    return deleted > 0 ? [{ label: '삭제', value: `${deleted}건` }] : [];
  }
  return [];
}

function retentionRunSummary(run: NrmSupabaseMusicScheduleRunRow): string {
  if (run.run_status === 'running') return '스케줄러 큐에서 처리 중';
  if (run.error_message) return run.error_message;
  const deleted = retentionDeletedCounts(run);
  if (deleted.length === 0) {
    return run.run_status === 'completed' ? '확인할 이상이 없습니다.' : runStatusLabel(run.run_status, run);
  }
  return deleted.map((row) => `${row.label} ${row.value}`).join(' · ');
}

function isTagRefreshRun(run: NrmSupabaseMusicScheduleRunRow): boolean {
  return run.schedule_key === 'musicbrainz-lastfm-tag-refresh';
}

function musicScheduleIdFromSystem(row: NrmSupabaseSystemScheduleRow): string | null {
  const nested = row.music_schedule?.schedule_id?.trim();
  if (nested) return nested;
  const fromConfig = row.config.music_schedule_id;
  return typeof fromConfig === 'string' && fromConfig.trim() !== '' ? fromConfig.trim() : null;
}

function isUuidLike(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim());
}

function pickScheduleName(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    const named = value?.trim();
    if (named && !isUuidLike(named)) return named;
  }
  return null;
}

function resolveRunTitle(
  run: NrmSupabaseMusicScheduleRunRow,
  namesById: Map<string, string>,
): string {
  const named = pickScheduleName(
    run.display_name,
    namesById.get(run.schedule_id),
    run.schedule_key ? namesById.get(run.schedule_key) : undefined,
  );
  if (named) return named;
  if (run.job_kind === 'ailab_chat_retention') return 'AI Lab 채팅 삭제';
  if (run.job_kind === 'track_history_retention') return 'Track History 삭제';
  if (run.job_kind === 'ops_cleanup') return '운영 데이터 정리';
  return 'MusicBrainz 수집';
}

function resolveOpenJobTitle(
  job: { display_name?: string | null; schedule_id?: string | null },
  namesById: Map<string, string>,
): string {
  return pickScheduleName(
    job.display_name,
    job.schedule_id ? namesById.get(job.schedule_id) : undefined,
  ) ?? '수집 작업';
}

function jobStatusLabel(status: string): string {
  switch (status) {
    case 'pending':
      return '대기';
    case 'retry':
      return '재시도';
    case 'processing':
      return '처리중';
    case 'completed':
      return '완료';
    case 'dead':
    case 'quarantined':
      return '실패';
    case 'blocked':
      return '차단';
    default:
      return status;
  }
}

function syncJobKindLabel(kind: string): string {
  switch (kind) {
    case 'lastfm_artist_pool':
      return 'Last.fm 아티스트';
    case 'lastfm_track_pool':
      return 'Last.fm 트랙';
    case 'lastfm_tags':
      return 'Last.fm 태그';
    case 'lastfm_tag_refresh':
      return '태그 갱신';
    case 'mb_catalog_track_resolve':
      return '카탈로그 매칭';
    case 'mb_discovery':
      return '발매 검색';
    case 'mb_release_hydrate':
      return '릴리스 적재';
    case 'mb_recording_hydrate':
      return '녹음 적재';
    case 'mb_upcoming_verify':
      return '발매예정 검증';
    default:
      return kind;
  }
}

function runJobCountLabel(item: NrmSupabaseMusicScheduleRunJobCount): string {
  return `${syncJobKindLabel(item.job_kind)} ${jobStatusLabel(item.job_status)}`;
}

function collapseAttentionJobStatus(status: string): string {
  return status === 'dead' || status === 'quarantined' ? 'dead' : status;
}

function mergeAttentionJobCounts(
  items: NrmSupabaseMusicScheduleRunJobCount[],
): NrmSupabaseMusicScheduleRunJobCount[] {
  const merged = new Map<string, NrmSupabaseMusicScheduleRunJobCount>();
  for (const item of items) {
    const job_status = collapseAttentionJobStatus(item.job_status);
    const key = `${item.job_kind}:${job_status}`;
    const previous = merged.get(key);
    if (previous) {
      previous.job_count += item.job_count;
    } else {
      merged.set(key, { ...item, job_status });
    }
  }
  return sortRunJobCounts([...merged.values()]);
}

function formatFailureReason(item: NrmSupabaseMusicScheduleRunFailureRow): string {
  const status = (item.job_status ?? '').trim();
  const message = (item.error_message ?? '').trim();
  if (status === 'dead' || status === 'quarantined' || status === 'blocked') {
    return `(${status}) ${message}`;
  }
  return message;
}

function sortRunJobCounts(
  items: NrmSupabaseMusicScheduleRunJobCount[],
): NrmSupabaseMusicScheduleRunJobCount[] {
  return [...items].sort((left, right) => {
    const kind = left.job_kind.localeCompare(right.job_kind);
    if (kind !== 0) return kind;
    const leftOrder = JOB_STATUS_ORDER.indexOf(left.job_status);
    const rightOrder = JOB_STATUS_ORDER.indexOf(right.job_status);
    return (leftOrder < 0 ? 99 : leftOrder) - (rightOrder < 0 ? 99 : rightOrder);
  });
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
  const [scheduleKind, setScheduleKind] = useState<NrmSystemScheduleKind>(row.schedule_kind);
  const [dailyTime, setDailyTime] = useState(normalizeTimeKst(row.daily_time_kst));
  const [weeklyWeekday, setWeeklyWeekday] = useState(row.weekly_weekday ?? 0);
  const [monthlyDay, setMonthlyDay] = useState(
    Math.min(31, Math.max(1, row.monthly_day ?? 1)),
  );
  const [onceOnDate, setOnceOnDate] = useState(row.once_on_date ?? kstTodayYmd());
  const [intervalMinutes, setIntervalMinutes] = useState(
    Math.min(10080, Math.max(1, row.interval_minutes ?? 60)),
  );
  const [enabled, setEnabled] = useState(row.is_enabled);
  const [retentionDays, setRetentionDays] = useState(
    row.retention_days ?? (row.job_kind === 'track_history_retention' ? 180 : 30),
  );
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const time = normalizeTimeKst(dailyTime);
    if (scheduleKind === 'weekly' && (weeklyWeekday < 0 || weeklyWeekday > 6)) {
      void notifyUser('매주 실행 요일을 선택하세요.');
      return;
    }
    if (scheduleKind === 'monthly' && (monthlyDay < 1 || monthlyDay > 31)) {
      void notifyUser('매월 실행 일자는 1~31이어야 합니다.');
      return;
    }
    if (scheduleKind === 'once' && !/^\d{4}-\d{2}-\d{2}$/.test(onceOnDate)) {
      void notifyUser('1회 실행 날짜는 YYYY-MM-DD 형식이어야 합니다.');
      return;
    }
    if (scheduleKind === 'interval' && (intervalMinutes < 1 || intervalMinutes > 10080)) {
      void notifyUser('매분 간격은 1~10080분이어야 합니다.');
      return;
    }
    if (isRetention && (retentionDays < 1 || retentionDays > 3650)) {
      void notifyUser('보관 일수는 1~3650이어야 합니다.');
      return;
    }

    setSaving(true);
    try {
      const timing = {
        schedule_kind: scheduleKind,
        daily_time_kst: scheduleKind === 'interval' ? null : time,
        interval_minutes: scheduleKind === 'interval' ? intervalMinutes : null,
        weekly_weekday: scheduleKind === 'weekly' ? weeklyWeekday : null,
        monthly_day: scheduleKind === 'monthly' ? monthlyDay : null,
        once_on_date: scheduleKind === 'once' ? onceOnDate : null,
        is_enabled: enabled,
      };
      if (isRetention) {
        await updateSystemSchedule(row.schedule_id, {
          ...timing,
          retention_days: retentionDays,
        });
      } else {
        await updateSystemSchedule(row.schedule_id, timing);
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
        {jobKindLabel(row.job_kind)} · 매일/매주/매월/1회/매분 주기와 활성 여부만 변경할 수 있습니다.
      </Text>

      <View style={styles.choiceRow}>
        {SCHEDULE_KIND_CHOICES.map((kind) => (
          <Pressable
            key={kind.id}
            onPress={() => setScheduleKind(kind.id)}
            style={[styles.choice, scheduleKind === kind.id && styles.choiceActive]}>
            <Text style={{ color: scheduleKind === kind.id ? nrmTokens.color.onPrimary : titleColor }}>
              {kind.label}
            </Text>
          </Pressable>
        ))}
      </View>
      {scheduleKind === 'weekly' ? (
        <View style={styles.field}>
          <Text style={[styles.fieldLabel, { color: bodyColor }]}>요일</Text>
          <View style={styles.weekdayRow}>
            {WEEKDAY_LABELS.map((label, index) => (
              <Pressable
                key={label}
                onPress={() => setWeeklyWeekday(index)}
                style={[styles.weekday, weeklyWeekday === index && styles.choiceActive]}>
                <Text
                  style={{
                    color: weeklyWeekday === index ? nrmTokens.color.onPrimary : titleColor,
                    fontSize: 12,
                    fontWeight: '700',
                  }}>
                  {label.replace('요일', '')}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}
      {scheduleKind === 'monthly' ? (
        <>
          <Field
            label="일자 (1~31)"
            value={String(monthlyDay)}
            onChangeText={(v) => setMonthlyDay(Math.min(31, Math.max(1, numberValue(v, 1))))}
            keyboardType="number-pad"
            {...{ titleColor, bodyColor, isDark }}
          />
          <Text style={[styles.meta, { color: bodyColor, marginBottom: nrmTokens.space.sm }]}>
            해당 월에 없는 날짜는 말일에 실행합니다.
          </Text>
        </>
      ) : null}
      {scheduleKind === 'once' ? (
        <Field
          label="실행 날짜 (KST, YYYY-MM-DD)"
          value={onceOnDate}
          onChangeText={setOnceOnDate}
          {...{ titleColor, bodyColor, isDark }}
        />
      ) : null}
      {scheduleKind === 'interval' ? (
        <>
          <Field
            label="간격 (분)"
            value={String(intervalMinutes)}
            onChangeText={(v) => setIntervalMinutes(Math.min(10080, Math.max(1, numberValue(v, 60))))}
            keyboardType="number-pad"
            {...{ titleColor, bodyColor, isDark }}
          />
          <Text style={[styles.meta, { color: bodyColor, marginBottom: nrmTokens.space.sm }]}>
            60이면 1시간마다 실행합니다. 1~10080분(7일)입니다.
          </Text>
        </>
      ) : (
        <Field
          label="실행 시각 (KST, HH:MM:SS)"
          value={dailyTime}
          onChangeText={setDailyTime}
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

function QueueStatusCard({
  collectionBusy,
  dueSchedules,
  openJobs,
  runningRuns,
  scheduleNames,
  titleColor,
  bodyColor,
  isDark,
  onSelectRun,
}: {
  collectionBusy: boolean;
  dueSchedules: NrmSupabaseMusicAdminQueueDueSchedule[];
  openJobs: NrmSupabaseMusicAdminQueueOpenJob[];
  runningRuns: NrmSupabaseMusicScheduleRunRow[];
  scheduleNames: Map<string, string>;
  titleColor: string;
  bodyColor: string;
  isDark: boolean;
  onSelectRun: (run: NrmSupabaseMusicScheduleRunRow) => void;
}) {
  const hasQueue =
    dueSchedules.length > 0 || openJobs.length > 0 || runningRuns.length > 0;

  return (
    <View
      style={[
        styles.card,
        {
          borderColor: isDark ? nrmTokens.color.borderOnDark : nrmTokens.color.hairline,
          backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)',
          marginTop: 0,
          marginBottom: nrmTokens.space.sm,
        },
      ]}>
      <View style={styles.cardHead}>
        <Text style={[styles.cardTitle, { color: titleColor }]}>스케줄러 큐</Text>
        <Text style={[styles.badge, { color: collectionBusy ? nrmTokens.color.primary : bodyColor }]}>
          {collectionBusy ? '처리중' : '대기열'}
        </Text>
      </View>

      {!hasQueue ? (
        <Text style={[styles.meta, { color: bodyColor }]}>현재 큐에 대기·진행 중인 작업이 없습니다.</Text>
      ) : null}

      {runningRuns.length > 0 ? (
        <View style={styles.queueSection}>
          <Text style={[styles.queueSectionTitle, { color: titleColor }]}>진행중</Text>
          {runningRuns.map((run) => (
            <Pressable key={run.schedule_run_id} onPress={() => onSelectRun(run)} style={styles.queueRow}>
              <Text style={[styles.meta, { color: titleColor, flex: 1 }]} numberOfLines={1}>
                {resolveRunTitle(run, scheduleNames)}
              </Text>
              <Text style={[styles.badge, { color: nrmTokens.color.primary }]}>진행중</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {dueSchedules.length > 0 ? (
        <View style={styles.queueSection}>
          <Text style={[styles.queueSectionTitle, { color: titleColor }]}>대기 (due)</Text>
          {dueSchedules.map((item) => (
            <View key={item.schedule_id} style={styles.queueRow}>
              <Text style={[styles.meta, { color: titleColor, flex: 1 }]} numberOfLines={1}>
                {item.display_name}
              </Text>
              <Text style={[styles.badge, { color: bodyColor }]}>대기</Text>
            </View>
          ))}
        </View>
      ) : null}

      {openJobs.length > 0 ? (
        <View style={styles.queueSection}>
          <Text style={[styles.queueSectionTitle, { color: titleColor }]}>작업 큐</Text>
          {openJobs.map((job) => (
            <View
              key={job.schedule_id ?? job.display_name}
              style={styles.queueRow}>
              <Text style={[styles.meta, { color: titleColor, flex: 1 }]} numberOfLines={1}>
                {resolveOpenJobTitle(job, scheduleNames)}
              </Text>
              <Text style={[styles.badge, { color: bodyColor }]}>{job.job_count}건</Text>
            </View>
          ))}
        </View>
      ) : null}
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
  tone: 'execution' | 'failure';
  onPress: () => void;
}) {
  const accent =
    run.run_status === 'running'
      ? nrmTokens.color.primary
      : tone === 'failure'
        ? nrmTokens.color.danger
        : nrmTokens.color.success;
  const summary = isRetentionRun(run)
    ? retentionRunSummary(run)
    : run.run_status === 'running'
      ? '스케줄러 큐에서 처리 중'
      : tone === 'execution'
        ? `발견 ${run.discovered_count} · 삽입 ${run.inserted_count} · 갱신 ${run.updated_count} · 중복 ${run.duplicate_count}`
        : run.error_message
          ? run.error_message
          : run.failure_count > 0
            ? `실패 ${run.failure_count}건 · ${runStatusLabel(run.run_status, run)}`
            : runStatusLabel(run.run_status, run);

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
        <Text style={[styles.badge, { color: accent }]}>{runStatusLabel(run.run_status, run)}</Text>
      </View>
      <Text style={[styles.meta, { color: bodyColor }]} numberOfLines={2}>
        {summary}
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
  insertLoadMoreRef,
}: {
  run: NrmSupabaseMusicScheduleRunRow;
  scheduleName: string;
  titleColor: string;
  bodyColor: string;
  isDark: boolean;
  onBack: () => void;
  insertLoadMoreRef: MutableRefObject<(() => void) | null>;
}) {
  const retention = isRetentionRun(run);
  const showInserts = !retention;
  const showFailures = !retention;
  const [jobs, setJobs] = useState<NrmSupabaseMusicScheduleRunJobCount[]>([]);
  const [jobsLoading, setJobsLoading] = useState(!retention);
  const [jobsError, setJobsError] = useState('');
  const [insertsOpen, setInsertsOpen] = useState(false);
  const [inserts, setInserts] = useState<NrmSupabaseMusicScheduleRunInsertRow[]>([]);
  const [insertTotal, setInsertTotal] = useState(0);
  const [insertLoading, setInsertLoading] = useState(false);
  const [insertLoadingMore, setInsertLoadingMore] = useState(false);
  const [insertError, setInsertError] = useState('');
  const [failuresOpen, setFailuresOpen] = useState(false);
  const [failures, setFailures] = useState<NrmSupabaseMusicScheduleRunFailureRow[]>([]);
  const [failureTotal, setFailureTotal] = useState(0);
  const [failureLoading, setFailureLoading] = useState(false);
  const [failureLoadingMore, setFailureLoadingMore] = useState(false);
  const [failureError, setFailureError] = useState('');
  const insertBusyRef = useRef(false);
  const insertsOpenRef = useRef(false);
  const insertCountRef = useRef({ loaded: 0, total: 0 });
  const failureBusyRef = useRef(false);
  const failuresOpenRef = useRef(false);
  const failureCountRef = useRef({ loaded: 0, total: 0 });
  const activeRunIdRef = useRef(run.schedule_run_id);

  insertsOpenRef.current = insertsOpen;
  insertCountRef.current = { loaded: inserts.length, total: insertTotal };
  failuresOpenRef.current = failuresOpen;
  failureCountRef.current = { loaded: failures.length, total: failureTotal };
  activeRunIdRef.current = run.schedule_run_id;

  useEffect(() => {
    insertBusyRef.current = false;
    failureBusyRef.current = false;
    setInsertsOpen(false);
    setInserts([]);
    setInsertTotal(0);
    setInsertError('');
    setFailuresOpen(false);
    setFailures([]);
    setFailureTotal(0);
    setFailureError('');
    setJobs([]);
    insertsOpenRef.current = false;
    failuresOpenRef.current = false;
    insertCountRef.current = { loaded: 0, total: 0 };
    failureCountRef.current = { loaded: 0, total: 0 };
  }, [run.schedule_run_id]);

  useEffect(() => {
    let cancelled = false;
    if (retention) {
      setJobs([]);
      setJobsLoading(false);
      setJobsError('');
      return;
    }
    setJobsLoading(true);
    setJobsError('');
    void fetchMusicScheduleRunJobs(run.schedule_run_id)
      .then((items) => {
        if (!cancelled) setJobs(sortRunJobCounts(items));
      })
      .catch((loadError) => {
        if (cancelled) return;
        setJobs([]);
        setJobsError(
          loadError instanceof Error ? loadError.message : '작업 집계를 불러오지 못했습니다.',
        );
      })
      .finally(() => {
        if (!cancelled) setJobsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [retention, run.schedule_run_id]);

  const loadInsertPage = useCallback(
    async (offset: number) => {
      if (!showInserts || insertBusyRef.current) return;
      const runId = activeRunIdRef.current;
      insertBusyRef.current = true;
      if (offset === 0) {
        setInsertLoading(true);
        setInsertError('');
      } else {
        setInsertLoadingMore(true);
      }
      try {
        const page = await fetchMusicScheduleRunInserts(runId, INSERT_PAGE_SIZE, offset);
        if (activeRunIdRef.current !== runId) return;
        setInsertTotal(page.total);
        setInserts((current) => (offset === 0 ? page.items : [...current, ...page.items]));
      } catch (loadError) {
        if (activeRunIdRef.current !== runId) return;
        setInsertError(
          loadError instanceof Error ? loadError.message : '성공한 곡을 불러오지 못했습니다.',
        );
        if (offset === 0) {
          setInserts([]);
          setInsertTotal(0);
        }
      } finally {
        if (activeRunIdRef.current === runId) {
          insertBusyRef.current = false;
          setInsertLoading(false);
          setInsertLoadingMore(false);
        }
      }
    },
    [showInserts],
  );

  const loadFailurePage = useCallback(
    async (offset: number) => {
      if (retention || failureBusyRef.current) return;
      const runId = activeRunIdRef.current;
      failureBusyRef.current = true;
      if (offset === 0) {
        setFailureLoading(true);
        setFailureError('');
      } else {
        setFailureLoadingMore(true);
      }
      try {
        const page = await fetchMusicScheduleRunFailures(runId, INSERT_PAGE_SIZE, offset);
        if (activeRunIdRef.current !== runId) return;
        setFailureTotal(page.total);
        setFailures((current) => (offset === 0 ? page.items : [...current, ...page.items]));
      } catch (loadError) {
        if (activeRunIdRef.current !== runId) return;
        setFailureError(
          loadError instanceof Error ? loadError.message : '실패 곡을 불러오지 못했습니다.',
        );
        if (offset === 0) {
          setFailures([]);
          setFailureTotal(0);
        }
      } finally {
        if (activeRunIdRef.current === runId) {
          failureBusyRef.current = false;
          setFailureLoading(false);
          setFailureLoadingMore(false);
        }
      }
    },
    [retention],
  );

  useEffect(() => {
    if (!showInserts) return;
    void loadInsertPage(0);
  }, [loadInsertPage, run.schedule_run_id, showInserts]);

  useEffect(() => {
    if (retention) return;
    void loadFailurePage(0);
  }, [loadFailurePage, retention, run.schedule_run_id]);

  useEffect(() => {
    insertLoadMoreRef.current = () => {
      if (insertsOpenRef.current && !insertBusyRef.current) {
        const { loaded, total } = insertCountRef.current;
        if (total > 0 && loaded < total) void loadInsertPage(loaded);
      }
      if (failuresOpenRef.current && !failureBusyRef.current) {
        const { loaded, total } = failureCountRef.current;
        if (total > 0 && loaded < total) void loadFailurePage(loaded);
      }
    };
    return () => {
      insertLoadMoreRef.current = null;
    };
  }, [insertLoadMoreRef, loadFailurePage, loadInsertPage]);

  const attentionJobs = mergeAttentionJobCounts(
    jobs.filter((item) => ATTENTION_JOB_STATUSES.has(item.job_status)),
  );
  const tagRefresh = isTagRefreshRun(run) || jobs.some((item) => item.job_kind === 'lastfm_tag_refresh');
  const showTimestamps = run.run_status !== 'completed';
  const retentionDeleted = retention ? retentionDeletedCounts(run) : [];
  const retentionQuiet =
    retention &&
    !run.error_message &&
    run.run_status === 'completed' &&
    retentionDeleted.length === 0;

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
        <DetailRow
          label="상태"
          value={runStatusLabel(run.run_status, run)}
          {...{ titleColor, bodyColor }}
        />
        {showTimestamps ? (
          <>
            <DetailRow label="시작" value={formatDate(run.started_at)} {...{ titleColor, bodyColor }} />
            <DetailRow label="종료" value={formatDate(run.finished_at)} {...{ titleColor, bodyColor }} />
          </>
        ) : null}
        {retention ? (
          retentionQuiet ? (
            <Text style={[styles.meta, { color: bodyColor }]}>확인할 이상이 없습니다.</Text>
          ) : (
            retentionDeleted.map((item) => (
              <DetailRow
                key={item.label}
                label={item.label}
                value={item.value}
                {...{ titleColor, bodyColor }}
              />
            ))
          )
        ) : (
          <>
            {jobsLoading ? (
              <ActivityIndicator color={nrmTokens.color.primary} />
            ) : jobsError ? (
              <Text style={styles.errorText}>{jobsError}</Text>
            ) : attentionJobs.length === 0 ? (
              <Text style={[styles.meta, { color: bodyColor }]}>확인할 이상이 없습니다.</Text>
            ) : (
              attentionJobs.map((item) => (
                <DetailRow
                  key={`${item.job_kind}:${item.job_status}`}
                  label={runJobCountLabel(item)}
                  value={String(item.job_count)}
                  {...{ titleColor, bodyColor }}
                />
              ))
            )}
          </>
        )}
        {run.error_message ? (
          <View style={styles.detailBlock}>
            <Text style={[styles.detailLabel, { color: bodyColor }]}>실행 오류</Text>
            <Text style={styles.errorText}>{run.error_message}</Text>
          </View>
        ) : null}

        {showInserts ? (
          <View style={styles.detailBlock}>
            <Pressable
              onPress={() => {
                if (insertsOpen) {
                  setInsertsOpen(false);
                  return;
                }
                setInsertsOpen(true);
                if (insertError) void loadInsertPage(0);
              }}
              style={styles.insertToggle}>
              <Text style={[styles.detailLabel, { color: bodyColor, flex: 1 }]}>
                {tagRefresh ? '태그를 갱신한 곡' : '성공'}
                {insertTotal > 0 ? ` (${insertTotal})` : ''}
              </Text>
              <Ionicons
                name={insertsOpen ? 'chevron-up' : 'chevron-down'}
                size={18}
                color={bodyColor}
              />
            </Pressable>
            {insertsOpen ? (
              insertLoading ? (
                <ActivityIndicator color={nrmTokens.color.primary} />
              ) : insertError ? (
                <Text style={styles.errorText}>{insertError}</Text>
              ) : inserts.length === 0 ? (
                <Text style={[styles.meta, { color: bodyColor }]}>
                  {tagRefresh
                    ? '이번 실행에서 태그를 갱신한 곡이 없습니다.'
                    : '이번 실행에서 성공한 곡이 없습니다.'}
                </Text>
              ) : (
                <>
                  {inserts.map((item) => (
                    <Text
                      key={item.recording_id}
                      style={[styles.insertLine, { color: titleColor }]}
                      numberOfLines={2}>
                      {item.artist} — {item.title}
                    </Text>
                  ))}
                  {insertLoadingMore ? (
                    <ActivityIndicator color={nrmTokens.color.primary} style={styles.loader} />
                  ) : inserts.length < insertTotal ? (
                    <Pressable
                      onPress={() => void loadInsertPage(inserts.length)}
                      style={styles.insertMore}>
                      <Text style={[styles.meta, { color: nrmTokens.color.primary }]}>
                        더 보기 (남은 {insertTotal - inserts.length}건)
                      </Text>
                    </Pressable>
                  ) : null}
                </>
              )
            ) : null}
          </View>
        ) : null}

        {showFailures ? (
          <View style={styles.detailBlock}>
            <Pressable
              onPress={() => {
                if (failuresOpen) {
                  setFailuresOpen(false);
                  return;
                }
                setFailuresOpen(true);
                if (failureError) void loadFailurePage(0);
              }}
              style={styles.insertToggle}>
              <Text style={[styles.detailLabel, { color: bodyColor, flex: 1 }]}>
                실패{failureTotal > 0 ? ` (${failureTotal})` : ''}
              </Text>
              <Ionicons
                name={failuresOpen ? 'chevron-up' : 'chevron-down'}
                size={18}
                color={bodyColor}
              />
            </Pressable>
            {failuresOpen ? (
              failureLoading ? (
                <ActivityIndicator color={nrmTokens.color.primary} />
              ) : failureError ? (
                <Text style={styles.errorText}>{failureError}</Text>
              ) : failures.length === 0 ? (
                <Text style={[styles.meta, { color: bodyColor }]}>
                  이번 실행에서 실패한 곡이 없습니다.
                </Text>
              ) : (
                <>
                  {failures.map((item) => (
                    <View key={item.job_id} style={styles.failureRow}>
                      <Text
                        style={[styles.insertLine, { color: titleColor }]}
                        numberOfLines={2}>
                        {item.artist} — {item.title}
                      </Text>
                      <Text style={styles.failureReason} numberOfLines={3}>
                        {formatFailureReason(item)}
                      </Text>
                    </View>
                  ))}
                  {failureLoadingMore ? (
                    <ActivityIndicator color={nrmTokens.color.primary} style={styles.loader} />
                  ) : failures.length < failureTotal ? (
                    <Pressable
                      onPress={() => void loadFailurePage(failures.length)}
                      style={styles.insertMore}>
                      <Text style={[styles.meta, { color: nrmTokens.color.primary }]}>
                        더 보기 (남은 {failureTotal - failures.length}건)
                      </Text>
                    </Pressable>
                  ) : null}
                </>
              )
            ) : null}
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
  const [runVisibleCount, setRunVisibleCount] = useState(RUN_BATCH_SIZE);
  const [failureVisibleCount, setFailureVisibleCount] = useState(RUN_BATCH_SIZE);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingSchedule, setEditingSchedule] = useState<NrmSupabaseSystemScheduleRow | undefined>(undefined);
  const [systemSchedules, setSystemSchedules] = useState<NrmSupabaseSystemScheduleRow[]>([]);
  const [selectedRun, setSelectedRun] = useState<NrmSupabaseMusicScheduleRunRow | null>(null);
  const insertLoadMoreRef = useRef<(() => void) | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [nextOverview, schedules] = await Promise.all([
        fetchMusicSyncAdminOverview(200, 0),
        fetchAllSystemSchedules(),
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
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setSelectedRun(null);
    setRunVisibleCount(RUN_BATCH_SIZE);
    setFailureVisibleCount(RUN_BATCH_SIZE);
  }, [tab]);

  const scheduleNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of systemSchedules) {
      if (row.display_name) {
        map.set(row.schedule_id, row.display_name);
        map.set(row.schedule_key, row.display_name);
      }
      const musicId = musicScheduleIdFromSystem(row);
      if (musicId && row.display_name) map.set(musicId, row.display_name);
      if (row.music_schedule?.schedule_key && row.display_name) {
        map.set(row.music_schedule.schedule_key, row.display_name);
      }
    }
    for (const row of overview?.schedules ?? []) {
      if (row.display_name) {
        if (!map.has(row.schedule_id)) map.set(row.schedule_id, row.display_name);
        if (row.schedule_key) map.set(row.schedule_key, row.display_name);
      }
    }
    return map;
  }, [overview?.schedules, systemSchedules]);

  const executionRuns = useMemo(() => {
    const running = overview?.runningRuns ?? [];
    const completed = overview?.completedRuns ?? [];
    return [...running, ...completed].filter(isExecutionRun);
  }, [overview?.completedRuns, overview?.runningRuns]);
  const failureRuns = useMemo(() => {
    const fromFailure = (overview?.failureRuns ?? []).filter(isFailureRun);
    const seen = new Set(fromFailure.map((run) => run.schedule_run_id));
    const fromCompleted = (overview?.completedRuns ?? []).filter(
      (run) => mb503RetryShouldFailTab(run) && !seen.has(run.schedule_run_id),
    );
    return [...fromFailure, ...fromCompleted];
  }, [overview?.completedRuns, overview?.failureRuns]);

  const onDrawerScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
      if (layoutMeasurement.height + contentOffset.y < contentSize.height - 280) return;
      if (selectedRun) {
        insertLoadMoreRef.current?.();
        return;
      }
      if (tab !== 'runs' && tab !== 'failures') return;
      if (tab === 'runs') {
        setRunVisibleCount((count) => Math.min(count + RUN_BATCH_SIZE, executionRuns.length));
        return;
      }
      setFailureVisibleCount((count) => Math.min(count + RUN_BATCH_SIZE, failureRuns.length));
    },
    [executionRuns.length, failureRuns.length, selectedRun, tab],
  );

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
      if (queued) setTab('runs');
      void notifyUser(
        queued
          ? '즉시 실행을 시작했습니다. 실행 탭에서 큐·진행을 확인하세요.'
          : '활성화된 스케줄만 즉시 실행할 수 있습니다.',
      );
      await load();
    } catch (runError) {
      const detail = runError instanceof Error ? runError.message.trim() : '';
      notifyUserError(
        'admin.systemSchedule.runNow',
        runError,
        detail
          ? `즉시 실행을 예약하지 못했습니다.\n${detail}`
          : '즉시 실행을 예약하지 못했습니다.',
      );
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
                  <Text style={[styles.meta, { color: bodyColor }]}>
                    {row.music_schedule?.collection_mode === 'tag_refresh'
                      ? 'Last.fm 태그 갱신'
                      : jobKindLabel(row.job_kind)}
                  </Text>
                </View>
                <Switch
                  value={row.is_enabled}
                  onValueChange={(value) => void toggleSchedule(row, value)}
                  disabled={busyId === row.schedule_id}
                />
              </View>
              <Text style={[styles.stats, { color: titleColor }]}>{timingLabel(row)}</Text>
              <Text style={[styles.meta, { color: bodyColor }]}>다음 실행 {formatDate(row.next_run_at)}</Text>
              {row.music_schedule?.collection_mode === 'tag_refresh' ? (
                <Text style={[styles.meta, { color: bodyColor }]}>
                  원장 전곡 Last.fm 태그를 다시 받아 upsert
                </Text>
              ) : null}
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
              {row.job_kind === 'ops_cleanup' ? (
                <Text style={[styles.meta, { color: bodyColor }]}>
                  로그·Storage 1개월, 스케줄 이력 3개월 삭제
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
      </>
    );
  };

  const renderRunList = (mode: 'execution' | 'failure') => {
    const allRuns = mode === 'execution' ? executionRuns : failureRuns;
    const visibleCount = mode === 'execution' ? runVisibleCount : failureVisibleCount;
    const visible = allRuns.slice(0, visibleCount);
    const hasMore = visibleCount < allRuns.length;

    if (selectedRun) {
      return (
        <RunDetailView
          run={selectedRun}
          scheduleName={resolveRunTitle(selectedRun, scheduleNames)}
          insertLoadMoreRef={insertLoadMoreRef}
          {...{ titleColor, bodyColor, isDark }}
          onBack={() => setSelectedRun(null)}
        />
      );
    }

    return (
      <>
        {mode === 'execution' ? (
          <QueueStatusCard
            collectionBusy={overview?.collectionBusy ?? false}
            dueSchedules={overview?.dueSchedules ?? []}
            openJobs={overview?.openJobs ?? []}
            runningRuns={overview?.runningRuns ?? []}
            scheduleNames={scheduleNames}
            onSelectRun={setSelectedRun}
            {...{ titleColor, bodyColor, isDark }}
          />
        ) : null}

        {allRuns.length === 0 ? (
          <Text style={[styles.empty, { color: bodyColor }]}>
            {mode === 'execution'
              ? '완료된 실행 기록이 없습니다.'
              : '실패·부분성공 실행 기록이 없습니다.'}
          </Text>
        ) : (
          <>
            {mode === 'execution' ? (
              <Text style={[styles.sectionHint, { color: bodyColor }]}>최근 실행</Text>
            ) : null}
            {visible.map((run) => (
              <RunSummaryCard
                key={run.schedule_run_id}
                run={run}
                scheduleName={resolveRunTitle(run, scheduleNames)}
                tone={mode}
                onPress={() => setSelectedRun(run)}
                {...{ titleColor, bodyColor, isDark }}
              />
            ))}
            {hasMore ? (
              <ActivityIndicator color={nrmTokens.color.primary} style={styles.loader} />
            ) : null}
          </>
        )}
      </>
    );
  };

  return (
    <NrmMenuDrawerScroll onScroll={onDrawerScroll} scrollEventThrottle={16}>
      <BackRow onBack={onBack} />
      <View style={styles.titleRow}>
        <View style={styles.flex}>
          <Text style={[styles.title, { color: titleColor }]}>시스템 스케줄 관리</Text>
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
          {tab === 'runs' ? renderRunList('execution') : null}
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
  queueSection: { marginTop: nrmTokens.space.sm, gap: 4 },
  queueSectionTitle: { fontSize: 12, fontWeight: '700', marginBottom: 2 },
  queueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: nrmTokens.space.sm,
    paddingVertical: 2,
  },
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
  choiceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: nrmTokens.space.xs,
    marginBottom: nrmTokens.space.sm,
  },
  choice: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 9,
    borderRadius: nrmTokens.radius.pill,
    backgroundColor: 'rgba(128,128,128,0.12)',
  },
  choiceActive: { backgroundColor: nrmTokens.color.primary },
  weekdayRow: { flexDirection: 'row', gap: 4, flexWrap: 'wrap' },
  weekday: {
    flexGrow: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: nrmTokens.radius.pill,
    backgroundColor: 'rgba(128,128,128,0.12)',
  },
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
  insertToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 36,
  },
  insertMore: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
  },
  insertLine: { fontSize: nrmTokens.font.caption, lineHeight: 19 },
  failureRow: { gap: 2, paddingVertical: 4 },
  failureReason: {
    color: nrmTokens.color.danger,
    fontSize: nrmTokens.font.caption,
    lineHeight: 18,
  },
  sectionHint: {
    fontSize: nrmTokens.font.caption,
    lineHeight: 19,
    marginBottom: nrmTokens.space.xs,
  },
});
