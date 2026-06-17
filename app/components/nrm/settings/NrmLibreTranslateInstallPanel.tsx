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
import { NRM_LIBRETRANSLATE_PACKAGES } from '@/lib/nrmLibreTranslateCatalog';
import { useLibreTranslatePackageStatuses } from '@/lib/nrmLibreTranslateModelStore';
import {
  fetchLibreTranslateEngineInfo,
  isLibreTranslateNativeAvailable,
  isLibreTranslateOfflineReady,
  libreTranslatePackageCompleteMessage,
  subscribeLibreTranslatePackageDownloadEvents,
} from '@/lib/nrmLibreTranslateModelNative';
import { isStandaloneAndroid } from '@/lib/nrmStandalonePlatform';
import { saveTranslationProvider } from '@/lib/nrmTranslationSettings';
import { notifyUser } from '@/lib/nrmUserNotify';

const PANEL_INPUT_BORDER = Platform.OS === 'web' ? StyleSheet.hairlineWidth : 1;

const showInstallUi = isLibreTranslateNativeAvailable() && isStandaloneAndroid();

type DownloadDetail = {
  step: 'downloading' | 'installing';
  progress: number;
};

function formatDownloadStatus(detail: DownloadDetail | null, progress: number): string {
  if (detail?.step === 'installing') return '설치 중…';
  const pct = Math.min(100, Math.max(0, detail?.progress ?? progress));
  return `받는 중 ${pct}%`;
}

function resolveDisplayProgress(
  downloading: boolean,
  detail: DownloadDetail | null,
  polled: number,
): number {
  if (!downloading) return polled;
  if (detail?.step === 'installing') return 100;
  return Math.min(100, Math.max(0, detail?.progress ?? polled));
}

type Props = {
  titleColor: string;
  bodyColor: string;
  active?: boolean;
};

