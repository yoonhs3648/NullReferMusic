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
          <View style={[styles.userModalHeader, { borderColor: hairline }]}>
            {onClear ? (
              <Pressable
                onPress={() => {
                  onClear();
                  onClose();
                }}
                style={({ pressed }) => [styles.userModalHeaderBtn, pressed && { opacity: 0.85 }]}>
                <Text style={[styles.userModalHeaderBtnText, { color: nrmTokens.color.primary }]}>
                  설정안함
                </Text>
              </Pressable>
            ) : (
              <View />
            )}
            <Pressable
              onPress={onClose}
              style={styles.userModalCloseBtn}
              accessibilityRole="button"
              accessibilityLabel="닫기">
              <Ionicons name="close" size={22} color={bodyColor} />
            </Pressable>
          </View>
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
            />
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
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: nrmTokens.space.md,
    paddingVertical: nrmTokens.space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  userModalHeaderBtn: {
    paddingVertical: nrmTokens.space.xs,
    paddingHorizontal: nrmTokens.space.xs,
  },
  userModalHeaderBtnText: {
    fontSize: nrmTokens.font.body,
    fontWeight: '600',
  },
  userModalCloseBtn: {
    padding: nrmTokens.space.xs,
  },
  userModalBody: {
    flex: 1,
    minHeight: 0,
    paddingHorizontal: nrmTokens.space.md,
    paddingBottom: nrmTokens.space.md,
  },
});
