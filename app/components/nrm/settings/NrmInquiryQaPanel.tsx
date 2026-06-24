import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { NrmInquiryHistoryPanel } from '@/components/nrm/settings/NrmInquiryHistoryPanel';
import { NrmInquiryPanel } from '@/components/nrm/settings/NrmInquiryPanel';
import { NrmMenuDrawerScroll } from '@/components/nrm/NrmMenuDrawerScroll';
import { nrmTokens } from '@/constants/nrmTokens';

type Props = {
  titleColor: string;
  bodyColor: string;
  isDark: boolean;
  onBack: () => void;
};

type QaTab = 'submit' | 'history';

function MenuBackRow({ onPress }: { onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.backRow} accessibilityRole="button" accessibilityLabel="뒤로">
      <Ionicons name="chevron-back" size={22} color={nrmTokens.color.primary} />
      <Text style={styles.backText}>뒤로</Text>
    </Pressable>
  );
}

export function NrmInquiryQaPanel({ titleColor, bodyColor, isDark, onBack }: Props) {
  const [tab, setTab] = useState<QaTab>('submit');
  const [historySessionKey, setHistorySessionKey] = useState(0);
  const hairline = isDark ? nrmTokens.color.borderOnDark : nrmTokens.color.hairline;
  const tabInactiveBg = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)';
  const tabActiveBg = isDark ? 'rgba(0,102,204,0.28)' : 'rgba(0,102,204,0.12)';

  const onSelectSubmit = useCallback(() => setTab('submit'), []);
  const onSelectHistory = useCallback(() => {
    setTab('history');
    setHistorySessionKey((k) => k + 1);
  }, []);

  return (
    <View style={styles.root}>
      <NrmMenuDrawerScroll>
        <MenuBackRow onPress={onBack} />
        <Text style={[styles.panelTitle, { color: titleColor }]}>Q&A</Text>

        <View style={[styles.tabRow, { borderColor: hairline }]}>
          <Pressable
            onPress={onSelectSubmit}
            style={[
              styles.tabBtn,
              { backgroundColor: tab === 'submit' ? tabActiveBg : tabInactiveBg },
            ]}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === 'submit' }}>
            <Text
              style={[
                styles.tabLabel,
                { color: tab === 'submit' ? nrmTokens.color.primary : titleColor },
              ]}>
              문의하기
            </Text>
          </Pressable>
          <Pressable
            onPress={onSelectHistory}
            style={[
              styles.tabBtn,
              { backgroundColor: tab === 'history' ? tabActiveBg : tabInactiveBg },
            ]}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === 'history' }}>
            <Text
              style={[
                styles.tabLabel,
                { color: tab === 'history' ? nrmTokens.color.primary : titleColor },
              ]}>
              문의내역
            </Text>
          </Pressable>
        </View>

        {tab === 'submit' ? (
          <NrmInquiryPanel
            titleColor={titleColor}
            bodyColor={bodyColor}
            isDark={isDark}
            embedded
          />
        ) : (
          <NrmInquiryHistoryPanel
            key={historySessionKey}
            titleColor={titleColor}
            bodyColor={bodyColor}
            isDark={isDark}
          />
        )}
      </NrmMenuDrawerScroll>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
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
  panelTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: nrmTokens.space.md,
  },
  tabRow: {
    flexDirection: 'row',
    gap: nrmTokens.space.sm,
    marginBottom: nrmTokens.space.md,
  },
  tabBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
    borderRadius: nrmTokens.radius.md,
  },
  tabLabel: {
    fontSize: nrmTokens.font.body,
    fontWeight: '600',
  },
});
