import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { NrmMenuDrawerScroll } from '@/components/nrm/NrmMenuDrawerScroll';
import { nrmTokens } from '@/constants/nrmTokens';
import { fetchDedupedUserListEntries, type NrmUserListEntry } from '@/lib/nrmUserListClient';
import { notifyUser } from '@/lib/nrmUserNotify';

type SearchField = 'userName' | 'SerialNo';

const PAGE_SIZE = 20;

const keyExtractorUserEntry = (item: NrmUserListEntry) => `${item.id}-${item.SerialNo}`;

type DetailField =
  | { key: Exclude<keyof NrmUserListEntry, 'deviceId'>; label: string; special?: undefined }
  | { key: 'deviceId'; label: string; special: 'device' };

const DETAIL_FIELDS: DetailField[] = [
  { key: 'id', label: 'ID' },
  { key: 'appName', label: '앱 이름' },
  { key: 'userName', label: '사용자 이름' },
  { key: 'SerialNo', label: '시리얼번호' },
  { key: 'version', label: '버전' },
  { key: 'Createddate', label: '등록일' },
  { key: 'lastAccessDate', label: '마지막 접속' },
  { key: 'deviceId', label: '기기 등록', special: 'device' },
];

function resolveDetailValue(entry: NrmUserListEntry, field: DetailField): string {
  if (field.special === 'device') {
    const v = entry.deviceId;
    return v !== null && v !== '' ? '등록됨' : '등록안됨';
  }
  const raw = entry[field.key as keyof NrmUserListEntry];
  return String(raw ?? '-');
}

function deviceRegistered(entry: NrmUserListEntry): boolean {
  return entry.deviceId !== null && entry.deviceId !== '';
}

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

