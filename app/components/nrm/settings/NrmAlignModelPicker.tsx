import Ionicons from '@expo/vector-icons/Ionicons';

import { useEffect, useMemo, useRef } from 'react';

import {

  ActivityIndicator,

  Platform,

  Pressable,

  StyleSheet,

  Text,

  View,

} from 'react-native';



import { nrmTokens } from '@/constants/nrmTokens';

import type { NrmAlignModelId } from '@/lib/nrmAlignModelCatalog';

import {
  NRM_ALIGN_MODEL_OPTIONS,
  NRM_ALIGN_AENEAS_ID,
  NRM_ALIGN_WAV2VEC2_BASE_ID,
  NRM_ALIGN_WAV2VEC2_XLSR_ID,
  isAlignModelInstallDisabled,
} from '@/lib/nrmAlignModelCatalog';

import { useAlignModelStatuses } from '@/lib/nrmAlignModelStore';

import { usesPcBackendInDev } from '@/lib/nrmDevRuntime';

import { isStandaloneAndroid } from '@/lib/nrmStandalonePlatform';

import {

  alignModelDownloadCompleteMessage,

  isAlignModelNativeAvailable,

  subscribeAlignModelDownloadEvents,

} from '@/lib/nrmAlignModelNative';

import { createFirstInstallAutoSelectTracker } from '@/lib/nrmFirstInstallAutoSelect';

import { notifyUser } from '@/lib/nrmUserNotify';



const PANEL_INPUT_BORDER = Platform.OS === 'web' ? StyleSheet.hairlineWidth : 1;

const showAlignInstallUi =

  isAlignModelNativeAvailable() &&

  (isStandaloneAndroid() || usesPcBackendInDev());



type Props = {

  value: NrmAlignModelId;

  onChange: (id: NrmAlignModelId) => void;

  titleColor: string;

  bodyColor: string;

  active?: boolean;

};



function BundlePackProgress({

  step,

  koProgress,

  enProgress,

  bodyColor,

}: {

  step: 1 | 2;

  koProgress: number;

  enProgress: number;

  bodyColor: string;

}) {

  const rows = [

    { label: '(1/2) 한국어 팩', progress: koProgress, active: step === 1 },

    { label: '(2/2) 영어 팩', progress: enProgress, active: step === 2 },

  ];

  return (

    <View style={styles.bundleProgressWrap}>

      {rows.map((row) => (

        <View key={row.label} style={styles.bundleProgressRow}>

          <Text style={[styles.bundleProgressLabel, { color: bodyColor }]}>

            {row.label} {row.progress}%

          </Text>

          <View style={styles.progressTrack}>

            <View

              style={[

                styles.progressFill,

                {

                  width: `${Math.max(row.active ? row.progress : row.progress > 0 ? 100 : 4, 4)}%`,

                  opacity: row.active || row.progress >= 100 ? 1 : 0.45,

                },

              ]}

            />

          </View>

        </View>

      ))}

    </View>

  );

}



