import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { NrmMenuDrawerScroll } from '@/components/nrm/NrmMenuDrawerScroll';
import { nrmTokens } from '@/constants/nrmTokens';
import { validateBanContent } from '@/lib/nrmJsonFieldValidation';
import { registerUserBanToGithub } from '@/lib/nrmGithubUserBanRegister';
import { fetchDedupedUserListEntries, type NrmUserListEntry } from '@/lib/nrmUserListClient';
import { getNrmModalScrimColor } from '@/lib/nrmUiAppearanceColors';
import { notifyUser } from '@/lib/nrmUserNotify';

type SearchField = 'userName' | 'SerialNo';

const PAGE_SIZE = 20;

const DETAIL_FIELDS: { key: keyof Omit<NrmUserListEntry, 'deviceId'>; label: string }[] = [
  { key: 'id', label: 'ID' },
  { key: 'appName', label: '앱 이름' },
  { key: 'userName', label: '사용자 이름' },
  { key: 'SerialNo', label: '시리얼번호' },
  { key: 'version', label: '버전' },
  { key: 'Createddate', label: '등록일' },
  { key: 'lastAccessDate', label: '마지막 접속' },
];

type Props = {
  titleColor: string;
  bodyColor: string;
  isDark: boolean;
  onBack: () => void;
};

const INPUT_BORDER = Platform.OS === 'web' ? StyleSheet.hairlineWidth : 1;

function MenuBackRow({ onPress }: { onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.backRow} accessibilityRole="button" accessibilityLabel="뒤로">
      <Ionicons name="chevron-back" size={22} color={nrmTokens.color.primary} />
      <Text style={styles.backText}>뒤로</Text>
    </Pressable>
  );
}

