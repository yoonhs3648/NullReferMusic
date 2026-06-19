import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { NrmDownloadEncodeOptionPicker } from '@/components/nrm/settings/NrmDownloadEncodeOptionPicker';
import { NrmMenuDrawerScroll } from '@/components/nrm/NrmMenuDrawerScroll';
import { nrmTokens } from '@/constants/nrmTokens';
import { invalidateActivityHistoryCache } from '@/lib/nrmActivityHistory';
import {
  DEFAULT_ACTIVITY_HISTORY_DISPLAY_DAYS,
  loadActivityHistoryDisplayDays,
  notifyActivityHistoryDisplayChanged,
  NRM_ACTIVITY_HISTORY_DISPLAY_OPTIONS,
  primeActivityHistoryDisplayDays,
  saveActivityHistoryDisplayDays,
  type NrmActivityHistoryDisplayDays,
} from '@/lib/nrmActivityHistorySettings';

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

export function NrmActivityHistorySettingsPanel({ titleColor, bodyColor, onBack }: Props) {
  const [displayDays, setDisplayDays] = useState<NrmActivityHistoryDisplayDays>(
    DEFAULT_ACTIVITY_HISTORY_DISPLAY_DAYS,
  );

  useEffect(() => {
    void loadActivityHistoryDisplayDays().then((days) => {
      setDisplayDays(days);
      primeActivityHistoryDisplayDays(days);
    });
  }, []);

  const onSelect = useCallback((id: string) => {
    const next = id as NrmActivityHistoryDisplayDays;
    setDisplayDays(next);
    void saveActivityHistoryDisplayDays(next).then(() => {
      primeActivityHistoryDisplayDays(next);
      invalidateActivityHistoryCache();
      notifyActivityHistoryDisplayChanged(next);
    });
  }, []);

  return (
    <NrmMenuDrawerScroll>
      <MenuBackRow onPress={onBack} />
      <Text style={[styles.title, { color: titleColor }]}>History 관리</Text>
      <Text style={[styles.hint, { color: bodyColor }]}>
        다운로드 및 가사생성 내역을 저장합니다.
      </Text>
      <NrmDownloadEncodeOptionPicker
        options={NRM_ACTIVITY_HISTORY_DISPLAY_OPTIONS}
        value={displayDays}
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
