import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { nrmTokens } from '@/constants/nrmTokens';
import {
  NRM_SEARCH_LASTFM_ROWS,
  type SearchLastfmKind,
  type SearchMenuPanel,
} from '@/lib/nrmSearchMenu';
import { nrmSearchHint } from '@/lib/nrmSearchStrings';

type Props = {
  panel: SearchMenuPanel;
  titleColor: string;
  bodyColor: string;
  rowHover: string;
  onBackToRoot: () => void;
  onOpenLastfmSearch: (kind: SearchLastfmKind) => void;
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

export function NrmMenuSearchPanels({
  panel,
  titleColor,
  bodyColor,
  rowHover,
  onBackToRoot,
  onOpenLastfmSearch,
}: Props) {
  if (panel !== 'search') return null;

  return (
    <>
      <MenuBackRow onPress={onBackToRoot} />
      <Text style={[styles.panelTitle, { color: titleColor }]}>검색</Text>
      <Text style={[styles.sectionHint, { color: bodyColor }]}>
        {nrmSearchHint}
      </Text>
      {NRM_SEARCH_LASTFM_ROWS.map((row) => (
        <Pressable
          key={row.kind}
          onPress={() => onOpenLastfmSearch(row.kind)}
          style={({ pressed }) => [
            styles.row,
            pressed && { backgroundColor: rowHover },
          ]}>
          <View style={styles.rowTextBlock}>
            <Text style={[styles.rowLabel, { color: titleColor }]}>
              {row.label}
            </Text>
            <Text
              style={[styles.rowSubtitle, { color: bodyColor }]}
              numberOfLines={2}>
              {row.subtitle}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={bodyColor} />
        </Pressable>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: nrmTokens.space.xxs,
    marginTop: nrmTokens.space.md,
    marginBottom: nrmTokens.space.md,
    alignSelf: 'flex-start',
  },
  backText: {
    fontSize: nrmTokens.font.body,
    color: nrmTokens.color.primary,
    fontWeight: '500',
  },
  panelTitle: {
    fontSize: nrmTokens.font.lead,
    fontWeight: '600',
    marginBottom: nrmTokens.space.md,
    letterSpacing: -0.4,
  },
  sectionHint: {
    marginBottom: nrmTokens.space.md,
    fontSize: nrmTokens.font.caption,
    fontWeight: '400',
    lineHeight: 20,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: nrmTokens.space.sm,
    paddingVertical: nrmTokens.space.md,
    paddingHorizontal: nrmTokens.space.xs,
    borderRadius: nrmTokens.radius.sm,
    marginBottom: nrmTokens.space.xs,
  },
  rowTextBlock: {
    flex: 1,
    minWidth: 0,
    paddingRight: nrmTokens.space.sm,
  },
  rowLabel: {
    fontSize: nrmTokens.font.body,
    fontWeight: '500',
  },
  rowSubtitle: {
    marginTop: 2,
    fontSize: nrmTokens.font.caption,
    fontWeight: '400',
  },
});
