import { StyleSheet, Switch, Text, View } from 'react-native';

import { NrmDownloadEncodeOptionPicker } from '@/components/nrm/settings/NrmDownloadEncodeOptionPicker';
import { nrmTokens } from '@/constants/nrmTokens';
import {
  NRM_MELON_SYNC_QUALITY_OPTIONS,
  saveMelonSyncSettings,
  type NrmMelonSyncQuality,
  type NrmMelonSyncSettings,
} from '@/lib/nrmMelonSyncSettings';

const SETTINGS_SWITCH_TRACK = {
  false: 'rgba(128,128,128,0.35)',
  true: nrmTokens.color.accentDim,
} as const;

type Props = {
  settings: NrmMelonSyncSettings;
  onChange: (next: NrmMelonSyncSettings) => void;
  titleColor: string;
  bodyColor: string;
};

export function NrmMelonSyncSettingsPanel({
  settings,
  onChange,
  titleColor,
  bodyColor,
}: Props) {
  const patch = (partial: Partial<NrmMelonSyncSettings>) => {
    const next = { ...settings, ...partial };
    onChange(next);
    void saveMelonSyncSettings(next);
  };

  return (
    <View style={styles.root}>
      <Text style={[styles.sectionLabel, { color: bodyColor }]}>멜론 싱크 품질</Text>
      <Text style={[styles.hint, { color: bodyColor }]}>
        wav2vec2-base Forced Alignment 정확도·속도·메모리 사용을 조절합니다.
      </Text>
      <NrmDownloadEncodeOptionPicker
        options={NRM_MELON_SYNC_QUALITY_OPTIONS}
        value={settings.quality}
        onChange={(id) => patch({ quality: id as NrmMelonSyncQuality })}
        titleColor={titleColor}
        bodyColor={bodyColor}
      />

      <View style={styles.toggleBlock}>
        <View style={styles.toggleText}>
          <Text style={[styles.toggleTitle, { color: titleColor }]}>첫 줄 intro 보정</Text>
          <Text style={[styles.toggleBody, { color: bodyColor }]}>
            인트로 연주 구간에 첫 가사가 붙는 것을 줄입니다.
          </Text>
        </View>
        <Switch
          value={settings.firstLineIntroCorrection}
          onValueChange={(firstLineIntroCorrection) => patch({ firstLineIntroCorrection })}
          trackColor={SETTINGS_SWITCH_TRACK}
          thumbColor={
            settings.firstLineIntroCorrection ? nrmTokens.color.accent : '#f4f4f5'
          }
        />
      </View>

      <View style={styles.toggleBlock}>
        <View style={styles.toggleText}>
          <Text style={[styles.toggleTitle, { color: titleColor }]}>보컬 구간 자동 감지</Text>
          <Text style={[styles.toggleBody, { color: bodyColor }]}>
            에너지 기반으로 노래 구간을 추정해 정렬 범위를 좁힙니다.
          </Text>
        </View>
        <Switch
          value={settings.vocalRangeAutoDetect}
          onValueChange={(vocalRangeAutoDetect) => patch({ vocalRangeAutoDetect })}
          trackColor={SETTINGS_SWITCH_TRACK}
          thumbColor={settings.vocalRangeAutoDetect ? nrmTokens.color.accent : '#f4f4f5'}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: nrmTokens.space.sm },
  sectionLabel: {
    fontSize: 15,
    fontWeight: '600',
    marginTop: nrmTokens.space.xs,
  },
  hint: {
    fontSize: 14,
    lineHeight: 20,
    opacity: 0.88,
    marginBottom: nrmTokens.space.xs,
  },
  toggleBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: nrmTokens.space.md,
    paddingVertical: nrmTokens.space.xs,
    marginBottom: nrmTokens.space.sm,
  },
  toggleText: { flex: 1, minWidth: 0 },
  toggleTitle: {
    fontSize: nrmTokens.font.body,
    fontWeight: '600',
    marginBottom: 4,
  },
  toggleBody: { fontSize: 14, lineHeight: 20, opacity: 0.88 },
});
