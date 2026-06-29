import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { nrmTokens } from '@/constants/nrmTokens';
import type { NrmMusicListTextSearchField } from '@/lib/nrmMusicListTypes';

const FIELD_LABELS: Record<NrmMusicListTextSearchField, string> = {
  artist: '가수',
  title: '트랙',
  album: '앨범',
};

type Props = {
  titleColor: string;
  bodyColor: string;
  isDark: boolean;
  searchField: NrmMusicListTextSearchField;
  onSearchFieldChange: (field: NrmMusicListTextSearchField) => void;
  searchText: string;
  onSearchTextChange: (text: string) => void;
};

export function NrmAdminMusicListSearchBar({
  titleColor,
  bodyColor,
  isDark,
  searchField,
  onSearchFieldChange,
  searchText,
  onSearchTextChange,
}: Props) {
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const hairline = isDark ? nrmTokens.color.borderOnDark : nrmTokens.color.hairline;
  const dropdownBg = isDark ? '#2a2a2e' : '#ffffff';

  return (
    <View style={[styles.searchPanel, { borderColor: hairline }]}>
      <View style={styles.searchFieldRow}>
        <Pressable
          onPress={() => setDropdownOpen((v) => !v)}
          style={[styles.fieldDropdownBtn, { borderColor: hairline }]}>
          <Text style={[styles.fieldDropdownText, { color: titleColor }]}>
            {FIELD_LABELS[searchField]}
          </Text>
          <Ionicons
            name={dropdownOpen ? 'chevron-up' : 'chevron-down'}
            size={13}
            color={bodyColor}
          />
        </Pressable>
        {searchText ? (
          <Pressable
            onPress={() => onSearchTextChange('')}
            style={styles.searchClearBtn}
            accessibilityRole="button"
            accessibilityLabel="검색어 지우기">
            <Ionicons name="close-circle" size={20} color={bodyColor} />
          </Pressable>
        ) : null}
      </View>

      {dropdownOpen ? (
        <View style={[styles.dropdownMenu, { backgroundColor: dropdownBg, borderColor: hairline }]}>
          {(['artist', 'title', 'album'] as NrmMusicListTextSearchField[]).map((f) => (
            <Pressable
              key={f}
              onPress={() => {
                onSearchFieldChange(f);
                setDropdownOpen(false);
              }}
              style={({ pressed }) => [styles.dropdownItem, pressed && { opacity: 0.7 }]}>
              <Text
                style={[
                  styles.dropdownItemText,
                  { color: titleColor },
                  searchField === f && styles.dropdownItemTextActive,
                ]}>
                {FIELD_LABELS[f]}
              </Text>
              {searchField === f ? (
                <Ionicons name="checkmark" size={15} color={nrmTokens.color.primary} />
              ) : null}
            </Pressable>
          ))}
        </View>
      ) : null}

      <TextInput
        value={searchText}
        onChangeText={onSearchTextChange}
        placeholder={`${FIELD_LABELS[searchField]} 검색어 입력`}
        placeholderTextColor={isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)'}
        style={[styles.searchInput, { color: titleColor, borderColor: hairline }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  searchPanel: {
    marginBottom: nrmTokens.space.sm,
    paddingBottom: nrmTokens.space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: nrmTokens.space.sm,
  },
  searchFieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: nrmTokens.space.sm,
  },
  fieldDropdownBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: nrmTokens.radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
  fieldDropdownText: {
    fontSize: nrmTokens.font.body,
    fontWeight: '500',
  },
  searchInput: {
    width: '100%',
    fontSize: nrmTokens.font.body,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: nrmTokens.radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 40,
  },
  searchClearBtn: {
    padding: 4,
  },
  dropdownMenu: {
    borderRadius: nrmTokens.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 11,
    paddingHorizontal: 14,
  },
  dropdownItemText: {
    fontSize: nrmTokens.font.body,
    flex: 1,
  },
  dropdownItemTextActive: {
    color: nrmTokens.color.primary,
    fontWeight: '600',
  },
});
