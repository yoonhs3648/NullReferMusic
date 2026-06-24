import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { NrmAdminUserLookupContent } from '@/components/nrm/settings/NrmAdminUserLookupContent';
import { nrmTokens } from '@/constants/nrmTokens';
import { fetchDedupedUserListEntries, type NrmUserListEntry } from '@/lib/nrmUserListClient';
import { notifyUser } from '@/lib/nrmUserNotify';
import { getNrmModalScrimColor } from '@/lib/nrmUiAppearanceColors';

type Props = {
  visible: boolean;
  onClose: () => void;
  onSelect: (entry: NrmUserListEntry) => void;
  onClear?: () => void;
  titleColor: string;
  bodyColor: string;
  isDark: boolean;
};

export function NrmAdminUserPickerModal({
  visible,
  onClose,
  onSelect,
  onClear,
  titleColor,
  bodyColor,
  isDark,
}: Props) {
  const { height: windowHeight } = useWindowDimensions();
  const [userRows, setUserRows] = useState<NrmUserListEntry[]>([]);
  const [userLoading, setUserLoading] = useState(false);
  const [searchActive, setSearchActive] = useState(false);

  const hairline = isDark ? nrmTokens.color.borderOnDark : nrmTokens.color.hairline;
  const modalScrim = getNrmModalScrimColor(isDark);
  const surfaceBg = isDark ? nrmTokens.color.surfaceTile1 : nrmTokens.color.canvas;

  const loadUsers = useCallback(async () => {
    setUserLoading(true);
    try {
      setUserRows(await fetchDedupedUserListEntries());
    } catch {
      setUserRows([]);
      void notifyUser('사용자 목록을 불러오지 못했습니다.');
    } finally {
      setUserLoading(false);
    }
  }, []);

  useEffect(() => {
    if (visible) {
      setSearchActive(false);
      void loadUsers();
    }
  }, [visible, loadUsers]);

  const onRowPress = useCallback(
    (entry: NrmUserListEntry) => {
      onSelect(entry);
      onClose();
    },
    [onClose, onSelect],
  );

  const handleClear = useCallback(() => {
    onClear?.();
    onClose();
  }, [onClear, onClose]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={[styles.modalRoot, { backgroundColor: modalScrim }]} onPress={onClose}>
        <View
          onStartShouldSetResponder={() => true}
          style={[
            styles.userModalCard,
            {
              height: windowHeight * 0.8,
              backgroundColor: surfaceBg,
              borderColor: hairline,
            },
          ]}>

          {/* 헤더: 검색 버튼(비활성 시) — 우측 정렬 */}
          <View style={styles.userModalHeader}>
            {!searchActive ? (
              <Pressable
                onPress={() => setSearchActive(true)}
                style={({ pressed }) => [styles.searchIconBtn, pressed && { opacity: 0.7 }]}
                accessibilityRole="button"
                accessibilityLabel="검색">
                <Ionicons name="search-outline" size={20} color={nrmTokens.color.primary} />
              </Pressable>
            ) : (
              <View style={styles.searchIconBtn} />
            )}
          </View>

          {/* 본문: 검색바 + 유저 목록 */}
          <View style={styles.userModalBody}>
            <NrmAdminUserLookupContent
              titleColor={titleColor}
              bodyColor={bodyColor}
              isDark={isDark}
              rows={userRows}
              loading={userLoading}
              scrollEnabled
              rowPressable
              onRowPress={onRowPress}
              externalSearchActive={searchActive}
              onExternalSearchActiveChange={setSearchActive}
            />
          </View>

          {/* 푸터: 설정안함(좌) / 닫기(우) */}
          <View style={[styles.userModalFooter, { borderColor: hairline }]}>
            {onClear ? (
              <Pressable
                onPress={handleClear}
                style={({ pressed }) => [styles.footerBtn, pressed && { opacity: 0.8 }]}
                accessibilityRole="button">
                <Text style={[styles.footerBtnTextLeft, { color: nrmTokens.color.primary }]}>
                  설정안함
                </Text>
              </Pressable>
            ) : (
              <View />
            )}
            <Pressable
              onPress={onClose}
              style={({ pressed }) => [styles.footerBtn, pressed && { opacity: 0.8 }]}
              accessibilityRole="button"
              accessibilityLabel="닫기">
              <Text style={[styles.footerBtnText, { color: bodyColor }]}>닫기</Text>
            </Pressable>
          </View>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: nrmTokens.space.lg,
  },
  userModalCard: {
    width: '100%',
    maxWidth: 440,
    borderRadius: nrmTokens.radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  userModalHeader: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: nrmTokens.space.sm,
    paddingTop: nrmTokens.space.sm,
    paddingBottom: 0,
  },
  searchIconBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: nrmTokens.radius.md,
  },
  userModalBody: {
    flex: 1,
    minHeight: 0,
    paddingHorizontal: nrmTokens.space.md,
    paddingTop: nrmTokens.space.xs,
    paddingBottom: nrmTokens.space.sm,
  },
  userModalFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: nrmTokens.space.md,
    paddingVertical: nrmTokens.space.sm,
  },
  footerBtn: {
    paddingVertical: nrmTokens.space.sm,
    paddingHorizontal: nrmTokens.space.sm,
  },
  footerBtnTextLeft: {
    fontSize: nrmTokens.font.body,
    fontWeight: '600',
  },
  footerBtnText: {
    fontSize: nrmTokens.font.body,
    fontWeight: '500',
  },
});
