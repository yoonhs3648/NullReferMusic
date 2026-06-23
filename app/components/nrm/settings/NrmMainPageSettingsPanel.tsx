import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { NrmMainPageChartSourcePicker } from '@/components/nrm/settings/NrmMainPageChartSourcePicker';
import { NrmMenuDrawerScroll } from '@/components/nrm/NrmMenuDrawerScroll';
import { nrmTokens } from '@/constants/nrmTokens';
import {
  DEFAULT_MAIN_PAGE_CHART_SOURCE,
  loadMainPageChartSource,
  loadMainPageChartSourceEnabledMap,
  notifyMainPageChartSourceChanged,
  NRM_MAIN_PAGE_CHART_SOURCE_OPTIONS,
  saveMainPageChartSource,
  type NrmMainPageChartSource,
} from '@/lib/nrmMainPageChartSettings';
import {
  notifyMainPageModeChanged,
  saveMainPageMode,
} from '@/lib/nrmMainPageSettings';

type Props = {
  titleColor: string;
  bodyColor: string;
  onBack: () => void;
};

function MenuBackRow({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={styles.backRow}
      accessibilityRole="button"
      accessibilityLabel="뒤로">
      <Ionicons name="chevron-back" size={22} color={nrmTokens.color.primary} />
      <Text style={styles.backText}>뒤로</Text>
    </Pressable>
  );
}

export function NrmMainPageSettingsPanel({ titleColor, bodyColor, onBack }: Props) {
  const [chartSource, setChartSource] = useState<NrmMainPageChartSource>(
    DEFAULT_MAIN_PAGE_CHART_SOURCE,
  );
  const [enabledMap, setEnabledMap] = useState<
    Record<NrmMainPageChartSource, boolean>
  >(() => {
    const map = {} as Record<NrmMainPageChartSource, boolean>;
    for (const opt of NRM_MAIN_PAGE_CHART_SOURCE_OPTIONS) {
      map[opt.id] = !opt.tokenPlatform;
    }
    return map;
  });

  useEffect(() => {
    void (async () => {
      const [source, enabled] = await Promise.all([
        loadMainPageChartSource(),
        loadMainPageChartSourceEnabledMap(),
      ]);
      setChartSource(source);
      setEnabledMap(enabled);
    })();
  }, []);

  const onSelect = useCallback((id: NrmMainPageChartSource) => {
    setChartSource(id);
    void (async () => {
      await Promise.all([
        saveMainPageChartSource(id),
        saveMainPageMode('charts'),
      ]);
      notifyMainPageChartSourceChanged(id);
      notifyMainPageModeChanged('charts');
    })();
  }, []);

  return (
    <NrmMenuDrawerScroll>
      <MenuBackRow onPress={onBack} />
      <Text style={[styles.title, { color: titleColor }]}>메인페이지 설정</Text>
      <Text style={[styles.hint, { color: bodyColor }]}>
        홈 화면에 표시할 차트를 선택합니다.
      </Text>
      <NrmMainPageChartSourcePicker
        options={NRM_MAIN_PAGE_CHART_SOURCE_OPTIONS}
        value={chartSource}
        enabledMap={enabledMap}
        onChange={onSelect}
        titleColor={titleColor}
        bodyColor={bodyColor}
      />
    </NrmMenuDrawerScroll>
  );
}

const styles = StyleSheet.create({
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: nrmTokens.space.sm,
    marginBottom: nrmTokens.space.sm,
  },
  backText: {
    color: nrmTokens.color.primary,
    fontSize: nrmTokens.font.body,
    fontWeight: '500',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: nrmTokens.space.xs,
  },
  hint: {
    fontSize: nrmTokens.font.caption,
    lineHeight: 20,
    marginBottom: nrmTokens.space.md,
  },
});
