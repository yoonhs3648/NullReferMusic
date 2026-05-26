import Ionicons from '@expo/vector-icons/Ionicons';
import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { nrmTokens } from '@/constants/nrmTokens';

export function formatSpotifyDuration(ms: number): string {
  if (ms <= 0) return '—';
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function formatSpotifyCount(n: number): string {
  if (n <= 0) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
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

export function NrmSpotifySearchBar({
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

export function NrmSpotifyCoverImage({
  imageUrl,
  size = 120,
}: {
  imageUrl: string;
  size?: number;
}) {
  const coverStyle = {
    width: size,
    height: size,
    borderRadius: nrmTokens.radius.sm,
  };
  if (!imageUrl) {
    return <View style={[coverStyle, styles.coverPlaceholder]} />;
  }
  return <Image source={{ uri: imageUrl }} style={coverStyle} />;
}

export function NrmSpotifySectionTitle({ title, color }: { title: string; color: string }) {
  return (
    <Text style={[styles.sectionTitle, { color }]}>{title}</Text>
  );
}

const styles = StyleSheet.create({
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: nrmTokens.space.sm,
    marginBottom: nrmTokens.space.md,
  },
  searchInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: nrmTokens.radius.sm,
    paddingHorizontal: nrmTokens.space.md,
    paddingVertical: nrmTokens.space.sm,
    fontSize: nrmTokens.font.body,
  },
  searchBtn: {
    width: 44,
    height: 44,
    borderRadius: nrmTokens.radius.sm,
    backgroundColor: nrmTokens.color.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchBtnPressed: { opacity: 0.88 },
  searchBtnDisabled: { opacity: 0.5 },
  coverPlaceholder: {
    backgroundColor: 'rgba(128,128,128,0.2)',
  },
  sectionTitle: {
    fontSize: nrmTokens.font.body,
    fontWeight: '600',
    marginTop: nrmTokens.space.lg,
    marginBottom: nrmTokens.space.sm,
  },
});