export function NrmLibreTranslateInstallPanel({
  titleColor,
  bodyColor,
  active = true,
}: Props) {
  const { ready, downloadPackage, statusFor, refresh } = useLibreTranslatePackageStatuses(
    active && showInstallUi,
  );
  const [offlineReady, setOfflineReady] = useState(false);
  const [computeType, setComputeType] = useState<string | null>(null);
  const [downloadDetail, setDownloadDetail] = useState<DownloadDetail | null>(null);

  const refreshEngineState = async () => {
    const [ready, info] = await Promise.all([
      isLibreTranslateOfflineReady(),
      fetchLibreTranslateEngineInfo(),
    ]);
    setOfflineReady(ready);
    setComputeType(info.computeType);
  };

  useEffect(() => {
    if (!showInstallUi || !active) return;
    void refreshEngineState();
    const timer = setInterval(() => {
      void refreshEngineState();
    }, 5000);
    return () => clearInterval(timer);
  }, [active]);

  useEffect(() => {
    if (!showInstallUi || !active) return;
    return subscribeLibreTranslatePackageDownloadEvents((ev) => {
      if (ev.phase === 'progress') {
        setDownloadDetail({
          step: ev.step ?? 'downloading',
          progress: ev.progress,
        });
        void refresh();
      }
      if (ev.phase === 'complete') {
        setDownloadDetail(null);
        void (async () => {
          await refreshEngineState();
          await refresh();
          const ready = await isLibreTranslateOfflineReady();
          if (ready) {
            await saveTranslationProvider('libretranslate');
            notifyUser(libreTranslatePackageCompleteMessage(ev.packageId));
          }
        })();
      } else if (ev.phase === 'failed') {
        setDownloadDetail(null);
        void refresh();
        notifyUser(
          '오프라인 번역기 설치에 실패했습니다. Wi‑Fi 연결을 확인한 뒤 다시 시도하세요.',
        );
      }
    });
  }, [active, refresh]);

  if (!showInstallUi) {
    return (
      <Text style={[styles.unsupported, { color: bodyColor }]}>
        LibreTranslate 오프라인 설치는 Android 앱에서만 사용할 수 있습니다.
      </Text>
    );
  }

  if (!ready) {
    return <ActivityIndicator size="small" color={bodyColor} style={styles.loader} />;
  }

  return (
    <View style={styles.root}>
      <View
        style={[
          styles.readyBanner,
          {
            backgroundColor: offlineReady
              ? 'rgba(34, 160, 80, 0.12)'
              : 'rgba(128,128,128,0.08)',
            borderColor: offlineReady
              ? 'rgba(34, 160, 80, 0.35)'
              : 'rgba(128,128,128,0.22)',
          },
        ]}>
        <Ionicons
          name={offlineReady ? 'checkmark-circle' : 'information-circle-outline'}
          size={20}
          color={offlineReady ? '#22a050' : bodyColor}
        />
        <Text style={[styles.readyText, { color: titleColor }]}>
          {offlineReady
            ? `LibreTranslate 오프라인 번역 준비 완료${computeType ? ` (${computeType})` : ''}`
            : statusFor('libretranslate:pack-en-ko')?.installed
              ? '언어 팩은 설치됐지만 번역 엔진 검증에 실패했습니다. 앱을 최신 버전으로 업데이트한 뒤 다시 설치해 주세요.'
              : statusFor('libretranslate:pack-en-ko')?.downloading
                ? '언어 팩을 설치하는 중입니다…'
                : '영어→한국어 팩을 설치하면 오프라인 번역을 사용할 수 있습니다.'}
        </Text>
      </View>

      <Text style={[styles.sectionHint, { color: bodyColor }]}>
        영어 → 한글 번역만 지원합니다. Android 엔진은 int8_float32(우선) 또는 int8을 사용합니다.
      </Text>

      <View style={styles.list}>
        {NRM_LIBRETRANSLATE_PACKAGES.map((pack) => {
          const status = statusFor(pack.id);
          const installed = !!status?.installed;
          const downloading = !!status?.downloading;
          const progress = status?.progress ?? 0;
          const displayProgress = resolveDisplayProgress(downloading, downloadDetail, progress);
          const statusLabel = formatDownloadStatus(downloadDetail, displayProgress);

          return (
            <View
              key={pack.id}
              style={[
                styles.card,
                {
                  borderColor: installed
                    ? 'rgba(34, 160, 80, 0.45)'
                    : 'rgba(128,128,128,0.28)',
                },
              ]}>
              <View style={styles.cardMain}>
                <View style={styles.titleRow}>
                  <View style={styles.titleBlock}>
                    <Text style={[styles.packName, { color: titleColor }]}>
                      {pack.label}
                    </Text>
                    {pack.description ? (
                      <Text style={[styles.packDesc, { color: bodyColor }]}>
                        {pack.description}
                      </Text>
                    ) : null}
                  </View>
                  {installed ? (
                    <View style={styles.badgeInstalled}>
                      <Text style={styles.badgeInstalledText}>설치됨</Text>
                    </View>
                  ) : downloading ? (
                    <Text style={[styles.downloadingBadge, { color: bodyColor }]}>
                      {statusLabel}
                    </Text>
                  ) : (
                    <Text style={[styles.sizeBadge, { color: bodyColor }]}>{pack.sizeLabel}</Text>
                  )}
                </View>
              </View>

              {!installed ? (
                <View style={styles.downloadBlock}>
                  {downloading ? (
                    <>
                      <View style={styles.progressTrack}>
                        <View
                          style={[
                            styles.progressFill,
                            { width: `${Math.max(displayProgress, displayProgress > 0 ? 4 : 0)}%` },
                          ]}
                        />
                      </View>
                      <Text style={[styles.downloadHint, { color: bodyColor }]}>
                        {statusLabel}
                      </Text>
                    </>
                  ) : (
                    <Pressable
                      onPress={() => void downloadPackage(pack.id)}
                      style={({ pressed }) => [
                        styles.downloadBtn,
                        pressed && styles.pressed,
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={`${pack.label} 언어 팩 다운로드`}>
                      <Ionicons
                        name="cloud-download-outline"
                        size={18}
                        color={nrmTokens.color.onPrimary}
                      />
                      <Text style={styles.downloadBtnLabel}>다운로드</Text>
                    </Pressable>
                  )}
                </View>
              ) : null}
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: nrmTokens.space.md,
  },
  loader: {
    alignSelf: 'flex-start',
    marginVertical: nrmTokens.space.sm,
  },
  unsupported: {
    fontSize: nrmTokens.font.caption,
    lineHeight: 20,
    paddingHorizontal: nrmTokens.space.sm,
  },
  readyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: nrmTokens.space.sm,
    borderWidth: 1,
    borderRadius: nrmTokens.radius.md,
    padding: nrmTokens.space.md,
  },
  readyText: {
    flex: 1,
    fontSize: nrmTokens.font.caption,
    lineHeight: 18,
    fontWeight: '600',
  },
  sectionHint: {
    fontSize: nrmTokens.font.caption,
    lineHeight: 18,
    paddingHorizontal: nrmTokens.space.sm,
  },
  list: {
    gap: nrmTokens.space.sm,
  },
  card: {
    borderRadius: nrmTokens.radius.lg,
    borderWidth: PANEL_INPUT_BORDER,
    overflow: 'hidden',
  },
  cardMain: {
    paddingVertical: 14,
    paddingHorizontal: nrmTokens.space.md,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: nrmTokens.space.sm,
  },
  titleBlock: {
    flex: 1,
    gap: 4,
  },
  packName: {
    fontSize: nrmTokens.font.body,
    fontWeight: '600',
  },
  packDesc: {
    fontSize: nrmTokens.font.caption,
    lineHeight: 18,
  },
  badgeInstalled: {
    backgroundColor: 'rgba(34, 160, 80, 0.14)',
    borderRadius: nrmTokens.radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeInstalledText: {
    color: '#22a050',
    fontSize: nrmTokens.font.caption,
    fontWeight: '700',
  },
  downloadingBadge: {
    fontSize: nrmTokens.font.caption,
    fontWeight: '600',
  },
  sizeBadge: {
    fontSize: nrmTokens.font.caption,
    fontWeight: '600',
    opacity: 0.82,
  },
  downloadBlock: {
    paddingHorizontal: nrmTokens.space.md,
    paddingBottom: nrmTokens.space.md,
    gap: nrmTokens.space.sm,
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
  },
  downloadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: nrmTokens.space.xs,
    backgroundColor: nrmTokens.color.primary,
    borderRadius: nrmTokens.radius.md,
    paddingVertical: nrmTokens.space.sm,
    paddingHorizontal: nrmTokens.space.md,
  },
  downloadBtnLabel: {
    color: nrmTokens.color.onPrimary,
    fontSize: nrmTokens.font.caption,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.88,
  },
});
