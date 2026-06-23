import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { NrmMenuDrawerScroll } from '@/components/nrm/NrmMenuDrawerScroll';
import { nrmTokens } from '@/constants/nrmTokens';
import { unbanUserOnGithub } from '@/lib/nrmGithubUserBanRegister';
import {
  fetchUserBanList,
  listCurrentlyBannedUsers,
  type NrmUserBanItem,
} from '@/lib/nrmUserBanClient';
import { notifyUser } from '@/lib/nrmUserNotify';

type SearchField = 'userName' | 'SerialNo';

type Props = {
  titleColor: string;
  bodyColor: string;
  isDark: boolean;
  onBack: () => void;
};

function MenuBackRow({ onPress }: { onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.backRow} accessibilityRole="button" accessibilityLabel="뒤로">
      <Ionicons name="chevron-back" size={22} color={nrmTokens.color.primary} />
      <Text style={styles.backText}>뒤로</Text>
    </Pressable>
  );
}

const DETAIL_FIELDS: { key: keyof Omit<NrmUserBanItem, 'isBanned'>; label: string }[] = [
  { key: 'id', label: 'ID' },
  { key: 'userName', label: '사용자 이름' },
  { key: 'SerialNo', label: '시리얼번호' },
  { key: 'content', label: '사유' },
  { key: 'date', label: '등록일' },
];

