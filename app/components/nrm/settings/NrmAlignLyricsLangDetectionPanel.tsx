import { useEffect, useState } from 'react';

import { NrmSettingsOptionPicker } from '@/components/nrm/settings/NrmSettingsOptionPicker';
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

const OPTIONS: { id: NrmAlignLyricsLangDetectionMode; label: string }[] = [
  { id: 'manual', label: '수동' },
  { id: 'auto', label: '자동' },
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
    void loadAlignLyricsLangDetectionMode().then(setMode);
  }, []);

  const select = (next: NrmAlignLyricsLangDetectionMode) => {
    setMode(next);
    void saveAlignLyricsLangDetectionMode(next);
  };

  return (
    <NrmSettingsOptionPicker
      options={OPTIONS}
      value={mode}
      onChange={(id) => select(id as NrmAlignLyricsLangDetectionMode)}
      titleColor={titleColor}
      bodyColor={bodyColor}
      rowHover={rowHover}
    />
  );
}
