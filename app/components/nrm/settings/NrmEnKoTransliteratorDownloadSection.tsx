import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { nrmTokens } from '@/constants/nrmTokens';
import {
  fetchEnKoTransliteratorStatus,
  isEnKoTransliteratorNativeAvailable,
  startEnKoTransliteratorDownload,
  subscribeEnKoTransliteratorDownloadEvents,
} from '@/lib/nrmEnKoTransliteratorNative';
import { notifyUser } from '@/lib/nrmUserNotify';

const PANEL_INPUT_BORDER = Platform.OS === 'web' ? StyleSheet.hairlineWidth : 1;

type Props = {
  titleColor: string;
  bodyColor: string;
  /** 설치 상태가 바뀔 때 (패널 옵션 활성/비활성 동기화) */
  onInstalledChange?: (installed: boolean) => void;
};

export function NrmEnKoTransliteratorDownloadSection({
  titleColor,
  bodyColor,
  onInstalledChange,
}: Props) {
  const show = isEnKoTransliteratorNativeAvailable();
  const [installed, setInstalled] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [ready, setReady] = useState(!show);
  const onInstalledChangeRef = useRef(onInstalledChange);
  onInstalledChangeRef.current = onInstalledChange;

  const refresh = useCallback(async () => {
    if (!show) {
      setReady(true);
      onInstalledChangeRef.current?.(false);
      return;
    }
    const s = await fetchEnKoTransliteratorStatus();
    const isInstalled = s.installed && !s.downloading;
    setInstalled(s.installed);
    setDownloading(s.downloading);
    setProgress(s.progress);
    setReady(true);
    onInstalledChangeRef.current?.(isInstalled);
  }, [show]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!show) return;
    return subscribeEnKoTransliteratorDownloadEvents((ev) => {
      if (ev.phase === 'failed') {
        notifyUser('en-ko-transliterator 설치에 실패했습니다.');
      }
      if (ev.phase === 'complete') {
        notifyUser('en-ko-transliterator 설치가 완료되었습니다.');
      }
      void refresh();
    });
  }, [refresh, show]);

  if (!show) return null;
  if (!ready) {
    return <ActivityIndicator size="small" color={bodyColor} style={styles.loader} />;
  }

  return (
    <View style={[styles.card, { borderColor: 'rgba(128,128,128,0.28)' }]}>
      <View style={styles.headerRow}>
        <Text style={[styles.title, { color: titleColor }]}>en-ko-transliterator</Text>
        {installed ? (
          <View style={styles.badgeInstalled}>
            <Text style={styles.badgeInstalledText}>설치됨</Text>
          </View>
        ) : downloading ? (
          <Text style={[styles.downloadingBadge, { color: bodyColor }]}>설치 중</Text>
        ) : null}
      </View>
      <Text style={[styles.desc, { color: bodyColor }]}>
        영어 가사를 한국어 발음으로 바꿔 싱크 정확도를 높입니다.
      </Text>
      {!installed ? (
        <View style={styles.downloadBlock}>
          {downloading ? (
            <>
              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${Math.max(progress, 4)}%` },
                  ]}
                />
              </View>
              <Text style={[styles.downloadHint, { color: bodyColor }]}>
                설치 중… {progress}%
              </Text>
            </>
          ) : (
            <Pressable
              onPress={() => void startEnKoTransliteratorDownload().then(() => refresh())}
              style={({ pressed }) => [styles.downloadBtn, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="en-ko-transliterator 설치">
              <Ionicons name="cloud-download-outline" size={18} color={nrmTokens.color.onPrimary} />
              <Text style={styles.downloadBtnLabel}>설치</Text>
            </Pressable>
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  loader: { marginVertical: nrmTokens.space.sm },
  card: {
    marginTop: nrmTokens.space.lg,
    borderRadius: nrmTokens.radius.lg,
    borderWidth: PANEL_INPUT_BORDER,
    padding: nrmTokens.space.md,
    gap: 10,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: nrmTokens.space.sm,
  },
  title: {
    fontSize: nrmTokens.font.bodyStrong,
    fontWeight: '700',
  },
  desc: {
    fontSize: nrmTokens.font.body,
    lineHeight: 22,
    opacity: 0.88,
  },
  badgeInstalled: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: nrmTokens.radius.pill,
    backgroundColor: 'rgba(29, 130, 56, 0.14)',
  },
  badgeInstalledText: {
    fontSize: nrmTokens.font.caption,
    fontWeight: '600',
    color: nrmTokens.color.success,
  },
  downloadingBadge: { fontSize: nrmTokens.font.caption, fontWeight: '600' },
  downloadBlock: { gap: 8, marginTop: 4 },
  downloadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: nrmTokens.radius.pill,
    backgroundColor: nrmTokens.color.primary,
    alignSelf: 'center',
  },
  downloadBtnLabel: {
    color: nrmTokens.color.onPrimary,
    fontSize: nrmTokens.font.buttonUtility,
    fontWeight: '600',
  },
  pressed: { opacity: 0.88 },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(128,128,128,0.2)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: nrmTokens.color.primary,
    borderRadius: 3,
  },
  downloadHint: { fontSize: nrmTokens.font.caption, fontWeight: '500' },
});
