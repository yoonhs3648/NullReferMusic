import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { nrmTokens } from '@/constants/nrmTokens';
import { NRM_WHISPERX_ALIGN_CATALOG } from '@/lib/nrmWhisperXAlignCatalog';
import {
  fetchWhisperXAlignModelStatuses,
  isWhisperXAlignNativeAvailable,
  startWhisperXAlignModelDownload,
  subscribeWhisperXAlignDownloadEvents,
  whisperXAlignDownloadCompleteMessage,
} from '@/lib/nrmWhisperXAlignNative';
import { usesPcBackendInDev } from '@/lib/nrmDevRuntime';
import { isStandaloneAndroid } from '@/lib/nrmStandalonePlatform';
import { notifyUser } from '@/lib/nrmUserNotify';

const PANEL_INPUT_BORDER = Platform.OS === 'web' ? StyleSheet.hairlineWidth : 1;
const showAlignInstallUi =
  isWhisperXAlignNativeAvailable() &&
  (isStandaloneAndroid() || (Platform.OS === 'web' && usesPcBackendInDev()));

type Props = {
  titleColor: string;
  bodyColor: string;
  active?: boolean;
};

export function NrmWhisperXAlignPicker({ titleColor, bodyColor, active = true }: Props) {
  const entry = NRM_WHISPERX_ALIGN_CATALOG;
  const [rows, setRows] = useState<Awaited<ReturnType<typeof fetchWhisperXAlignModelStatuses>>>([]);
  const [ready, setReady] = useState(!showAlignInstallUi);

  useEffect(() => {
    if (!showAlignInstallUi || !active) return;
    let cancelled = false;
    const refresh = async () => {
      const next = await fetchWhisperXAlignModelStatuses();
      if (!cancelled) {
        setRows(next);
        setReady(true);
      }
    };
    void refresh();
    const poll = setInterval(() => void refresh(), 5000);
    return () => {
      cancelled = true;
      clearInterval(poll);
    };
  }, [active]);

  useEffect(() => {
    if (!showAlignInstallUi || !active) return;
    return subscribeWhisperXAlignDownloadEvents((ev) => {
      if (ev.phase === 'complete') {
        notifyUser(whisperXAlignDownloadCompleteMessage());
        void fetchWhisperXAlignModelStatuses().then(setRows);
      } else if (ev.phase === 'failed') {
        notifyUser('WhisperX Forced Alignment 모델 다운로드에 실패했습니다.');
      }
    });
  }, [active]);

  if (!showAlignInstallUi) return null;
  if (!ready) {
    return <ActivityIndicator size="small" color={bodyColor} style={styles.loader} />;
  }

  const status = rows[0];
  const installed = !!status?.installed;
  const downloading = !!status?.downloading;
  const progress = status?.progress ?? 0;

  return (
    <View
      style={[
        styles.card,
        {
          borderColor: installed ? nrmTokens.color.primary : 'rgba(128,128,128,0.28)',
          backgroundColor: installed
            ? nrmTokens.color.accentSoft
            : Platform.OS === 'web'
              ? 'rgba(255,255,255,0.02)'
              : 'transparent',
        },
      ]}>
      <View style={styles.cardMain}>
        <View style={styles.titleRow}>
          <Text style={[styles.modelName, { color: titleColor }]}>{entry.label}</Text>
          {installed ? (
            <View style={styles.badgeInstalled}>
              <Text style={styles.badgeInstalledText}>설치됨</Text>
            </View>
          ) : downloading ? (
            <Text style={[styles.downloadingBadge, { color: bodyColor }]}>
              받는 중 {progress}%
            </Text>
          ) : null}
        </View>
        <View style={styles.metricsRow}>
          <View style={styles.metric}>
            <Text style={[styles.metricLabel, { color: bodyColor }]}>속도</Text>
            <Text style={[styles.metricValue, { color: titleColor }]}>{entry.speedLabel}</Text>
          </View>
          <View style={styles.metricDivider} />
          <View style={styles.metric}>
            <Text style={[styles.metricLabel, { color: bodyColor }]}>가사 품질</Text>
            <Text style={[styles.metricValue, { color: titleColor }]}>{entry.qualityLabel}</Text>
          </View>
        </View>
        <Text style={[styles.desc, { color: bodyColor }]}>
          멜론 가사(알려진 텍스트)를 wav2vec2 CTC forced alignment로 오디오에 맞춰 LRC
          타임스탬프를 생성합니다. ONNX 모델·vocab 등 약 1.2GB를 기기에 받습니다.
        </Text>
      </View>
      {!installed ? (
        <View style={styles.downloadBlock}>
          {downloading ? (
            <>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${Math.max(progress, 4)}%` }]} />
              </View>
              <Text style={[styles.downloadHint, { color: bodyColor }]}>
                다운로드 중… {progress}%
              </Text>
            </>
          ) : (
            <View style={styles.downloadBtnRow}>
              <Pressable
                onPress={() => void startWhisperXAlignModelDownload()}
                style={({ pressed }) => [styles.downloadBtn, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel="WhisperX Forced Alignment 모델 다운로드">
                <Ionicons
                  name="cloud-download-outline"
                  size={18}
                  color={nrmTokens.color.onPrimary}
                />
                <Text style={styles.downloadBtnLabel}>다운로드</Text>
              </Pressable>
            </View>
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  loader: { marginVertical: nrmTokens.space.sm },
  card: {
    borderRadius: nrmTokens.radius.lg,
    borderWidth: PANEL_INPUT_BORDER,
    overflow: 'hidden',
    marginBottom: nrmTokens.space.sm,
  },
  pressed: { opacity: 0.88 },
  cardMain: {
    paddingVertical: 14,
    paddingHorizontal: nrmTokens.space.md,
    gap: 10,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: nrmTokens.space.sm,
  },
  modelName: {
    fontSize: nrmTokens.font.bodyStrong,
    fontWeight: '700',
    letterSpacing: -0.2,
    flex: 1,
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
  metricsRow: { flexDirection: 'row', alignItems: 'center', gap: nrmTokens.space.md },
  metric: { flex: 1, gap: 2 },
  metricLabel: { fontSize: nrmTokens.font.caption, opacity: 0.72, fontWeight: '500' },
  metricValue: { fontSize: nrmTokens.font.body, fontWeight: '600' },
  metricDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
    backgroundColor: 'rgba(128,128,128,0.35)',
  },
  desc: { fontSize: nrmTokens.font.caption, lineHeight: 18, opacity: 0.88 },
  downloadBlock: {
    paddingHorizontal: nrmTokens.space.md,
    paddingBottom: 14,
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(128,128,128,0.2)',
  },
  downloadBtnRow: { alignItems: 'center', marginTop: 10 },
  downloadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: nrmTokens.radius.pill,
    backgroundColor: nrmTokens.color.primary,
  },
  downloadBtnLabel: {
    color: nrmTokens.color.onPrimary,
    fontSize: nrmTokens.font.buttonUtility,
    fontWeight: '600',
  },
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
