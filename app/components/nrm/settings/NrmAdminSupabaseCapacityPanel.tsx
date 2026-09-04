import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { NrmMenuDrawerScroll } from '@/components/nrm/NrmMenuDrawerScroll';
import { nrmTokens } from '@/constants/nrmTokens';
import {
  fetchNrmSupabaseCapacityForAdmin,
  type NrmSupabaseProjectCapacity,
} from '@/lib/nrmSupabaseCapacityAdminClient';

type Props = {
  titleColor: string;
  bodyColor: string;
  isDark: boolean;
  onBack: () => void;
};

const MIB = 1024 * 1024;

function formatBytes(bytes: number): string {
  return `${(bytes / MIB).toFixed(bytes < 10 * MIB ? 2 : 1)} MB`;
}

function MenuBackRow({ onPress }: { onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.backRow} accessibilityRole="button" accessibilityLabel="뒤로">
      <Ionicons name="chevron-back" size={22} color={nrmTokens.color.primary} />
      <Text style={styles.backText}>뒤로</Text>
    </Pressable>
  );
}

function ProjectSummaryCard({
  project,
  titleColor,
  bodyColor,
  isDark,
  onPress,
}: {
  project: NrmSupabaseProjectCapacity;
  titleColor: string;
  bodyColor: string;
  isDark: boolean;
  onPress: () => void;
}) {
  const hairline = isDark ? nrmTokens.color.borderOnDark : nrmTokens.color.hairline;
  const cardBg = isDark ? 'rgba(255,255,255,0.05)' : nrmTokens.color.cardLightBg;
  const trackBg = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)';
  const used = project.databaseBytes;
  const total = project.hardLimitBytes;
  const remaining = Math.max(0, total - used);
  const percent = Math.max(0, project.usageRatio * 100);
  const stopped = project.capacityState === 'discovery_disabled';
  const accent = stopped ? nrmTokens.color.danger : percent >= 80 ? '#d97706' : nrmTokens.color.success;
  const progressWidth = `${Math.min(percent, 100)}%` as `${number}%`;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { borderColor: hairline, backgroundColor: cardBg, opacity: pressed ? 0.88 : 1 },
      ]}>
      <View style={styles.cardHeader}>
        <Text style={[styles.projectTitle, { color: titleColor }]}>{project.projectLabel}</Text>
        {stopped ? (
          <View style={[styles.stateBadge, { borderColor: accent }]}>
            <Text style={[styles.stateLabel, { color: accent }]}>수집 중지</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.metricBlock}>
        <Text style={[styles.metricLabel, { color: bodyColor }]}>총 용량</Text>
        <Text style={[styles.metricValue, { color: titleColor }]}>{formatBytes(total)}</Text>
      </View>
      <View style={styles.metricBlock}>
        <Text style={[styles.metricLabel, { color: bodyColor }]}>잔여 용량</Text>
        <Text style={[styles.metricValue, { color: titleColor }]}>{formatBytes(remaining)}</Text>
      </View>
      <View style={styles.metricBlock}>
        <Text style={[styles.metricLabel, { color: bodyColor }]}>사용률</Text>
        <Text style={[styles.metricValue, { color: accent }]}>{percent.toFixed(1)}%</Text>
      </View>

      <View style={[styles.progressTrack, { backgroundColor: trackBg }]}>
        <View style={[styles.progressFill, { width: progressWidth, backgroundColor: accent }]} />
      </View>
      <Text style={[styles.hint, { color: nrmTokens.color.primary }]}>테이블별 용량 보기</Text>
    </Pressable>
  );
}

function ProjectDetailView({
  project,
  titleColor,
  bodyColor,
  isDark,
  onBack,
}: {
  project: NrmSupabaseProjectCapacity;
  titleColor: string;
  bodyColor: string;
  isDark: boolean;
  onBack: () => void;
}) {
  const hairline = isDark ? nrmTokens.color.borderOnDark : nrmTokens.color.hairline;
  const cardBg = isDark ? 'rgba(255,255,255,0.05)' : nrmTokens.color.cardLightBg;

  return (
    <View>
      <MenuBackRow onPress={onBack} />
      <Text style={[styles.detailTitle, { color: titleColor }]}>{project.projectLabel}</Text>
      <Text style={[styles.detailSub, { color: bodyColor }]}>
        사용 {formatBytes(project.databaseBytes)} / {formatBytes(project.hardLimitBytes)}
      </Text>
      <View style={[styles.detailCard, { borderColor: hairline, backgroundColor: cardBg }]}>
        <Text style={[styles.sectionTitle, { color: titleColor }]}>테이블</Text>
        {project.relations.length === 0 ? (
          <Text style={[styles.emptyText, { color: bodyColor }]}>표시할 테이블이 없습니다.</Text>
        ) : (
          project.relations.map((relation, index) => (
            <View
              key={`${relation.schemaName}.${relation.relationName}`}
              style={[
                styles.relationRow,
                index > 0 && { borderTopColor: hairline, borderTopWidth: StyleSheet.hairlineWidth },
              ]}>
              <Text style={[styles.relationName, { color: titleColor }]} numberOfLines={1}>
                {relation.relationName}
              </Text>
              <Text style={[styles.relationSize, { color: bodyColor }]}>
                {formatBytes(relation.totalBytes)}
              </Text>
            </View>
          ))
        )}
      </View>
      <Text style={[styles.capturedAt, { color: bodyColor }]}>
        갱신 {new Date(project.capturedAt).toLocaleString()}
      </Text>
    </View>
  );
}