export function NrmAlignModelPicker({

  value,

  onChange,

  titleColor,

  bodyColor,

  active = true,

}: Props) {

  const { rows, ready, downloadModel, statusFor } = useAlignModelStatuses(

    active && showAlignInstallUi,

  );

  const firstInstallTracker = useMemo(
    () => createFirstInstallAutoSelectTracker<NrmAlignModelId>(),
    [],
  );

  const onChangeRef = useRef(onChange);

  onChangeRef.current = onChange;



  useEffect(() => {

    if (!showAlignInstallUi || !active) return;

    return subscribeAlignModelDownloadEvents((ev) => {
      if (ev.phase === 'failed') {
        notifyUser('Forced Alignment 모델 설치에 실패했습니다.');
        firstInstallTracker.clearPending();
        return;
      }
      if (ev.phase !== 'complete') return;
      if (!firstInstallTracker.shouldSelectAfterInstall()) return;

      const pending = firstInstallTracker.pendingModelId();
      if (!pending) return;

      void import('@/lib/nrmAlignModelNative').then(({ isAlignModelInstalled }) => {
        const trySelect = async (modelId: NrmAlignModelId) => {
          const ok = await isAlignModelInstalled(modelId);
          if (!ok) return;
          notifyUser(alignModelDownloadCompleteMessage(modelId));
          onChangeRef.current(modelId);
          firstInstallTracker.clearPending();
        };

        if (pending === NRM_ALIGN_WAV2VEC2_BASE_ID) {
          void trySelect(NRM_ALIGN_WAV2VEC2_BASE_ID);
          return;
        }
        if (pending === NRM_ALIGN_WAV2VEC2_XLSR_ID) {
          void trySelect(NRM_ALIGN_WAV2VEC2_XLSR_ID);
          return;
        }
        if (pending === NRM_ALIGN_AENEAS_ID) {
          void trySelect(NRM_ALIGN_AENEAS_ID);
        }
      });
    });

  }, [active, firstInstallTracker]);



  if (showAlignInstallUi && !ready) {

    return <ActivityIndicator size="small" color={bodyColor} style={styles.loader} />;

  }



  return (

    <View style={styles.list}>

      {NRM_ALIGN_MODEL_OPTIONS.map((opt) => {

        const status = showAlignInstallUi ? statusFor(opt.id) : undefined;

        const installed = showAlignInstallUi ? !!status?.installed : true;

        const downloading = showAlignInstallUi ? !!status?.downloading : false;

        const bundle = status?.bundlePackProgress;

        const canSelect = installed && !downloading;

        const installDisabled = isAlignModelInstallDisabled(opt.id);

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

                opacity: showAlignInstallUi && !installed && !downloading ? 0.92 : 1,

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

                    설치 중

                  </Text>

                ) : (

                  <Text style={[styles.sizeBadge, { color: bodyColor }]}>{opt.sizeLabel}</Text>

                )}

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

                  <Text style={[styles.metricLabel, { color: bodyColor }]}>싱크 품질</Text>

                  <Text style={[styles.metricValue, { color: titleColor }]}>

                    {opt.qualityLabel}

                  </Text>

                </View>

              </View>

            </Pressable>



            {showAlignInstallUi && !installed ? (

              <View style={styles.downloadBlock}>

                {downloading && opt.id === NRM_ALIGN_WAV2VEC2_BASE_ID && bundle ? (

                  <BundlePackProgress

                    step={bundle.step}

                    koProgress={bundle.koProgress}

                    enProgress={bundle.enProgress}

                    bodyColor={bodyColor}

                  />

                ) : downloading ? (

                  <>

                    <View style={styles.progressTrack}>

                      <View style={[styles.progressFill, { width: '40%' }]} />

                    </View>

                    <Text style={[styles.downloadHint, { color: bodyColor }]}>설치 중…</Text>

                  </>

                ) : installDisabled ? (

                  <Text style={[styles.downloadHint, { color: bodyColor }]}>
                    설치 준비 중 (일시 중단)
                  </Text>

                ) : (

                  <View style={styles.downloadBtnRow}>

                    <Pressable

                      onPress={() => {
                        firstInstallTracker.markDownloadStart(
                          rows.some((r) => r.installed && !r.downloading),
                          opt.id,
                        );
                        void downloadModel(opt.id);
                      }}

                      style={({ pressed }) => [

                        styles.downloadBtn,

                        pressed && styles.pressed,

                      ]}

                      accessibilityRole="button"

                      accessibilityLabel={`${opt.label} 설치`}>

                      <Ionicons

                        name="cloud-download-outline"

                        size={18}

                        color={nrmTokens.color.onPrimary}

                      />

                      <Text style={styles.downloadBtnLabel}>설치</Text>

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

  loader: { marginVertical: nrmTokens.space.sm },

  list: { gap: nrmTokens.space.sm },

  card: {

    borderRadius: nrmTokens.radius.lg,

    borderWidth: PANEL_INPUT_BORDER,

    overflow: 'hidden',

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

  sizeBadge: { fontSize: nrmTokens.font.caption, fontWeight: '600', opacity: 0.82 },

  metricsRow: { flexDirection: 'row', alignItems: 'center', gap: nrmTokens.space.md },

  metric: { flex: 1, gap: 2 },

  metricLabel: { fontSize: nrmTokens.font.caption, opacity: 0.72, fontWeight: '500' },

  metricValue: { fontSize: nrmTokens.font.body, fontWeight: '600' },

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

  bundleProgressWrap: { gap: 10, marginTop: 4 },

  bundleProgressRow: { gap: 4 },

  bundleProgressLabel: { fontSize: nrmTokens.font.caption, fontWeight: '600' },

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


