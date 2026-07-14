import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState, View, type AppStateStatus } from 'react-native';

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
import {
  fetchEnKoTransliteratorStatus,
  isEnKoTransliteratorNativeAvailable,
  subscribeEnKoTransliteratorDownloadEvents,
} from '@/lib/nrmEnKoTransliteratorNative';

type Props = {
  titleColor: string;
  bodyColor: string;
  rowHover: string;
};

const BASE_OPTIONS: { id: NrmAlignLyricsLangDetectionMode; label: string }[] = [
  { id: 'manual', label: '수동' },
  { id: 'auto', label: '자동' },
  { id: 'transliterator', label: '다국어 발음 전처리' },
];

export function NrmAlignLyricsLangDetectionPanel({
  titleColor,
  bodyColor,
  rowHover,
}: Props) {
  const [mode, setMode] = useState<NrmAlignLyricsLangDetectionMode>(
    DEFAULT_ALIGN_LYRICS_LANG_DETECTION,
  );
  const [transliteratorReady, setTransliteratorReady] = useState(false);

  /**
   * 옵션 활성/비활성은 설치 여부만 본다.
   * (설정 화면에서 ONNX probe 하면 모델 로드로 수 초 비활성·간헐 실패 → 수동/자동 탭 뒤
   *  늦게 활성화되는 것처럼 보였음. 실제 전처리는 FA 직전에 probe.)
   */
  const refreshTransliteratorReady = useCallback(async () => {
    if (!isEnKoTransliteratorNativeAvailable()) {
      setTransliteratorReady(false);
      return false;
    }
    const status = await fetchEnKoTransliteratorStatus();
    const ready = status.installed && !status.downloading;
    setTransliteratorReady(ready);
    return ready;
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const saved = await loadAlignLyricsLangDetectionMode();
      const ready = await refreshTransliteratorReady();
      if (cancelled) return;
      if (saved === 'transliterator' && !ready) {
        setMode(DEFAULT_ALIGN_LYRICS_LANG_DETECTION);
        void saveAlignLyricsLangDetectionMode(DEFAULT_ALIGN_LYRICS_LANG_DETECTION);
      } else {
        setMode(saved);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshTransliteratorReady]);

  useEffect(() => {
    if (!isEnKoTransliteratorNativeAvailable()) return;
    return subscribeEnKoTransliteratorDownloadEvents(() => {
      void (async () => {
        const ready = await refreshTransliteratorReady();
        if (ready) return;
        setMode((cur) => {
          if (cur !== 'transliterator') return cur;
          void saveAlignLyricsLangDetectionMode(DEFAULT_ALIGN_LYRICS_LANG_DETECTION);
          return DEFAULT_ALIGN_LYRICS_LANG_DETECTION;
        });
      })();
    });
  }, [refreshTransliteratorReady]);

  // 설정 화면 재진입·포그라운드 복귀 시 설치 상태 재확인
  useEffect(() => {
    const onState = (state: AppStateStatus) => {
      if (state === 'active') void refreshTransliteratorReady();
    };
    const sub = AppState.addEventListener('change', onState);
    return () => sub.remove();
  }, [refreshTransliteratorReady]);

  const options = useMemo((): readonly NrmSettingsOptionItem[] => {
    return BASE_OPTIONS.map((opt) => ({
      ...opt,
      disabled: opt.id === 'transliterator' ? !transliteratorReady : false,
    }));
  }, [transliteratorReady]);

  const select = (next: NrmAlignLyricsLangDetectionMode) => {
    if (next === 'transliterator' && !transliteratorReady) return;
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
        onInstalledChange={(installed) => {
          setTransliteratorReady(installed);
          if (!installed) {
            setMode((cur) => {
              if (cur !== 'transliterator') return cur;
              void saveAlignLyricsLangDetectionMode(DEFAULT_ALIGN_LYRICS_LANG_DETECTION);
              return DEFAULT_ALIGN_LYRICS_LANG_DETECTION;
            });
          }
        }}
      />
    </View>
  );
}
