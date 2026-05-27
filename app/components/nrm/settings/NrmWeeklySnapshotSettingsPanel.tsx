import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { NrmMenuDrawerScroll } from '@/components/nrm/NrmMenuDrawerScroll';
import { nrmTokens } from '@/constants/nrmTokens';
import {
  DEFAULT_WEEKLY_SNAPSHOT_DAY,
  loadWeeklySnapshotDay,
  saveWeeklySnapshotDay,
  WEEKLY_SNAPSHOT_DAY_OPTIONS,
  type WeeklySnapshotDay,
} from '@/lib/nrmWeeklySnapshotSettings';

const SEGMENT_BORDER = 'rgba(128,128,128,0.4)';
const SEGMENT_BORDER_WIDTH = Platform.OS === 'web' ? StyleSheet.hairlineWidth : 1;

type Props = {
  titleColor: string;
  bodyColor: string;
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
  onBack,
}: Props) {
  const [selected, setSelected] = useState<WeeklySnapshotDay>(DEFAULT_WEEKLY_SNAPSHOT_DAY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const segmentBg = 'rgba(128,128,128,0.08)';
  const segmentActiveBg = 'rgba(0, 102, 204, 0.28)';

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

  const persist = useCallback(async (day: WeeklySnapshotDay) => {
    if (day === selected) return;
    setSaving(true);
    try {
      await saveWeeklySnapshotDay(day);
      setSelected(day);
    } finally {
      setSaving(false);
    }
  }, [selected]);

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
        <View
          style={[
            styles.segmentBar,
            { backgroundColor: segmentBg, borderColor: SEGMENT_BORDER },
          ]}
          accessibilityRole="radiogroup"
          accessibilityLabel="주간차트 스냅샷 요일">
          {WEEKLY_SNAPSHOT_DAY_OPTIONS.map((opt, index) => {
            const active = selected === opt.value;
            return (
              <Pressable
                key={opt.value}
                disabled={saving}
                onPress={() => void persist(opt.value)}
                style={({ pressed }) => [
                  styles.segmentCell,
                  index > 0 && styles.segmentDivider,
                  active && { backgroundColor: segmentActiveBg },
                  pressed && !active && styles.segmentPressed,
                ]}
                accessibilityRole="radio"
                accessibilityState={{ selected: active, disabled: saving }}>
                <Text
                  style={[
                    styles.segmentLabel,
                    { color: active ? titleColor : bodyColor },
                    active && styles.segmentLabelActive,
                  ]}
                  numberOfLines={1}>
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
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
  segmentBar: {
    flexDirection: 'row',
    alignSelf: 'stretch',
    width: '100%',
    borderRadius: nrmTokens.radius.md,
    borderWidth: SEGMENT_BORDER_WIDTH,
    overflow: 'hidden',
  },
  segmentCell: {
    flex: 1,
    minWidth: 0,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentDivider: {
    borderLeftWidth: SEGMENT_BORDER_WIDTH,
    borderLeftColor: SEGMENT_BORDER,
  },
  segmentPressed: { opacity: 0.85 },
  segmentLabel: {
    fontSize: nrmTokens.font.body,
    fontWeight: '500',
    textAlign: 'center',
  },
  segmentLabelActive: {
    fontWeight: '700',
  },
});
