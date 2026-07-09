import { useCallback, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';

import { NrmEspeakNgDownloadSection } from '@/components/nrm/settings/NrmEspeakNgDownloadSection';
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
import {
  fetchEspeakNgStatus,
  isEspeakNgNativeAvailable,
  subscribeEspeakNgDownloadEvents,
} from '@/lib/nrmEspeakNative';

type Props = {
  titleColor: string;
  bodyColor: string;
  rowHover: string;
};

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
  const [espeakInstalled, setEspeakInstalled] = useState(false);
  const [espeakReady, setEspeakReady] = useState(!isEspeakNgNativeAvailable());

  const refreshEspeakInstalled = useCallback(async (): Promise<boolean> => {
    if (!isEspeakNgNativeAvailable()) {
      setEspeakInstalled(false);
      setEspeakReady(true);
      return false;
    }
    const s = await fetchEspeakNgStatus();
    const installed = s.installed && !s.downloading;
    setEspeakInstalled(installed);
    setEspeakReady(true);
    return installed;
  }, []);

  useEffect(() => {
    void (async () => {
      const saved = await loadAlignLyricsLangDetectionMode();
      const installed = await refreshEspeakInstalled();
      if (saved === 'espeak' && !installed) {
        setMode(DEFAULT_ALIGN_LYRICS_LANG_DETECTION);
        await saveAlignLyricsLangDetectionMode(DEFAULT_ALIGN_LYRICS_LANG_DETECTION);
        return;
      }
      setMode(saved);
    })();
  }, [refreshEspeakInstalled]);

  useEffect(() => {
    if (!isEspeakNgNativeAvailable()) return;
    return subscribeEspeakNgDownloadEvents(() => {
      void refreshEspeakInstalled();
    });
  }, [refreshEspeakInstalled]);

  useEffect(() => {
    if (!espeakReady) return;
    if (mode === 'espeak' && !espeakInstalled) {
      setMode(DEFAULT_ALIGN_LYRICS_LANG_DETECTION);
      void saveAlignLyricsLangDetectionMode(DEFAULT_ALIGN_LYRICS_LANG_DETECTION);
    }
  }, [espeakReady, espeakInstalled, mode]);

  const options = useMemo((): readonly NrmSettingsOptionItem[] => {
    return BASE_OPTIONS.map((opt) => ({
      ...opt,
      disabled: opt.id === 'espeak' && !espeakInstalled,
    }));
  }, [espeakInstalled]);

  const select = (next: NrmAlignLyricsLangDetectionMode) => {
    if (next === 'espeak' && !espeakInstalled) return;
    setMode(next);
    void saveAlignLyricsLangDetectionMode(next);
  };

  const pickerValue =
    mode === 'espeak' && !espeakInstalled
      ? DEFAULT_ALIGN_LYRICS_LANG_DETECTION
      : mode;

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
      <NrmEspeakNgDownloadSection titleColor={titleColor} bodyColor={bodyColor} />
    </View>
  );
}
