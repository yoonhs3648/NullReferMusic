import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';

import {
  NrmSettingsOptionPicker,
  type NrmSettingsOptionItem,
} from '@/components/nrm/settings/NrmSettingsOptionPicker';
import {
  DEFAULT_ALIGN_LYRICS_LANG_DETECTION,
  loadAlignLyricsLangDetectionMode,
  saveAlignLyricsLangDetectionMode,
  type NrmAlignLyricsLangDetectionMode,
} from '@/lib/nrmAlignLyricsLangDetectionSettings';

type Props = {
  titleColor: string;
  bodyColor: string;
  rowHover: string;
};

/** eSpeak NG 옵션은 UI에서 비활성(선택 불가). 다운로드 섹션도 노출하지 않음. */
const BASE_OPTIONS: { id: NrmAlignLyricsLangDetectionMode; label: string }[] = [
  { id: 'manual', label: '수동' },
  { id: 'auto', label: '자동' },
  { id: 'espeak', label: 'eSpeak NG' },
];

export function NrmAlignLyricsLangDetectionPanel({
  titleColor,
  bodyColor,
  rowHover,
}: Props) {
  const [mode, setMode] = useState<NrmAlignLyricsLangDetectionMode>(
    DEFAULT_ALIGN_LYRICS_LANG_DETECTION,
  );

  useEffect(() => {
    void (async () => {
      const saved = await loadAlignLyricsLangDetectionMode();
      if (saved === 'espeak') {
        setMode(DEFAULT_ALIGN_LYRICS_LANG_DETECTION);
        await saveAlignLyricsLangDetectionMode(DEFAULT_ALIGN_LYRICS_LANG_DETECTION);
        return;
      }
      setMode(saved);
    })();
  }, []);

  const options = useMemo((): readonly NrmSettingsOptionItem[] => {
    return BASE_OPTIONS.map((opt) => ({
      ...opt,
      disabled: opt.id === 'espeak',
    }));
  }, []);

  const select = (next: NrmAlignLyricsLangDetectionMode) => {
    if (next === 'espeak') return;
    setMode(next);
    void saveAlignLyricsLangDetectionMode(next);
  };

  const pickerValue = mode === 'espeak' ? DEFAULT_ALIGN_LYRICS_LANG_DETECTION : mode;

  return (
    <View>
      <NrmSettingsOptionPicker
        options={options}
        value={pickerValue}
        onChange={(id) => select(id as NrmAlignLyricsLangDetectionMode)}
        titleColor={titleColor}
        bodyColor={bodyColor}
        rowHover={rowHover}
      />
    </View>
  );
}