export function NrmAdminUserBanRegisterPanel({ titleColor, bodyColor, isDark, onBack }: Props) {
  const [userEntry, setUserEntry] = useState<NrmUserListEntry | null>(null);
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);

  /* 사용자 선택 오버레이 */
  const [pickerOpen, setPickerOpen] = useState(false);
  const [allRows, setAllRows] = useState<NrmUserListEntry[]>([]);
  const [userLoading, setUserLoading] = useState(false);
  const [displayCount, setDisplayCount] = useState(PAGE_SIZE);

  /* 오버레이 내 검색 */
  const [pickerSearchActive, setPickerSearchActive] = useState(false);
  const [pickerSearchField, setPickerSearchField] = useState<SearchField>('userName');
  const [pickerSearchText, setPickerSearchText] = useState('');
  const [pickerDropdownOpen, setPickerDropdownOpen] = useState(false);

  const hairline = isDark ? nrmTokens.color.borderOnDark : nrmTokens.color.hairline;
  const inputBg = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)';
  const surfaceBg = isDark ? nrmTokens.color.surfaceTile1 : nrmTokens.color.canvas;
  const dropdownBg = isDark ? '#2a2a2e' : '#ffffff';
  const modalScrim = getNrmModalScrimColor(isDark);

  /* 검색 필터 적용 */
  const filteredRows = useMemo(() => {
    if (!pickerSearchActive || !pickerSearchText.trim()) return allRows;
    const q = pickerSearchText.trim().toLowerCase();
    return allRows.filter((r) => {
      const val = pickerSearchField === 'userName' ? r.userName : r.SerialNo;
      return val.toLowerCase().includes(q);
    });
  }, [allRows, pickerSearchActive, pickerSearchField, pickerSearchText]);

  const displayRows = filteredRows.slice(0, displayCount);

  /* 검색어/필드 변경 시 페이지 초기화 */
  useEffect(() => {
    setDisplayCount(PAGE_SIZE);
  }, [pickerSearchText, pickerSearchField, pickerSearchActive]);

  const openPicker = useCallback(async () => {
    setPickerOpen(true);
    setUserLoading(true);
    setAllRows([]);
    setDisplayCount(PAGE_SIZE);
    setPickerSearchActive(false);
    setPickerSearchText('');
    setPickerDropdownOpen(false);
    try {
      setAllRows(await fetchDedupedUserListEntries());
    } catch {
      void notifyUser('사용자 목록을 불러오지 못했습니다.');
    } finally {
      setUserLoading(false);
    }
  }, []);

  const closePicker = useCallback(() => {
    setPickerOpen(false);
  }, []);

  const closePickerSearch = useCallback(() => {
    setPickerSearchActive(false);
    setPickerSearchText('');
    setPickerDropdownOpen(false);
  }, []);

  const onPickerSelect = useCallback((entry: NrmUserListEntry) => {
    setUserEntry(entry);
    setPickerOpen(false);
  }, []);

  const onSave = useCallback(async () => {
    if (!userEntry) {
      void notifyUser('사용자를 선택하세요.');
      return;
    }
    const contentErr = validateBanContent(content);
    if (contentErr) {
      void notifyUser(contentErr);
      return;
    }
    setSaving(true);
    try {
      await registerUserBanToGithub({
        userName: userEntry.userName,
        serialNo: userEntry.SerialNo,
        content,
      });
      setUserEntry(null);
      setContent('');
      void notifyUser('블랙리스트에 등록되었습니다.');
    } catch (e) {
      void notifyUser(e instanceof Error ? e.message : '등록에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  }, [content, userEntry]);

  return (
    <NrmMenuDrawerScroll>
      <MenuBackRow onPress={onBack} />
      <Text style={[styles.title, { color: titleColor }]}>사용자 블랙리스트 등록</Text>

      {/* 사용자 선택 */}
      <Text style={[styles.fieldLabel, { color: titleColor }]}>사용자 선택</Text>
      <View style={styles.userSelectRow}>
        <TextInput
          editable={false}
          value={userEntry?.userName ?? ''}
          placeholder="사용자 선택"
          placeholderTextColor={isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)'}
          style={[styles.userSelectInput, { color: titleColor, borderColor: hairline, backgroundColor: inputBg }]}
        />
        <Pressable
          onPress={() => void openPicker()}
          style={({ pressed }) => [styles.iconBtn, { borderColor: hairline }, pressed && { opacity: 0.75 }]}
          accessibilityRole="button"
          accessibilityLabel="사용자 검색">
          <Ionicons name="search" size={20} color={nrmTokens.color.primary} />
        </Pressable>
        {userEntry !== null && (
          <>
            <Pressable
              onPress={() => setDetailOpen(true)}
              style={({ pressed }) => [styles.textBtn, pressed && { opacity: 0.7 }]}
              accessibilityRole="button">
              <Text style={[styles.textBtnLabel, { color: nrmTokens.color.primary }]}>조회</Text>
            </Pressable>
            <Pressable
              onPress={() => setUserEntry(null)}
              style={({ pressed }) => [styles.textBtn, pressed && { opacity: 0.7 }]}
              accessibilityRole="button">
              <Text style={[styles.textBtnLabel, { color: nrmTokens.color.danger }]}>삭제</Text>
            </Pressable>
          </>
        )}
      </View>

      {/* 사유 */}
      <Text style={[styles.fieldLabel, { color: titleColor }]}>사유</Text>
      <TextInput
        value={content}
        onChangeText={setContent}
        style={[styles.input, { color: titleColor, borderColor: hairline, backgroundColor: inputBg }]}
      />

      {/* 저장 */}
      <Pressable
        onPress={() => void onSave()}
        disabled={saving}
        style={({ pressed }) => [
          styles.saveBtn,
          (pressed || saving) && styles.saveBtnPressed,
          saving && styles.saveBtnDisabled,
        ]}
        accessibilityRole="button">
        {saving ? (
          <ActivityIndicator color={nrmTokens.color.onPrimary} />
        ) : (
          <Text style={styles.saveBtnLabel}>저장</Text>
        )}
      </Pressable>

      {/* ────────────────────────────────
          사용자 선택 오버레이
          ──────────────────────────────── */}
      <Modal visible={pickerOpen} transparent animationType="fade" onRequestClose={closePicker}>
        <View style={[styles.modalFullscreen, { backgroundColor: modalScrim }]}>
          {/* 스크림 (카드 바깥 터치 시 닫기) */}
          <Pressable onPress={closePicker} style={StyleSheet.absoluteFillObject} />

          {/* 카드 */}
          <View style={[styles.pickerCard, { backgroundColor: surfaceBg, borderColor: hairline }]}>

            {/* 헤더 */}
            <View style={[styles.pickerHeader, { borderColor: hairline }]}>
              <Text style={[styles.pickerTitle, { color: titleColor }]}>사용자 검색</Text>
              <Pressable onPress={closePicker} style={styles.pickerCloseBtn} accessibilityRole="button" accessibilityLabel="닫기">
                <Ionicons name="close" size={22} color={bodyColor} />
              </Pressable>
            </View>

            {/* 검색 바 */}
            {!pickerSearchActive ? (
              <View style={styles.pickerSearchBtnRow}>
                <Pressable
                  onPress={() => setPickerSearchActive(true)}
                  style={({ pressed }) => [styles.pickerSearchToggle, { borderColor: hairline }, pressed && { opacity: 0.7 }]}
                  accessibilityRole="button">
                  <Ionicons name="search-outline" size={15} color={nrmTokens.color.primary} />
                  <Text style={styles.pickerSearchToggleText}>검색</Text>
                </Pressable>
              </View>
            ) : (
              <>
                <View style={[styles.pickerSearchActiveRow, { borderColor: hairline }]}>
                  <Pressable
                    onPress={() => setPickerDropdownOpen((v) => !v)}
                    style={[styles.pickerFieldDropdownBtn, { borderColor: hairline }]}>
                    <Text style={[styles.pickerFieldDropdownText, { color: titleColor }]}>
                      {pickerSearchField === 'userName' ? '사용자 이름' : '시리얼번호'}
                    </Text>
                    <Ionicons
                      name={pickerDropdownOpen ? 'chevron-up' : 'chevron-down'}
                      size={13}
                      color={bodyColor}
                    />
                  </Pressable>
                  <TextInput
                    value={pickerSearchText}
                    onChangeText={setPickerSearchText}
                    placeholder="검색어 입력"
                    placeholderTextColor={isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)'}
                    style={[styles.pickerSearchInput, { color: titleColor, borderColor: hairline }]}
                    autoFocus
                  />
                  <Pressable onPress={closePickerSearch} style={styles.pickerSearchCloseBtn}>
                    <Ionicons name="close" size={18} color={bodyColor} />
                  </Pressable>
                </View>

                {pickerDropdownOpen && (
                  <View style={[styles.pickerDropdownMenu, { backgroundColor: dropdownBg, borderColor: hairline }]}>
                    {(['userName', 'SerialNo'] as SearchField[]).map((f) => (
                      <Pressable
                        key={f}
                        onPress={() => {
                          setPickerSearchField(f);
                          setPickerDropdownOpen(false);
                        }}
                        style={({ pressed }) => [styles.pickerDropdownItem, pressed && { opacity: 0.7 }]}>
                        <Text
                          style={[
                            styles.pickerDropdownItemText,
                            { color: titleColor },
                            pickerSearchField === f && styles.pickerDropdownItemActive,
                          ]}>
                          {f === 'userName' ? '사용자 이름' : '시리얼번호'}
                        </Text>
                        {pickerSearchField === f && (
                          <Ionicons name="checkmark" size={15} color={nrmTokens.color.primary} />
                        )}
                      </Pressable>
                    ))}
                  </View>
                )}
              </>
            )}

            {/* 사용자 리스트 */}
            {userLoading ? (
              <ActivityIndicator color={nrmTokens.color.primary} style={styles.pickerLoader} />
            ) : (
              <FlatList
                data={displayRows}
                keyExtractor={(item) => `${item.id}-${item.SerialNo}`}
                style={styles.pickerList}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => (
                  <Pressable
                    onPress={() => onPickerSelect(item)}
                    style={({ pressed }) => [
                      styles.pickerRow,
                      { borderColor: hairline },
                      pressed && {
                        backgroundColor: isDark
                          ? 'rgba(255,255,255,0.06)'
                          : 'rgba(0,0,0,0.04)',
                      },
                    ]}>
                    <Text style={[styles.pickerRowName, { color: titleColor }]}>{item.userName}</Text>
                    <Text style={[styles.pickerRowSerial, { color: bodyColor }]}>{item.SerialNo}</Text>
                  </Pressable>
                )}
                ListEmptyComponent={
                  <Text style={[styles.pickerEmpty, { color: bodyColor }]}>
                    {allRows.length === 0 ? '등록된 사용자가 없습니다.' : '검색 결과가 없습니다.'}
                  </Text>
                }
                ListFooterComponent={
                  !userLoading && displayCount < filteredRows.length ? (
                    <ActivityIndicator
                      size="small"
                      color={nrmTokens.color.primary}
                      style={styles.pickerFooterLoader}
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
          </View>
        </View>
      </Modal>

      {/* ────────────────────────────────
          조회 팝업
          ──────────────────────────────── */}
      <Modal visible={detailOpen} transparent animationType="fade" onRequestClose={() => setDetailOpen(false)}>
        <View style={[styles.modalFullscreen, { backgroundColor: modalScrim }]}>
          <Pressable onPress={() => setDetailOpen(false)} style={StyleSheet.absoluteFillObject} />
          <View style={[styles.detailCard, { backgroundColor: surfaceBg, borderColor: hairline }]}>
            <Text style={[styles.detailTitle, { color: titleColor }]}>사용자 상세 정보</Text>
            {userEntry !== null &&
              DETAIL_FIELDS.map(({ key, label }) => (
                <View key={key} style={[styles.detailRow, { borderColor: hairline }]}>
                  <Text style={[styles.detailLabel, { color: bodyColor }]}>{label}</Text>
                  <Text style={[styles.detailValue, { color: titleColor }]} selectable>
                    {String(userEntry[key] ?? '-')}
                  </Text>
                </View>
              ))}
            <Pressable
              onPress={() => setDetailOpen(false)}
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
  title: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: nrmTokens.space.md,
  },
  fieldLabel: {
    fontSize: nrmTokens.font.bodyStrong,
    fontWeight: '600',
    marginBottom: nrmTokens.space.xs,
    marginTop: nrmTokens.space.sm,
  },
  input: {
    borderWidth: INPUT_BORDER,
    borderRadius: nrmTokens.radius.md,
    paddingHorizontal: nrmTokens.space.md,
    paddingVertical: nrmTokens.space.sm,
    fontSize: nrmTokens.font.body,
    minHeight: 44,
  },

  /* 사용자 선택 행 */
  userSelectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: nrmTokens.space.xs,
  },
  userSelectInput: {
    flex: 1,
    borderWidth: INPUT_BORDER,
    borderRadius: nrmTokens.radius.md,
    paddingHorizontal: nrmTokens.space.md,
    paddingVertical: nrmTokens.space.sm,
    fontSize: nrmTokens.font.body,
    minHeight: 44,
  },
  iconBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: nrmTokens.radius.md,
    borderWidth: INPUT_BORDER,
  },
  textBtn: {
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: nrmTokens.space.sm,
  },
  textBtnLabel: {
    fontSize: nrmTokens.font.body,
    fontWeight: '600',
  },

  /* 저장 버튼 */
  saveBtn: {
    marginTop: nrmTokens.space.xl,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    borderRadius: nrmTokens.radius.pill,
    backgroundColor: nrmTokens.color.primary,
  },
  saveBtnPressed: { opacity: 0.92 },
  saveBtnDisabled: { opacity: 0.7 },
  saveBtnLabel: {
    color: nrmTokens.color.onPrimary,
    fontSize: nrmTokens.font.bodyStrong,
    fontWeight: '600',
  },

  /* 모달 공통 */
  modalFullscreen: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: nrmTokens.space.lg,
  },

  /* 사용자 선택 오버레이 카드 */
  pickerCard: {
    width: '100%',
    maxWidth: 500,
    maxHeight: 540,
    borderRadius: nrmTokens.radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: nrmTokens.space.md,
    paddingVertical: nrmTokens.space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  pickerTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  pickerCloseBtn: {
    padding: 4,
  },

  /* 오버레이 검색 바 */
  pickerSearchBtnRow: {
    flexDirection: 'row',
    paddingHorizontal: nrmTokens.space.md,
    paddingVertical: nrmTokens.space.xs,
  },
  pickerSearchToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: nrmTokens.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  pickerSearchToggleText: {
    fontSize: nrmTokens.font.caption,
    fontWeight: '500',
    color: nrmTokens.color.primary,
  },
  pickerSearchActiveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: nrmTokens.space.md,
    paddingVertical: nrmTokens.space.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  pickerFieldDropdownBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: nrmTokens.radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    minWidth: 86,
  },
  pickerFieldDropdownText: {
    fontSize: nrmTokens.font.caption,
    fontWeight: '500',
    flex: 1,
  },
  pickerSearchInput: {
    flex: 1,
    fontSize: nrmTokens.font.body,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: nrmTokens.radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 32,
  },
  pickerSearchCloseBtn: {
    padding: 3,
  },

  /* 오버레이 드롭다운 메뉴 */
  pickerDropdownMenu: {
    marginHorizontal: nrmTokens.space.md,
    marginBottom: nrmTokens.space.xs,
    borderRadius: nrmTokens.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  pickerDropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  pickerDropdownItemText: {
    fontSize: nrmTokens.font.body,
    flex: 1,
  },
  pickerDropdownItemActive: {
    color: nrmTokens.color.primary,
    fontWeight: '600',
  },

  /* 오버레이 리스트 */
  pickerLoader: {
    paddingVertical: nrmTokens.space.xl,
  },
  pickerList: {
    flex: 1,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: nrmTokens.space.md,
    paddingVertical: nrmTokens.space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: nrmTokens.space.sm,
  },
  pickerRowName: {
    fontSize: nrmTokens.font.body,
    fontWeight: '600',
    flex: 1,
  },
  pickerRowSerial: {
    fontSize: nrmTokens.font.caption,
    flexShrink: 0,
  },
  pickerEmpty: {
    fontSize: nrmTokens.font.body,
    textAlign: 'center',
    paddingVertical: nrmTokens.space.xl,
    paddingHorizontal: nrmTokens.space.md,
  },
  pickerFooterLoader: {
    paddingVertical: nrmTokens.space.md,
  },

  /* 조회 팝업 카드 */
  detailCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: nrmTokens.radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: nrmTokens.space.lg,
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
    marginTop: nrmTokens.space.md,
    alignSelf: 'center',
    paddingVertical: 10,
    paddingHorizontal: 32,
    borderRadius: nrmTokens.radius.pill,
    backgroundColor: nrmTokens.color.primary,
  },
  detailCloseBtnText: {
    color: '#ffffff',
    fontSize: nrmTokens.font.body,
    fontWeight: '600',
  },
});
