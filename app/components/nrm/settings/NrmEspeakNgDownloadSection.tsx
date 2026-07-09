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

import { nrmTokens } from '@/constants/nrmTokens';
import {
  fetchEspeakNgStatus,
  isEspeakNgNativeAvailable,
  startEspeakNgDownload,
  subscribeEspeakNgDownloadEvents,
} from '@/lib/nrmEspeakNative';
import { notifyUser } from '@/lib/nrmUserNotify';

const PANEL_INPUT_BORDER = Platform.OS === 'web' ? StyleSheet.hairlineWidth : 1;

type Props = {
  titleColor: string;
  bodyColor: string;
};

export function NrmEspeakNgDownloadSection({ titleColor, bodyColor }: Props) {
  const show = isEspeakNgNativeAvailable();
  const [installed, setInstalled] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [ready, setReady] = useState(!show);

  const refresh = useCallback(async () => {
    if (!show) {
      setReady(true);
      return;
    }
    const s = await fetchEspeakNgStatus();
    setInstalled(s.installed);
    setDownloading(s.downloading);
    setProgress(s.progress);
    setReady(true);
  }, [show]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!show) return;
    return subscribeEspeakNgDownloadEvents((ev) => {
      if (ev.phase === 'failed') {
        notifyUser('eSpeak NG 설치에 실패했습니다.');
      }
      if (ev.phase === 'complete') {
        notifyUser('eSpeak NG 설치가 완료되었습니다.');
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
        <Text style={[styles.title, { color: titleColor }]}>eSpeak NG</Text>
        {installed ? (
          <View style={styles.badgeInstalled}>
            <Text style={styles.badgeInstalledText}>설치됨</Text>
          </View>
        ) : downloading ? (
          <Text style={[styles.downloadingBadge, { color: bodyColor }]}>설치 중</Text>
        ) : null}
      </View>
      <Text style={[styles.desc, { color: bodyColor }]}>
        다국어 가사의 싱크 정확도를 향상시킬 수 있습니다.
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
              onPress={() => void startEspeakNgDownload().then(() => refresh())}
              style={({ pressed }) => [styles.downloadBtn, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="eSpeak NG 설치">
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
