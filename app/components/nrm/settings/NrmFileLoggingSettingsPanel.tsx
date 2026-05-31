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
import { getNrmLogFilePath } from '@/lib/nrmFileLog';
import {
  loadNrmFileLoggingEnabled,
  NRM_FILE_LOG_DISPLAY_PATH,
  saveNrmFileLoggingEnabled,
} from '@/lib/nrmFileLoggingSettings';

const SEGMENT_BORDER = 'rgba(128,128,128,0.4)';
const SEGMENT_BORDER_WIDTH = Platform.OS === 'web' ? StyleSheet.hairlineWidth : 1;

const LOGGING_OPTIONS = [
  { value: false, label: '미설정' },
  { value: true, label: '설정' },
] as const;

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

export function NrmFileLoggingSettingsPanel({
  titleColor,
  bodyColor,
  onBack,
}: Props) {
  const [enabled, setEnabled] = useState(false);
  const [logPath, setLogPath] = useState(NRM_FILE_LOG_DISPLAY_PATH);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const segmentBg = 'rgba(128,128,128,0.08)';
  const segmentActiveBg = 'rgba(0, 102, 204, 0.28)';

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [stored, resolvedPath] = await Promise.all([
        loadNrmFileLoggingEnabled(),
        getNrmLogFilePath(),
      ]);
      if (cancelled) return;
      setEnabled(stored);
      if (resolvedPath?.trim()) {
        setLogPath(resolvedPath.trim());
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const persist = useCallback(
    async (next: boolean) => {
      if (next === enabled) return;
      setSaving(true);
      try {
        await saveNrmFileLoggingEnabled(next);
        setEnabled(next);
      } finally {
        setSaving(false);
      }
    },
    [enabled],
  );

  return (
    <NrmMenuDrawerScroll>
      <MenuBackRow onPress={onBack} />
      <Text style={[styles.panelTitle, { color: titleColor }]}>로깅</Text>
      <Text style={[styles.lead, { color: bodyColor }]}>
        앱 실행·다운로드·Whisper 등 디버그 로그를 기기 Download 폴더에 기록합니다.
      </Text>
      <Text style={[styles.pathLabel, { color: bodyColor }]}>
        로깅 경로 : {logPath}
      </Text>
      {Platform.OS !== 'android' ? (
        <Text style={[styles.note, { color: bodyColor }]}>
          파일 로깅은 Android APK에서만 사용됩니다.
        </Text>
      ) : null}

      {loading ? (
        <ActivityIndicator color={nrmTokens.color.primary} style={styles.loader} />
      ) : (
        <View
          style={[
            styles.segmentBar,
            { backgroundColor: segmentBg, borderColor: SEGMENT_BORDER },
          ]}
          accessibilityRole="radiogroup"
          accessibilityLabel="로깅 설정">
          {LOGGING_OPTIONS.map((opt, index) => {
            const active = enabled === opt.value;
            return (
              <Pressable
                key={opt.label}
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
    marginBottom: nrmTokens.space.sm,
  },
  pathLabel: {
    fontSize: nrmTokens.font.caption,
    lineHeight: 20,
    marginBottom: nrmTokens.space.md,
    fontWeight: '500',
  },
  note: {
    fontSize: nrmTokens.font.caption,
    lineHeight: 20,
    marginBottom: nrmTokens.space.md,
    opacity: 0.85,
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
