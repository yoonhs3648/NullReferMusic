import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { nrmTokens } from '@/constants/nrmTokens';

export type NrmAdminUserSearchField = 'userName' | 'userEmail' | 'SerialNo';

const SEARCH_FIELD_OPTIONS: { id: NrmAdminUserSearchField; label: string }[] = [
  { id: 'userName', label: '사용자 이름' },
  { id: 'userEmail', label: '이메일' },
  { id: 'SerialNo', label: '계정 ID' },
];

function searchFieldLabel(field: NrmAdminUserSearchField): string {
  return SEARCH_FIELD_OPTIONS.find((o) => o.id === field)?.label ?? field;
}

type Props = {
  titleColor: string;
  bodyColor: string;
  isDark: boolean;
  searchActive: boolean;
  onSearchActiveChange: (active: boolean) => void;
  searchField: NrmAdminUserSearchField;
  onSearchFieldChange: (field: NrmAdminUserSearchField) => void;
  searchText: string;
  onSearchTextChange: (text: string) => void;
  /** true이면 비활성 상태일 때 검색 토글 버튼을 렌더링하지 않음 (외부에서 버튼을 직접 제어할 때 사용) */
  hideToggle?: boolean;
};

export function NrmAdminUserSearchBar({
  titleColor,
  bodyColor,
  isDark,
  searchActive,
  onSearchActiveChange,
  searchField,
  onSearchFieldChange,
  searchText,
  onSearchTextChange,
  hideToggle = false,
}: Props) {
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const hairline = isDark ? nrmTokens.color.borderOnDark : nrmTokens.color.hairline;
  const dropdownBg = isDark ? '#2a2a2e' : '#ffffff';

  const closeSearch = () => {
    onSearchActiveChange(false);
    onSearchTextChange('');
    setDropdownOpen(false);
  };

  if (!searchActive) {
    if (hideToggle) return null;
    return (
      <View style={styles.searchBtnRow}>
        <Pressable
          onPress={() => onSearchActiveChange(true)}
          style={({ pressed }) => [
            styles.searchToggleBtn,
            { borderColor: hairline },
            pressed && { opacity: 0.7 },
          ]}
          accessibilityRole="button">
          <Ionicons name="search-outline" size={16} color={nrmTokens.color.primary} />
          <Text style={styles.searchToggleBtnText}>검색</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.searchPanel, { borderColor: hairline }]}>
      <View style={styles.searchFieldRow}>
        <Pressable
          onPress={() => setDropdownOpen((v) => !v)}
          style={[styles.fieldDropdownBtn, { borderColor: hairline }]}>
          <Text style={[styles.fieldDropdownText, { color: titleColor }]}>
            {searchFieldLabel(searchField)}
          </Text>
          <Ionicons
            name={dropdownOpen ? 'chevron-up' : 'chevron-down'}
            size={13}
            color={bodyColor}
          />
        </Pressable>
        <Pressable onPress={closeSearch} style={styles.searchCloseBtn} accessibilityRole="button">
          <Ionicons name="close" size={20} color={bodyColor} />
        </Pressable>
      </View>

      {dropdownOpen ? (
        <View style={[styles.dropdownMenu, { backgroundColor: dropdownBg, borderColor: hairline }]}>
          {SEARCH_FIELD_OPTIONS.map((opt) => (
            <Pressable
              key={opt.id}
              onPress={() => {
                onSearchFieldChange(opt.id);
                setDropdownOpen(false);
              }}
              style={({ pressed }) => [styles.dropdownItem, pressed && { opacity: 0.7 }]}>
              <Text
                style={[
                  styles.dropdownItemText,
                  { color: titleColor },
                  searchField === opt.id && styles.dropdownItemTextActive,
                ]}>
                {opt.label}
              </Text>
              {searchField === opt.id ? (
                <Ionicons name="checkmark" size={15} color={nrmTokens.color.primary} />
              ) : null}
            </Pressable>
          ))}
        </View>
      ) : null}

      <TextInput
        value={searchText}
        onChangeText={onSearchTextChange}
        placeholder="검색어 입력"
        placeholderTextColor={isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)'}
        style={[styles.searchInput, { color: titleColor, borderColor: hairline }]}
        autoFocus
      />
    </View>
  );
}

const styles = StyleSheet.create({
  searchBtnRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: nrmTokens.space.sm,
  },
  searchToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: nrmTokens.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  searchToggleBtnText: {
    fontSize: nrmTokens.font.body,
    fontWeight: '500',
    color: nrmTokens.color.primary,
  },
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
  searchCloseBtn: {
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