export function NrmAdminSupabaseCapacityPanel({ titleColor, bodyColor, isDark, onBack }: Props) {
  const [projects, setProjects] = useState<NrmSupabaseProjectCapacity[]>([]);
  const [selected, setSelected] = useState<NrmSupabaseProjectCapacity | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const snapshot = await fetchNrmSupabaseCapacityForAdmin();
      setProjects(snapshot.projects);
      setSelected((prev) => {
        if (!prev) return null;
        return snapshot.projects.find((item) => item.projectRef === prev.projectRef) ?? null;
      });
    } catch (error) {
      setProjects([]);
      setSelected(null);
      setErrorMessage(error instanceof Error ? error.message : 'Supabase 용량을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <NrmMenuDrawerScroll>
      {selected ? null : <MenuBackRow onPress={onBack} />}
      {selected ? null : (
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: titleColor }]}>Supabase 용량</Text>
          <Pressable
            onPress={() => void load()}
            disabled={loading}
            style={({ pressed }) => [styles.refreshButton, (pressed || loading) && styles.buttonPressed]}
            accessibilityRole="button"
            accessibilityLabel="용량 새로고침">
            <Ionicons name="refresh" size={18} color={nrmTokens.color.primary} />
            <Text style={styles.refreshLabel}>새로고침</Text>
          </Pressable>
        </View>
      )}
      {selected ? null : (
        <Text style={[styles.description, { color: bodyColor }]}>
          프로젝트별 총 용량·잔여 용량·사용률입니다. 450MB를 넘으면 MusicBrainz/Last.fm/벡터 수집
          스케줄러만 자동으로 꺼집니다. 앱의 다른 데이터 CRUD는 용량과 무관합니다.
        </Text>
      )}

      {loading ? (
        <ActivityIndicator color={nrmTokens.color.primary} style={styles.loader} />
      ) : errorMessage ? (
        <View style={styles.errorBlock}>
          <Ionicons name="alert-circle-outline" size={22} color={nrmTokens.color.danger} />
          <Text style={[styles.errorText, { color: nrmTokens.color.danger }]}>{errorMessage}</Text>
        </View>
      ) : selected ? (
        <ProjectDetailView
          project={selected}
          titleColor={titleColor}
          bodyColor={bodyColor}
          isDark={isDark}
          onBack={() => setSelected(null)}
        />
      ) : (
        projects.map((project) => (
          <ProjectSummaryCard
            key={project.projectRef}
            project={project}
            titleColor={titleColor}
            bodyColor={bodyColor}
            isDark={isDark}
            onPress={() => setSelected(project)}
          />
        ))
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
    marginBottom: nrmTokens.space.sm,
  },
  backText: {
    color: nrmTokens.color.primary,
    fontSize: nrmTokens.font.body,
    fontWeight: '500',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: nrmTokens.space.sm,
  },
  title: {
    flex: 1,
    fontSize: 20,
    fontWeight: '700',
  },
  refreshButton: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: nrmTokens.space.sm,
  },
  refreshLabel: {
    color: nrmTokens.color.primary,
    fontSize: nrmTokens.font.caption,
    fontWeight: '600',
  },
  buttonPressed: {
    opacity: 0.6,
  },
  description: {
    marginTop: nrmTokens.space.xs,
    marginBottom: nrmTokens.space.md,
    fontSize: nrmTokens.font.caption,
    lineHeight: 20,
  },
  loader: {
    marginVertical: nrmTokens.space.xl,
  },
  errorBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: nrmTokens.space.xs,
    paddingVertical: nrmTokens.space.lg,
  },
  errorText: {
    flex: 1,
    fontSize: nrmTokens.font.body,
    lineHeight: 22,
  },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: nrmTokens.radius.md,
    padding: nrmTokens.space.md,
    marginBottom: nrmTokens.space.md,
    gap: 8,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: nrmTokens.space.sm,
    marginBottom: 4,
  },
  projectTitle: {
    fontSize: nrmTokens.font.bodyStrong,
    fontWeight: '700',
  },
  stateBadge: {
    borderWidth: 1,
    borderRadius: nrmTokens.radius.pill,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  stateLabel: {
    fontSize: nrmTokens.font.finePrint,
    fontWeight: '700',
  },
  metricBlock: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  metricLabel: {
    fontSize: nrmTokens.font.caption,
  },
  metricValue: {
    fontSize: 18,
    fontWeight: '700',
  },
  progressTrack: {
    height: 8,
    borderRadius: nrmTokens.radius.pill,
    overflow: 'hidden',
    marginTop: 4,
  },
  progressFill: {
    height: '100%',
    borderRadius: nrmTokens.radius.pill,
  },
  hint: {
    marginTop: 2,
    fontSize: nrmTokens.font.finePrint,
    fontWeight: '600',
  },
  detailTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  detailSub: {
    marginTop: 4,
    marginBottom: nrmTokens.space.md,
    fontSize: nrmTokens.font.caption,
  },
  detailCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: nrmTokens.radius.md,
    padding: nrmTokens.space.md,
  },
  sectionTitle: {
    marginBottom: 6,
    fontSize: nrmTokens.font.caption,
    fontWeight: '700',
  },
  emptyText: {
    paddingVertical: nrmTokens.space.sm,
    fontSize: nrmTokens.font.caption,
  },
  relationRow: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: nrmTokens.space.sm,
  },
  relationName: {
    flex: 1,
    fontSize: nrmTokens.font.caption,
  },
  relationSize: {
    fontSize: nrmTokens.font.caption,
    fontWeight: '600',
  },
  capturedAt: {
    marginTop: nrmTokens.space.sm,
    textAlign: 'right',
    fontSize: nrmTokens.font.finePrint,
  },
});
