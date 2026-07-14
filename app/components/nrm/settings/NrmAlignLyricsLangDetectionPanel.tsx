import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';

import { NrmEnKoTransliteratorDownloadSection } from '@/components/nrm/settings/NrmEnKoTransliteratorDownloadSection';
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

const BASE_OPTIONS: { id: NrmAlignLyricsLangDetectionMode; label: string }[] = [
  { id: 'manual', label: '수동' },
  { id: 'auto', label: '자동' },
  { id: 'transliterator', label: 'EN→KO 발음' },
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
      setMode(saved);
    })();
  }, []);

  const options = useMemo((): readonly NrmSettingsOptionItem[] => {
    return BASE_OPTIONS.map((opt) => ({ ...opt }));
  }, []);

  const select = (next: NrmAlignLyricsLangDetectionMode) => {
    setMode(next);
    void saveAlignLyricsLangDetectionMode(next);
  };

  return (
    <View>
      <NrmSettingsOptionPicker
        options={options}
        value={mode}
        onChange={(id) => select(id as NrmAlignLyricsLangDetectionMode)}
        titleColor={titleColor}
        bodyColor={bodyColor}
        rowHover={rowHover}
      />
      <NrmEnKoTransliteratorDownloadSection
        titleColor={titleColor}
        bodyColor={bodyColor}
      />
    </View>
  );
}