export function NrmAdminUserListPanel({ titleColor, bodyColor, isDark, onBack }: Props) {
  const [allRows, setAllRows] = useState<NrmUserListEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [displayCount, setDisplayCount] = useState(PAGE_SIZE);
  const [detailEntry, setDetailEntry] = useState<NrmUserListEntry | null>(null);

  const [searchActive, setSearchActive] = useState(false);
  const [searchField, setSearchField] = useState<SearchField>('userName');
  const [searchText, setSearchText] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const hairline = isDark ? nrmTokens.color.borderOnDark : nrmTokens.color.hairline;
  const surfaceBg = isDark ? nrmTokens.color.surfaceTile1 : nrmTokens.color.canvas;
  const dropdownBg = isDark ? '#2a2a2e' : '#ffffff';
  const chipRegistered = isDark ? 'rgba(30,180,100,0.2)' : 'rgba(20,160,80,0.12)';
  const chipNotReg = isDark ? 'rgba(180,180,180,0.12)' : 'rgba(0,0,0,0.06)';

  const filteredRows = useMemo(() => {
    if (!searchActive || !searchText.trim()) return allRows;
    const q = searchText.trim().toLowerCase();
    return allRows.filter((r) => {
      const val = searchField === 'userName' ? r.userName : r.SerialNo;
      return val.toLowerCase().includes(q);
    });
  }, [allRows, searchActive, searchField, searchText]);

  const displayRows = filteredRows.slice(0, displayCount);

  useEffect(() => {
    setDisplayCount(PAGE_SIZE);
  }, [searchText, searchField, searchActive]);

  const reload = useCallback(async () => {
    setLoading(true);
    setAllRows([]);
    setDisplayCount(PAGE_SIZE);
    try {
      setAllRows(await fetchDedupedUserListEntries());
    } catch {
      void notifyUser('사용자 목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const closeSearch = useCallback(() => {
    setSearchActive(false);
    setSearchText('');
    setDropdownOpen(false);
  }, []);

  return (
    <NrmMenuDrawerScroll>
      <MenuBackRow onPress={onBack} />
      <View style={styles.titleRow}>
        <Text style={[styles.title, { color: titleColor }]}>사용자 조회</Text>
        <Text style={[styles.countBadge, { color: bodyColor }]}>
          {loading ? '' : `${filteredRows.length}명`}
        </Text>
      </View>

      {/* 검색 바 */}
      {!searchActive ? (
        <View style={styles.searchBtnRow}>
          <Pressable
            onPress={() => setSearchActive(true)}
            style={({ pressed }) => [styles.searchToggleBtn, { borderColor: hairline }, pressed && { opacity: 0.7 }]}
            accessibilityRole="button">
            <Ionicons name="search-outline" size={16} color={nrmTokens.color.primary} />
            <Text style={styles.searchToggleBtnText}>검색</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <View style={[styles.searchActiveRow, { borderColor: hairline }]}>
            <Pressable
              onPress={() => setDropdownOpen((v) => !v)}
              style={[styles.fieldDropdownBtn, { borderColor: hairline }]}>
              <Text style={[styles.fieldDropdownText, { color: titleColor }]}>
                {searchField === 'userName' ? '사용자 이름' : '시리얼번호'}
              </Text>
              <Ionicons
                name={dropdownOpen ? 'chevron-up' : 'chevron-down'}
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
            <Pressable onPress={closeSearch} style={styles.searchCloseBtn}>
              <Ionicons name="close" size={20} color={bodyColor} />
            </Pressable>
          </View>

          {dropdownOpen && (
            <View style={[styles.dropdownMenu, { backgroundColor: dropdownBg, borderColor: hairline }]}>
              {(['userName', 'SerialNo'] as SearchField[]).map((f) => (
                <Pressable
                  key={f}
                  onPress={() => {
                    setSearchField(f);
                    setDropdownOpen(false);
                  }}
                  style={({ pressed }) => [styles.dropdownItem, pressed && { opacity: 0.7 }]}>
                  <Text
                    style={[
                      styles.dropdownItemText,
                      { color: titleColor },
                      searchField === f && styles.dropdownItemTextActive,
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
      ) : (
        <FlatList
          data={displayRows}
          keyExtractor={keyExtractorUserEntry}
          scrollEnabled={false}
          initialNumToRender={PAGE_SIZE}
          maxToRenderPerBatch={PAGE_SIZE}
          windowSize={5}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => setDetailEntry(item)}
              style={({ pressed }) => [
                styles.row,
                { borderColor: hairline },
                pressed && {
                  backgroundColor: isDark
                    ? 'rgba(255,255,255,0.05)'
                    : 'rgba(0,0,0,0.03)',
                },
              ]}>
              <View style={styles.rowInfo}>
                <Text style={[styles.rowName, { color: titleColor }]}>{item.userName}</Text>
                <Text style={[styles.rowSerial, { color: bodyColor }]}>{item.SerialNo}</Text>
              </View>
              <View
                style={[
                  styles.deviceChip,
                  { backgroundColor: deviceRegistered(item) ? chipRegistered : chipNotReg },
                ]}>
                <Text
                  style={[
                    styles.deviceChipText,
                    {
                      color: deviceRegistered(item)
                        ? (isDark ? '#4cd97b' : '#178040')
                        : bodyColor,
                    },
                  ]}>
                  {deviceRegistered(item) ? '등록됨' : '미등록'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={bodyColor} />
            </Pressable>
          )}
          ListEmptyComponent={
            <Text style={[styles.empty, { color: bodyColor }]}>
              {allRows.length === 0 ? '등록된 사용자가 없습니다.' : '검색 결과가 없습니다.'}
            </Text>
          }
          ListFooterComponent={
            !loading && displayCount < filteredRows.length ? (
              <ActivityIndicator
                size="small"
                color={nrmTokens.color.primary}
                style={styles.footerLoader}
              />
            ) : null
          }
          onEndReached={() => {
            if (displayCount < filteredRows.length) {
              setDisplayCount((c) => c + PAGE_SIZE);
            }
          }}
          onEndReachedThreshold={0.4}
        />
      )}

      {/* 상세 팝업 */}
      <Modal
        visible={detailEntry !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setDetailEntry(null)}>
        <View style={styles.modalFullscreen}>
          <Pressable onPress={() => setDetailEntry(null)} style={StyleSheet.absoluteFillObject} />
          <View style={[styles.detailCard, { backgroundColor: surfaceBg, borderColor: hairline }]}>
            {/* 팝업 헤더 */}
            <View style={[styles.detailHeader, { borderColor: hairline }]}>
              <Text style={[styles.detailTitle, { color: titleColor }]}>사용자 상세 정보</Text>
              {detailEntry !== null && (
                <View
                  style={[
                    styles.detailDeviceBadge,
                    {
                      backgroundColor: deviceRegistered(detailEntry)
                        ? (isDark ? 'rgba(30,180,100,0.25)' : 'rgba(20,160,80,0.12)')
                        : (isDark ? 'rgba(180,180,180,0.15)' : 'rgba(0,0,0,0.07)'),
                    },
                  ]}>
                  <Ionicons
                    name={deviceRegistered(detailEntry) ? 'phone-portrait' : 'phone-portrait-outline'}
                    size={12}
                    color={
                      deviceRegistered(detailEntry)
                        ? (isDark ? '#4cd97b' : '#178040')
                        : bodyColor
                    }
                  />
                  <Text
                    style={[
                      styles.detailDeviceBadgeText,
                      {
                        color: deviceRegistered(detailEntry)
                          ? (isDark ? '#4cd97b' : '#178040')
                          : bodyColor,
                      },
                    ]}>
                    기기 {deviceRegistered(detailEntry) ? '등록됨' : '등록안됨'}
                  </Text>
                </View>
              )}
            </View>

            {/* 필드 목록 */}
            {detailEntry !== null &&
              DETAIL_FIELDS.map((field) => (
                <View key={field.key} style={[styles.detailRow, { borderColor: hairline }]}>
                  <Text style={[styles.detailLabel, { color: bodyColor }]}>{field.label}</Text>
                  <Text
                    style={[
                      styles.detailValue,
                      { color: titleColor },
                      field.special === 'device' && {
                        color: deviceRegistered(detailEntry)
                          ? (isDark ? '#4cd97b' : '#178040')
                          : bodyColor,
                        fontWeight: '500',
                      },
                    ]}
                    selectable={field.special !== 'device'}>
                    {resolveDetailValue(detailEntry, field)}
                  </Text>
                </View>
              ))}

            <Pressable
              onPress={() => setDetailEntry(null)}
              style={({ pressed }) => [styles.detailCloseBtn, pressed && { opacity: 0.75 }]}>
              <Text style={styles.detailCloseBtnText}>닫기</Text>
            </Pressable>
          </View>
        </View>
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
  titleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: nrmTokens.space.sm,
    marginBottom: nrmTokens.space.md,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
  },
  countBadge: {
    fontSize: nrmTokens.font.caption,
    fontWeight: '400',
  },
  loader: {
    marginVertical: nrmTokens.space.xl,
  },
  empty: {
    fontSize: nrmTokens.font.body,
    lineHeight: 22,
    marginTop: nrmTokens.space.sm,
  },

  /* 검색 바 */
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
  fieldDropdownText: {
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

  /* 드롭다운 */
  dropdownMenu: {
    borderRadius: nrmTokens.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: nrmTokens.space.sm,
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

  /* 리스트 */
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: nrmTokens.space.sm,
    paddingVertical: nrmTokens.space.sm,
    paddingHorizontal: 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowInfo: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  rowName: {
    fontSize: nrmTokens.font.body,
    fontWeight: '600',
  },
  rowSerial: {
    fontSize: nrmTokens.font.caption,
  },
  deviceChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: nrmTokens.radius.pill,
  },
  deviceChipText: {
    fontSize: 11,
    fontWeight: '600',
  },
  footerLoader: {
    paddingVertical: nrmTokens.space.md,
  },

  /* 모달 */
  modalFullscreen: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: nrmTokens.space.lg,
  },
  detailCard: {
    width: '100%',
    maxWidth: 440,
    borderRadius: nrmTokens.radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: nrmTokens.space.lg,
    paddingTop: nrmTokens.space.lg,
    paddingBottom: nrmTokens.space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: nrmTokens.space.sm,
  },
  detailTitle: {
    fontSize: 17,
    fontWeight: '700',
    flex: 1,
  },
  detailDeviceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: nrmTokens.radius.pill,
  },
  detailDeviceBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: nrmTokens.space.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: nrmTokens.space.sm,
  },
  detailLabel: {
    fontSize: nrmTokens.font.caption,
    fontWeight: '500',
    width: 80,
    flexShrink: 0,
    paddingTop: 1,
  },
  detailValue: {
    fontSize: nrmTokens.font.body,
    flex: 1,
    flexWrap: 'wrap',
  },
  detailCloseBtn: {
    margin: nrmTokens.space.lg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    borderRadius: nrmTokens.radius.pill,
    backgroundColor: nrmTokens.color.primary,
  },
  detailCloseBtnText: {
    color: '#ffffff',
    fontSize: nrmTokens.font.body,
    fontWeight: '600',
  },
});
