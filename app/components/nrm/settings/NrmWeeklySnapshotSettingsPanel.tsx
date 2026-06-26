import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
} from 'react-native';

import { NrmMenuDrawerScroll } from '@/components/nrm/NrmMenuDrawerScroll';
import { NrmSettingsOptionPicker } from '@/components/nrm/settings/NrmSettingsOptionPicker';
import { nrmTokens } from '@/constants/nrmTokens';
import {
  DEFAULT_WEEKLY_SNAPSHOT_DAY,
  loadWeeklySnapshotDay,
  saveWeeklySnapshotDay,
  WEEKLY_SNAPSHOT_DAY_OPTIONS,
  type WeeklySnapshotDay,
} from '@/lib/nrmWeeklySnapshotSettings';

type Props = {
  titleColor: string;
  bodyColor: string;
  rowHover: string;
  onBack: () => void;
};

function MenuBackRow({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={styles.backRow}
      accessibilityRole="button"
      accessibilityLabel="뒤로">
      <Ionicons name="chevron-back" size={22} color={nrmTokens.color.primary} />
      <Text style={styles.backText}>뒤로</Text>
    </Pressable>
  );
}

export function NrmWeeklySnapshotSettingsPanel({
  titleColor,
  bodyColor,
  rowHover,
  onBack,
}: Props) {
  const [selected, setSelected] = useState<WeeklySnapshotDay>(DEFAULT_WEEKLY_SNAPSHOT_DAY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadWeeklySnapshotDay().then((day) => {
      if (!cancelled) {
        setSelected(day);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const persist = useCallback(
    async (day: WeeklySnapshotDay) => {
      if (saving || day === selected) return;
      setSaving(true);
      try {
        await saveWeeklySnapshotDay(day);
        setSelected(day);
      } finally {
        setSaving(false);
      }
    },
    [saving, selected],
  );

  return (
    <NrmMenuDrawerScroll>
      <MenuBackRow onPress={onBack} />
      <Text style={[styles.panelTitle, { color: titleColor }]}>주간차트 스냅샷 요일 설정</Text>
      <Text style={[styles.lead, { color: bodyColor }]}>
        Spotify 기간별 · 주간/월간 차트 API에 사용할 주간 스냅샷 요일입니다.
      </Text>

      {loading ? (
        <ActivityIndicator color={nrmTokens.color.primary} style={styles.loader} />
      ) : (
        <NrmSettingsOptionPicker
          options={WEEKLY_SNAPSHOT_DAY_OPTIONS.map((opt) => ({
            id: String(opt.value),
            label: opt.label,
          }))}
          value={String(selected)}
          onChange={(id) => void persist(Number(id) as WeeklySnapshotDay)}
          titleColor={titleColor}
          bodyColor={bodyColor}
          rowHover={rowHover}
        />
      )}
    </NrmMenuDrawerScroll>
  );
}

const styles = StyleSheet.create({
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: nrmTokens.space.md,
  },
  backText: {
    fontSize: nrmTokens.font.body,
    color: nrmTokens.color.primary,
    fontWeight: '500',
  },
  panelTitle: {
    fontSize: nrmTokens.font.lead,
    fontWeight: '600',
    marginBottom: nrmTokens.space.sm,
  },
  lead: {
    fontSize: nrmTokens.font.caption,
    lineHeight: 20,
    marginBottom: nrmTokens.space.lg,
  },
  loader: { marginVertical: nrmTokens.space.xl },
});
