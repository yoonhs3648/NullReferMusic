import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';

import { NrmMenuDrawerScroll } from '@/components/nrm/NrmMenuDrawerScroll';
import { nrmTokens } from '@/constants/nrmTokens';
import { getNrmLogFilePath } from '@/lib/nrmFileLog';
import {
  deleteAllNrmLogFiles,
  NRM_FILE_LOG_DISPLAY_PATH,
} from '@/lib/nrmFileLoggingSettings';
import {
  refreshNrmFileLoggingFromStorage,
  setNrmFileLoggingActive,
} from '@/lib/nrmFileLoggingRuntime';
import { confirmUser, notifyUser } from '@/lib/nrmUserNotify';

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
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [stored, resolvedPath] = await Promise.all([
        refreshNrmFileLoggingFromStorage(),
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

  const onToggleLogging = useCallback(
    async (next: boolean) => {
      if (next === enabled || saving) return;
      setSaving(true);
      try {
        await setNrmFileLoggingActive(next);
        setEnabled(next);
      } finally {
        setSaving(false);
      }
    },
    [enabled, saving],
  );

  const onDeleteLogs = useCallback(async () => {
    if (deleting) return;
    const ok = await confirmUser('모든 로그를 삭제할까요?');
    if (!ok) return;
    setDeleting(true);
    try {
      const count = await deleteAllNrmLogFiles();
      void notifyUser(
        count > 0
          ? `${count}개의 로그 파일을 삭제했습니다.`
          : '삭제할 로그 파일이 없습니다.',
      );
    } finally {
      setDeleting(false);
    }
  }, [deleting]);

  return (
    <NrmMenuDrawerScroll>
      <MenuBackRow onPress={onBack} />
      <Text style={[styles.panelTitle, { color: titleColor }]}>로깅</Text>
      <Text style={[styles.pathLabel, { color: bodyColor }]}>
        로그위치 : {logPath}
      </Text>
      {Platform.OS !== 'android' ? (
        <Text style={[styles.note, { color: bodyColor }]}>
          파일 로깅은 Android APK에서만 사용됩니다.
        </Text>
      ) : null}

      {loading ? (
        <ActivityIndicator color={nrmTokens.color.primary} style={styles.loader} />
      ) : (
        <>
          <View style={styles.switchRow}>
            <Text style={[styles.switchTitle, { color: titleColor }]}>로깅</Text>
            <Switch
              value={enabled}
              onValueChange={(v) => void onToggleLogging(v)}
              disabled={saving || Platform.OS !== 'android'}
              trackColor={{
                false: 'rgba(128,128,128,0.35)',
                true: nrmTokens.color.accentDim,
              }}
              thumbColor={enabled ? nrmTokens.color.accent : '#f4f4f5'}
            />
          </View>

          <Pressable
            onPress={() => void onDeleteLogs()}
            disabled={deleting || Platform.OS !== 'android'}
            style={({ pressed }) => [
              styles.deleteBtn,
              (deleting || Platform.OS !== 'android') && styles.deleteBtnDisabled,
              pressed && !deleting && styles.deleteBtnPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="로그 삭제">
            <Text style={[styles.deleteBtnLabel, { color: titleColor }]}>
              로그 삭제
            </Text>
          </Pressable>
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
  pathLabel: {
    fontSize: nrmTokens.font.caption,
    lineHeight: 20,
    marginBottom: nrmTokens.space.lg,
  },
  note: {
    fontSize: nrmTokens.font.caption,
    lineHeight: 20,
    marginBottom: nrmTokens.space.md,
    opacity: 0.85,
  },
  loader: { marginVertical: nrmTokens.space.xl },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: nrmTokens.space.lg,
    paddingVertical: nrmTokens.space.xs,
  },
  switchTitle: {
    fontSize: nrmTokens.font.body,
    fontWeight: '600',
  },
  deleteBtn: {
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: nrmTokens.radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(128,128,128,0.4)',
  },
  deleteBtnDisabled: {
    opacity: 0.55,
  },
  deleteBtnPressed: {
    opacity: 0.92,
  },
  deleteBtnLabel: {
    fontSize: nrmTokens.font.body,
    fontWeight: '600',
  },
});
