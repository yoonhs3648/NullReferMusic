import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { nrmTokens } from '@/constants/nrmTokens';
import type { NrmWhisperModelId } from '@/lib/nrmWhisperCatalog';
import { NRM_WHISPER_MODEL_OPTIONS } from '@/lib/nrmWhisperModelOptions';
import { useWhisperModelStatuses } from '@/lib/nrmWhisperModelStore';
import { usesPcBackendInDev } from '@/lib/nrmDevRuntime';
import { isStandaloneAndroid } from '@/lib/nrmStandalonePlatform';
import {
  isWhisperModelNativeAvailable,
  subscribeWhisperModelDownloadEvents,
  whisperModelDownloadCompleteMessage,
} from '@/lib/nrmWhisperModelNative';
import { notifyUser } from '@/lib/nrmUserNotify';

const PANEL_INPUT_BORDER = Platform.OS === 'web' ? StyleSheet.hairlineWidth : 1;
const showWhisperInstallUi =
  isWhisperModelNativeAvailable() &&
  (isStandaloneAndroid() || (Platform.OS === 'web' && usesPcBackendInDev()));

type Props = {
  value: NrmWhisperModelId;
  onChange: (id: NrmWhisperModelId) => void;
  titleColor: string;
  bodyColor: string;
  /** 메뉴 패널이 보일 때만 true */
  active?: boolean;
};

export function NrmWhisperModelPicker({
  value,
  onChange,
  titleColor,
  bodyColor,
  active = true,
}: Props) {
  const { rows, ready, downloadModel, statusFor } = useWhisperModelStatuses(
    active && showWhisperInstallUi,
  );

  useEffect(() => {
    if (!showWhisperInstallUi || !active) return;
    return subscribeWhisperModelDownloadEvents((ev) => {
      if (ev.phase === 'complete') {
        notifyUser(whisperModelDownloadCompleteMessage(ev.modelId));
      } else if (ev.phase === 'failed') {
        notifyUser('모델 다운로드에 실패했습니다. Wi‑Fi 연결을 확인한 뒤 다시 시도하세요.');
      }
    });
  }, [active]);

  if (showWhisperInstallUi && !ready) {
    return <ActivityIndicator size="small" color={bodyColor} style={styles.loader} />;
  }

  return (
    <View style={styles.list}>
      {NRM_WHISPER_MODEL_OPTIONS.map((opt) => {
        const status = showWhisperInstallUi ? statusFor(opt.id) : undefined;
        const installed = showWhisperInstallUi ? !!status?.installed : true;
        const downloading = showWhisperInstallUi ? !!status?.downloading : false;
        const progress = status?.progress ?? 0;
        const canSelect = installed && !downloading;
        const selected = value === opt.id && canSelect;

        return (
          <View
            key={opt.id}
            style={[
              styles.card,
              {
                borderColor: selected
                  ? nrmTokens.color.primary
                  : 'rgba(128,128,128,0.28)',
                backgroundColor: selected
                  ? nrmTokens.color.accentSoft
                  : Platform.OS === 'web'
                    ? 'rgba(255,255,255,0.02)'
                    : 'transparent',
                opacity: showWhisperInstallUi && !installed && !downloading ? 0.92 : 1,
              },
            ]}>
            <Pressable
              onPress={() => {
                if (canSelect) onChange(opt.id);
              }}
              disabled={!canSelect}
              style={({ pressed }) => [styles.cardMain, pressed && canSelect && styles.pressed]}
              accessibilityRole="radio"
              accessibilityState={{ selected, disabled: !canSelect }}>
              <View style={styles.titleRow}>
                <Text
                  style={[
                    styles.modelName,
                    {
                      color: canSelect
                        ? selected
                          ? nrmTokens.color.primary
                          : titleColor
                        : bodyColor,
                    },
                  ]}>
                  {opt.label}
                </Text>
                {selected ? (
                  <Ionicons
                    name="checkmark-circle"
                    size={22}
                    color={nrmTokens.color.primary}
                  />
                ) : installed ? (
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
                  <Text style={[styles.metricValue, { color: titleColor }]}>
                    {opt.speedLabel}
                  </Text>
                </View>
                <View style={styles.metricDivider} />
                <View style={styles.metric}>
                  <Text style={[styles.metricLabel, { color: bodyColor }]}>가사 품질</Text>
                  <Text style={[styles.metricValue, { color: titleColor }]}>
                    {opt.qualityLabel}
                  </Text>
                </View>
              </View>
            </Pressable>

            {showWhisperInstallUi && !installed ? (
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
                      다운로드 중… {progress}%
                    </Text>
                  </>
                ) : (
                  <View style={styles.downloadBtnRow}>
                    <Pressable
                      onPress={() => void downloadModel(opt.id)}
                      style={({ pressed }) => [
                        styles.downloadBtn,
                        pressed && styles.pressed,
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={`${opt.label} 모델 다운로드`}>
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
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  loader: {
    alignSelf: 'flex-start',
    marginVertical: nrmTokens.space.sm,
  },
  list: {
    gap: nrmTokens.space.sm,
  },
  card: {
    borderRadius: nrmTokens.radius.lg,
    borderWidth: PANEL_INPUT_BORDER,
    overflow: 'hidden',
  },
  pressed: {
    opacity: 0.88,
  },
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
  downloadingBadge: {
    fontSize: nrmTokens.font.caption,
    fontWeight: '600',
  },
  metricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: nrmTokens.space.md,
  },
  metric: {
    flex: 1,
    gap: 2,
  },
  metricLabel: {
    fontSize: nrmTokens.font.caption,
    opacity: 0.72,
    fontWeight: '500',
  },
  metricValue: {
    fontSize: nrmTokens.font.body,
    fontWeight: '600',
  },
  metricDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
    backgroundColor: 'rgba(128,128,128,0.35)',
  },
  downloadBlock: {
    paddingHorizontal: nrmTokens.space.md,
    paddingBottom: 14,
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(128,128,128,0.2)',
  },
  downloadBtnRow: {
    alignItems: 'center',
    marginTop: 10,
  },
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
  downloadHint: {
    fontSize: nrmTokens.font.caption,
    fontWeight: '500',
  },
});