export function NrmAdminUserBanListPanel({ titleColor, bodyColor, isDark, onBack }: Props) {
  const [rows, setRows] = useState<NrmUserBanItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);

  const [searchActive, setSearchActive] = useState(false);
  const [searchField, setSearchField] = useState<SearchField>('userName');
  const [searchText, setSearchText] = useState('');
  const [fieldDropdownOpen, setFieldDropdownOpen] = useState(false);

  const [detailEntry, setDetailEntry] = useState<NrmUserBanItem | null>(null);

  const hairline = isDark ? nrmTokens.color.borderOnDark : nrmTokens.color.hairline;
  const surfaceBg = isDark ? nrmTokens.color.surfaceTile1 : nrmTokens.color.canvas;
  const dropdownBg = isDark ? '#2a2a2e' : '#ffffff';

  const filteredRows = useMemo(() => {
    if (!searchActive || !searchText.trim()) return rows;
    const q = searchText.trim().toLowerCase();
    return rows.filter((r) => {
      const val = searchField === 'userName' ? r.userName : r.SerialNo;
      return val.toLowerCase().includes(q);
    });
  }, [rows, searchActive, searchField, searchText]);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const all = await fetchUserBanList();
      setRows(listCurrentlyBannedUsers(all));
    } catch {
      setRows([]);
      void notifyUser('블랙리스트를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const onUnban = useCallback(
    async (entry: NrmUserBanItem) => {
      setBusyId(entry.id);
      try {
        await unbanUserOnGithub(entry);
        void notifyUser('차단이 해제되었습니다.');
        await reload();
      } catch (e) {
        void notifyUser(e instanceof Error ? e.message : '차단 해제에 실패했습니다.');
      } finally {
        setBusyId(null);
      }
    },
    [reload],
  );

  const closeSearch = () => {
    setSearchActive(false);
    setSearchText('');
    setFieldDropdownOpen(false);
  };

  return (
    <NrmMenuDrawerScroll>
      <MenuBackRow onPress={onBack} />
      <Text style={[styles.title, { color: titleColor }]}>사용자 블랙리스트</Text>

      {/* 검색 영역 */}
      {!searchActive ? (
        <View style={styles.searchBtnRow}>
          <Pressable
            onPress={() => setSearchActive(true)}
            style={({ pressed }) => [styles.searchToggleBtn, { borderColor: hairline }, pressed && { opacity: 0.7 }]}
            accessibilityRole="button"
            accessibilityLabel="검색">
            <Ionicons name="search-outline" size={16} color={nrmTokens.color.primary} />
            <Text style={styles.searchToggleBtnText}>검색</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <View style={[styles.searchActiveRow, { borderColor: hairline }]}>
            <Pressable
              onPress={() => setFieldDropdownOpen((v) => !v)}
              style={[styles.fieldDropdownBtn, { borderColor: hairline }]}
              accessibilityRole="button">
              <Text style={[styles.fieldDropdownBtnText, { color: titleColor }]}>
                {searchField === 'userName' ? '사용자 이름' : '시리얼번호'}
              </Text>
              <Ionicons
                name={fieldDropdownOpen ? 'chevron-up' : 'chevron-down'}
                size={13}
                color={bodyColor}
              />
            </Pressable>
            <TextInput
              value={searchText}
              onChangeText={setSearchText}
              placeholder="검색어 입력"
              placeholderTextColor={isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)'}
              style={[styles.searchInput, { color: titleColor, borderColor: hairline }]}
              autoFocus
            />
            <Pressable onPress={closeSearch} style={styles.searchCloseBtn} accessibilityRole="button" accessibilityLabel="검색 닫기">
              <Ionicons name="close" size={20} color={bodyColor} />
            </Pressable>
          </View>

          {fieldDropdownOpen && (
            <View style={[styles.fieldDropdownMenu, { backgroundColor: dropdownBg, borderColor: hairline }]}>
              {(['userName', 'SerialNo'] as SearchField[]).map((f) => (
                <Pressable
                  key={f}
                  onPress={() => {
                    setSearchField(f);
                    setFieldDropdownOpen(false);
                  }}
                  style={({ pressed }) => [styles.fieldDropdownItem, pressed && { opacity: 0.7 }]}
                  accessibilityRole="menuitem">
                  <Text
                    style={[
                      styles.fieldDropdownItemText,
                      { color: titleColor },
                      searchField === f && styles.fieldDropdownItemTextActive,
                    ]}>
                    {f === 'userName' ? '사용자 이름' : '시리얼번호'}
                  </Text>
                  {searchField === f && (
                    <Ionicons name="checkmark" size={15} color={nrmTokens.color.primary} />
                  )}
                </Pressable>
              ))}
            </View>
          )}
        </>
      )}

      {/* 리스트 */}
      {loading ? (
        <ActivityIndicator color={nrmTokens.color.primary} style={styles.loader} />
      ) : filteredRows.length === 0 ? (
        <Text style={[styles.empty, { color: bodyColor }]}>
          {rows.length === 0 ? '등록된 차단 사용자가 없습니다.' : '검색 결과가 없습니다.'}
        </Text>
      ) : (
        filteredRows.map((row) => (
          <View key={row.id} style={[styles.row, { borderColor: hairline }]}>
            <Pressable
              onPress={() => setDetailEntry(row)}
              style={({ pressed }) => [styles.userNameBtn, pressed && { opacity: 0.6 }]}
              accessibilityRole="button"
              accessibilityLabel={`${row.userName} 상세 보기`}>
              <Text style={[styles.userName, { color: titleColor }]}>{row.userName}</Text>
            </Pressable>
            <Pressable
              onPress={() => void onUnban(row)}
              disabled={busyId === row.id}
              style={({ pressed }) => [
                styles.unbanBtn,
                (pressed || busyId === row.id) && styles.unbanBtnPressed,
              ]}
              accessibilityRole="button">
              {busyId === row.id ? (
                <ActivityIndicator color={nrmTokens.color.primary} size="small" />
              ) : (
                <Text style={styles.unbanLabel}>해제</Text>
              )}
            </Pressable>
          </View>
        ))
      )}

      {/* 상세 팝업 */}
      <Modal
        visible={detailEntry !== null}
        animationType="fade"
        transparent
        onRequestClose={() => setDetailEntry(null)}>
        <Pressable style={styles.modalScrim} onPress={() => setDetailEntry(null)}>
          <Pressable
            style={[styles.detailCard, { backgroundColor: surfaceBg, borderColor: hairline }]}
            onPress={() => {/* bubble stop */}}>
            <Text style={[styles.detailTitle, { color: titleColor }]}>차단 사용자 상세</Text>
            {detailEntry !== null &&
              DETAIL_FIELDS.map(({ key, label }) => (
                <View key={key} style={[styles.detailRow, { borderColor: hairline }]}>
                  <Text style={[styles.detailLabel, { color: bodyColor }]}>{label}</Text>
                  <Text style={[styles.detailValue, { color: titleColor }]} selectable>
                    {String(detailEntry[key] ?? '')}
                  </Text>
                </View>
              ))}
            <Pressable
              onPress={() => setDetailEntry(null)}
              style={({ pressed }) => [styles.detailCloseBtn, pressed && { opacity: 0.75 }]}
              accessibilityRole="button">
              <Text style={styles.detailCloseBtnText}>닫기</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
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
    marginBottom: nrmTokens.space.md,
  },
  loader: {
    marginVertical: nrmTokens.space.lg,
  },
  empty: {
    fontSize: nrmTokens.font.body,
    lineHeight: 22,
    marginTop: nrmTokens.space.sm,
  },

  /* 검색 버튼 (비활성 상태) */
  searchBtnRow: {
    flexDirection: 'row',
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

  /* 검색 바 (활성 상태) */
  searchActiveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: nrmTokens.space.xs,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  fieldDropdownBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: nrmTokens.radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    minWidth: 90,
  },
  fieldDropdownBtnText: {
    fontSize: nrmTokens.font.caption,
    fontWeight: '500',
    flex: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: nrmTokens.font.body,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: nrmTokens.radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 34,
  },
  searchCloseBtn: {
    padding: 4,
  },

  /* 드롭다운 메뉴 */
  fieldDropdownMenu: {
    borderRadius: nrmTokens.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: nrmTokens.space.sm,
    overflow: 'hidden',
  },
  fieldDropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 11,
    paddingHorizontal: 14,
  },
  fieldDropdownItemText: {
    fontSize: nrmTokens.font.body,
    flex: 1,
  },
  fieldDropdownItemTextActive: {
    color: nrmTokens.color.primary,
    fontWeight: '600',
  },

  /* 리스트 */
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: nrmTokens.space.sm,
    paddingVertical: nrmTokens.space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  userNameBtn: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 4,
  },
  userName: {
    fontSize: nrmTokens.font.body,
    fontWeight: '600',
  },
  unbanBtn: {
    minWidth: 52,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: nrmTokens.space.sm,
    borderRadius: nrmTokens.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(128,128,128,0.35)',
  },
  unbanBtnPressed: {
    opacity: 0.85,
  },
  unbanLabel: {
    color: nrmTokens.color.primary,
    fontSize: nrmTokens.font.body,
    fontWeight: '600',
  },

  /* 상세 모달 */
  modalScrim: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: nrmTokens.space.lg,
  },
  detailCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: nrmTokens.radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: nrmTokens.space.lg,
    gap: 0,
  },
  detailTitle: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: nrmTokens.space.md,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: nrmTokens.space.sm,
  },
  detailLabel: {
    fontSize: nrmTokens.font.caption,
    fontWeight: '500',
    width: 76,
    flexShrink: 0,
    paddingTop: 1,
  },
  detailValue: {
    fontSize: nrmTokens.font.body,
    flex: 1,
    flexWrap: 'wrap',
  },
  detailCloseBtn: {
    marginTop: nrmTokens.space.md,
    alignSelf: 'center',
    paddingVertical: 10,
    paddingHorizontal: 32,
    borderRadius: nrmTokens.radius.md,
    backgroundColor: nrmTokens.color.primary,
  },
  detailCloseBtnText: {
    color: '#ffffff',
    fontSize: nrmTokens.font.body,
    fontWeight: '600',
  },
});
