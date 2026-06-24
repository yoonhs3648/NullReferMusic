import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  NrmAdminUserSearchBar,
  type NrmAdminUserSearchField,
} from '@/components/nrm/settings/NrmAdminUserSearchBar';
import { NrmMenuDrawerScroll } from '@/components/nrm/NrmMenuDrawerScroll';
import { nrmTokens } from '@/constants/nrmTokens';
import { unbanUserOnGithub } from '@/lib/nrmGithubUserBanRegister';
import {
  fetchUserBanListViaApi,
  listCurrentlyBannedUsers,
  type NrmUserBanItem,
} from '@/lib/nrmUserBanClient';
import { getNrmModalScrimColor } from '@/lib/nrmUiAppearanceColors';
import { notifyUserError } from '@/lib/nrmDevLog';
import { notifyUser } from '@/lib/nrmUserNotify';

type SearchField = NrmAdminUserSearchField;

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
  const [globalBusy, setGlobalBusy] = useState(false);

  const [searchActive, setSearchActive] = useState(false);
  const [searchField, setSearchField] = useState<SearchField>('userName');
  const [searchText, setSearchText] = useState('');

  const [detailEntry, setDetailEntry] = useState<NrmUserBanItem | null>(null);

  const hairline = isDark ? nrmTokens.color.borderOnDark : nrmTokens.color.hairline;
  const surfaceBg = isDark ? nrmTokens.color.surfaceTile1 : nrmTokens.color.canvas;
  const modalScrim = getNrmModalScrimColor(isDark);

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
      const all = await fetchUserBanListViaApi();
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
      setGlobalBusy(true);
      try {
        await unbanUserOnGithub(entry);
        void notifyUser('차단이 해제되었습니다.');
        await reload();
      } catch (e) {
        notifyUserError('admin.userBanUnban', e, '차단 해제에 실패했습니다.');
      } finally {
        setGlobalBusy(false);
      }
    },
    [reload],
  );

  return (
    <NrmMenuDrawerScroll>
      <MenuBackRow onPress={onBack} />
      <Text style={[styles.title, { color: titleColor }]}>사용자 블랙리스트</Text>

      <NrmAdminUserSearchBar
        titleColor={titleColor}
        bodyColor={bodyColor}
        isDark={isDark}
        searchActive={searchActive}
        onSearchActiveChange={setSearchActive}
        searchField={searchField}
        onSearchFieldChange={setSearchField}
        searchText={searchText}
        onSearchTextChange={setSearchText}
      />

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
              disabled={globalBusy}
              style={({ pressed }) => [
                styles.unbanBtn,
                (pressed || globalBusy) && styles.unbanBtnPressed,
              ]}
              accessibilityRole="button">
              <Text style={styles.unbanLabel}>해제</Text>
            </Pressable>
          </View>
        ))
      )}

      {/* 해제 작업 중 — 전체 화면 블로킹 스피너 */}
      <Modal visible={globalBusy} transparent animationType="none" statusBarTranslucent>
        <View style={styles.busyOverlay}>
          <ActivityIndicator size="large" color={nrmTokens.color.primary} />
        </View>
      </Modal>

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

  /* 블로킹 스피너 */
  busyOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
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
