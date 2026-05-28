import Ionicons from '@expo/vector-icons/Ionicons';
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { nrmTokens } from '@/constants/nrmTokens';
import type { LastfmTag } from '@/lib/nrmLastfmSearchTypes';

/** Last.fm duration(초). 밀리초로 오는 경우 보정 */
export function formatLastfmDuration(raw: number): string {
  if (raw <= 0) return '—';
  let sec = Math.round(raw);
  if (sec > 7200) sec = Math.round(sec / 1000);
  if (sec >= 3600) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
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
  compact?: boolean;
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
  compact = false,
}: SearchBarProps) {
  const border = isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.12)';
  return (
    <View style={[styles.searchRow, compact && styles.searchRowCompact]}>
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
  centered = false,
}: {
  title: string;
  color: string;
  centered?: boolean;
}) {
  return (
    <Text style={[styles.pageTitle, centered && styles.pageTitleCentered, { color }]}>
      {title}
    </Text>
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
        <View
          key={tag.name}
          style={[styles.tagChip, { backgroundColor: chipBg }]}>
          <Text style={[styles.tagText, { color: bodyColor }]}>{tag.name}</Text>
        </View>
      ))}
    </View>
  );
}

export function NrmLastfmCoverImage({
  uri,
  size = 96,
  radius,
}: {
  uri: string;
  size?: number;
  radius?: number;
}) {
  const r = radius ?? nrmTokens.radius.sm;
  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={{ width: size, height: size, borderRadius: r }}
      />
    );
  }
  return (
    <View
      style={[
        styles.coverPlaceholder,
        { width: size, height: size, borderRadius: r },
      ]}
    />
  );
}

export type NrmLastfmMetaField = {
  label: string;
  value: string;
  onPress?: () => void;
};

/** 트랙·앨범 상세 — 커버 + 라벨 - 값 메타 카드 (카드 전체 탭 가능) */
export function NrmLastfmDetailHeroCard({
  imageUrl,
  fields,
  isDark,
  titleColor,
  onCardPress,
}: {
  imageUrl: string;
  fields: NrmLastfmMetaField[];
  isDark: boolean;
  titleColor: string;
  bodyColor?: string;
  /** 커버·메타 영역 어디를 눌러도 호출 */
  onCardPress?: () => void;
}) {
  const cardBg = isDark ? nrmTokens.color.surfaceTile2 : nrmTokens.color.canvas;
  const cardBorder = isDark
    ? nrmTokens.color.borderOnDark
    : nrmTokens.color.hairline;
  const labelColor = isDark ? nrmTokens.color.bodyMuted : nrmTokens.color.inkMuted48;
  const rowDivider = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
  const cardPressedBg = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)';

  const inner = (
    <>
      <View style={detailStyles.coverWrap}>
        <NrmLastfmCoverImage uri={imageUrl} size={132} radius={nrmTokens.radius.md} />
      </View>
      <View style={detailStyles.fieldList}>
        {fields.map((field, index) => {
          const isLast = index === fields.length - 1;
          return (
            <View
              key={`${field.label}-${index}`}
              style={[
                detailStyles.fieldItem,
                !isLast && {
                  borderBottomWidth: StyleSheet.hairlineWidth,
                  borderBottomColor: rowDivider,
                },
              ]}>
              <View style={detailStyles.fieldRow}>
                <Text style={[detailStyles.fieldLabel, { color: labelColor }]}>
                  {field.label}
                </Text>
                <Text
                  style={[detailStyles.fieldValue, { color: titleColor }]}
                  numberOfLines={3}>
                  {field.value}
                </Text>
              </View>
            </View>
          );
        })}
      </View>
    </>
  );

  if (onCardPress) {
    return (
      <Pressable
        onPress={onCardPress}
        accessibilityRole="button"
        accessibilityLabel="유튜브에서 이 곡 검색"
        style={({ pressed }) => [
          detailStyles.card,
          { backgroundColor: cardBg, borderColor: cardBorder },
          pressed && { backgroundColor: cardPressedBg },
        ]}>
        {inner}
      </Pressable>
    );
  }

  return (
    <View
      style={[
        detailStyles.card,
        { backgroundColor: cardBg, borderColor: cardBorder },
      ]}>
      {inner}
    </View>
  );
}

const detailStyles = StyleSheet.create({
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: nrmTokens.radius.lg,
    overflow: 'hidden',
    marginBottom: nrmTokens.space.md,
  },
  coverWrap: {
    alignItems: 'center',
    paddingTop: nrmTokens.space.lg,
    paddingBottom: nrmTokens.space.md,
    paddingHorizontal: nrmTokens.space.lg,
  },
  fieldList: {
    paddingHorizontal: nrmTokens.space.md,
    paddingBottom: nrmTokens.space.xs,
  },
  fieldItem: {
    paddingVertical: nrmTokens.space.sm,
    paddingHorizontal: nrmTokens.space.xs,
    borderRadius: nrmTokens.radius.sm,
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: nrmTokens.space.md,
  },
  fieldLabel: {
    fontSize: nrmTokens.font.caption,
    fontWeight: '600',
    width: 56,
  },
  fieldValue: {
    flex: 1,
    fontSize: nrmTokens.font.body,
    fontWeight: '600',
    lineHeight: 22,
  },
});

const styles = StyleSheet.create({
  pageTitle: {
    fontSize: nrmTokens.font.lead,
    fontWeight: '600',
    letterSpacing: -0.4,
    marginBottom: nrmTokens.space.md,
  },
  pageTitleCentered: {
    textAlign: 'center',
    alignSelf: 'center',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: nrmTokens.space.sm,
    marginBottom: nrmTokens.space.md,
  },
  searchRowCompact: {
    width: '100%',
    maxWidth: nrmTokens.layout.homeSearchClusterMaxWidth,
    alignSelf: 'center',
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
