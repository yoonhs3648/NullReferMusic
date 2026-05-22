import Ionicons from '@expo/vector-icons/Ionicons';
import {
  Image,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { nrmTokens } from '@/constants/nrmTokens';
import type { LastfmTag } from '@/lib/nrmLastfmSearchTypes';

export function formatLastfmDuration(sec: number): string {
  if (sec <= 0) return '—';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function formatLastfmCount(n: number): string {
  if (n <= 0) return '—';
  return n.toLocaleString('ko-KR');
}

type SearchBarProps = {
  value: string;
  onChangeText: (t: string) => void;
  onSubmit: () => void;
  placeholder: string;
  titleColor: string;
  bodyColor: string;
  isDark: boolean;
  loading?: boolean;
};

export function NrmLastfmSearchBar({
  value,
  onChangeText,
  onSubmit,
  placeholder,
  titleColor,
  bodyColor,
  isDark,
  loading,
}: SearchBarProps) {
  const border = isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.12)';
  return (
    <View style={styles.searchRow}>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={bodyColor}
        style={[
          styles.searchInput,
          {
            color: titleColor,
            borderColor: border,
            backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
          },
        ]}
        returnKeyType="search"
        onSubmitEditing={onSubmit}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <Pressable
        onPress={onSubmit}
        disabled={loading}
        style={({ pressed }) => [
          styles.searchBtn,
          loading && styles.searchBtnDisabled,
          pressed && !loading && styles.searchBtnPressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel="검색">
        <Ionicons name="search" size={22} color="#fff" />
      </Pressable>
    </View>
  );
}

export function NrmSearchPageTitle({
  title,
  color,
}: {
  title: string;
  color: string;
}) {
  return (
    <Text style={[styles.pageTitle, { color }]}>{title}</Text>
  );
}

export function NrmLastfmSectionTitle({
  title,
  color,
}: {
  title: string;
  color: string;
}) {
  return (
    <Text style={[styles.sectionTitle, { color }]}>{title}</Text>
  );
}

export function NrmLastfmTagList({
  tags,
  bodyColor,
  chipBg,
}: {
  tags: LastfmTag[];
  bodyColor: string;
  chipBg: string;
}) {
  if (tags.length === 0) {
    return (
      <Text style={[styles.emptyTags, { color: bodyColor }]}>태그 없음</Text>
    );
  }
  return (
    <View style={styles.tagWrap}>
      {tags.map((tag) => (
        <Pressable
          key={tag.name}
          onPress={() => {
            if (tag.url) void Linking.openURL(tag.url);
          }}
          style={({ pressed }) => [
            styles.tagChip,
            { backgroundColor: chipBg },
            pressed && styles.tagChipPressed,
          ]}>
          <Text style={[styles.tagText, { color: bodyColor }]}>{tag.name}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function NrmLastfmCoverImage({
  uri,
  size = 96,
}: {
  uri: string;
  size?: number;
}) {
  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={{ width: size, height: size, borderRadius: nrmTokens.radius.sm }}
      />
    );
  }
  return (
    <View
      style={[
        styles.coverPlaceholder,
        { width: size, height: size, borderRadius: nrmTokens.radius.sm },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  pageTitle: {
    fontSize: nrmTokens.font.lead,
    fontWeight: '600',
    letterSpacing: -0.4,
    marginBottom: nrmTokens.space.md,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: nrmTokens.space.sm,
    marginBottom: nrmTokens.space.md,
  },
  searchInput: {
    flex: 1,
    minHeight: 44,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: nrmTokens.radius.pill,
    paddingHorizontal: nrmTokens.space.md,
    fontSize: nrmTokens.font.body,
  },
  searchBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: nrmTokens.color.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchBtnPressed: { opacity: 0.88 },
  searchBtnDisabled: { opacity: 0.5 },
  sectionTitle: {
    fontSize: nrmTokens.font.body,
    fontWeight: '700',
    marginTop: nrmTokens.space.lg,
    marginBottom: nrmTokens.space.sm,
  },
  tagWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: nrmTokens.space.xs,
  },
  tagChip: {
    paddingHorizontal: nrmTokens.space.sm,
    paddingVertical: 6,
    borderRadius: nrmTokens.radius.pill,
  },
  tagChipPressed: { opacity: 0.85 },
  tagText: { fontSize: nrmTokens.font.caption, fontWeight: '500' },
  emptyTags: { fontSize: nrmTokens.font.caption },
  coverPlaceholder: {
    backgroundColor: 'rgba(128,128,128,0.25)',
  },
});
