import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { NrmDownloadEncodeOptionPicker } from '@/components/nrm/settings/NrmDownloadEncodeOptionPicker';
import { NrmMenuDrawerScroll } from '@/components/nrm/NrmMenuDrawerScroll';
import { nrmTokens } from '@/constants/nrmTokens';
import {
  DEFAULT_MAIN_PAGE_MODE,
  loadMainPageMode,
  notifyMainPageModeChanged,
  NRM_MAIN_PAGE_MODE_OPTIONS,
  saveMainPageMode,
  type NrmMainPageMode,
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
  const [mode, setMode] = useState<NrmMainPageMode>(DEFAULT_MAIN_PAGE_MODE);

  useEffect(() => {
    void loadMainPageMode().then(setMode);
  }, []);

  const onSelect = useCallback((id: string) => {
    const next = id as NrmMainPageMode;
    setMode(next);
    void saveMainPageMode(next).then(() => notifyMainPageModeChanged(next));
  }, []);

  return (
    <NrmMenuDrawerScroll>
      <MenuBackRow onPress={onBack} />
      <Text style={[styles.title, { color: titleColor }]}>메인페이지 설정</Text>
      <Text style={[styles.hint, { color: bodyColor }]}>
        홈 화면에 표시할 콘텐츠를 선택합니다.
      </Text>
      <NrmDownloadEncodeOptionPicker
        options={NRM_MAIN_PAGE_MODE_OPTIONS}
        value={mode}
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
