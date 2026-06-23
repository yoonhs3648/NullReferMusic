import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
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
import { notifyUser } from '@/lib/nrmUserNotify';
import { getNrmModalScrimColor } from '@/lib/nrmUiAppearanceColors';

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
  const [userLabel, setUserLabel] = useState('');
  const [userSerial, setUserSerial] = useState('');
  const [content, setContent] = useState('');
  const [userPickerOpen, setUserPickerOpen] = useState(false);
  const [userRows, setUserRows] = useState<NrmUserListEntry[]>([]);
  const [userLoading, setUserLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const hairline = isDark ? nrmTokens.color.borderOnDark : nrmTokens.color.hairline;
  const inputBg = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)';
  const modalScrim = getNrmModalScrimColor(isDark);

  const openUserPicker = useCallback(async () => {
    setUserPickerOpen(true);
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

  const onSave = useCallback(async () => {
    if (!userSerial.trim() || !userLabel.trim()) {
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
        userName: userLabel,
        serialNo: userSerial,
        content,
      });
      setUserLabel('');
      setUserSerial('');
      setContent('');
      void notifyUser('블랙리스트에 등록되었습니다.');
    } catch (e) {
      void notifyUser(e instanceof Error ? e.message : '등록에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  }, [content, userLabel, userSerial]);

  return (
    <NrmMenuDrawerScroll>
      <MenuBackRow onPress={onBack} />
      <Text style={[styles.title, { color: titleColor }]}>사용자 블랙리스트 등록</Text>

      <Text style={[styles.fieldLabel, { color: titleColor }]}>사용자</Text>
      <View style={styles.personalRow}>
        <TextInput
          editable={false}
          value={userLabel}
          placeholder="사용자 선택"
          placeholderTextColor={bodyColor}
          style={[
            styles.personalInput,
            { color: titleColor, borderColor: hairline, backgroundColor: inputBg },
          ]}
        />
        <Pressable
          onPress={() => void openUserPicker()}
          style={({ pressed }) => [styles.searchBtn, pressed && styles.searchBtnPressed]}
          accessibilityRole="button"
          accessibilityLabel="사용자 검색">
          <Ionicons name="search" size={20} color={nrmTokens.color.primary} />
        </Pressable>
      </View>

      <Text style={[styles.fieldLabel, { color: titleColor }]}>사유</Text>
      <TextInput
        value={content}
        onChangeText={setContent}
        style={[styles.input, { color: titleColor, borderColor: hairline, backgroundColor: inputBg }]}
      />

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

      <Modal visible={userPickerOpen} transparent animationType="fade" onRequestClose={() => setUserPickerOpen(false)}>
        <Pressable style={[styles.modalRoot, { backgroundColor: modalScrim }]} onPress={() => setUserPickerOpen(false)}>
          <View style={[styles.modalCard, styles.userModalCard, { backgroundColor: isDark ? nrmTokens.color.surfaceTile1 : nrmTokens.color.canvas, borderColor: hairline }]}>
            {userLoading ? (
              <ActivityIndicator style={styles.userLoading} color={nrmTokens.color.primary} />
            ) : userRows.length === 0 ? (
              <Text style={[styles.modalRowText, { color: bodyColor, padding: nrmTokens.space.lg }]}>
                등록된 사용자가 없습니다.
              </Text>
            ) : (
              userRows.map((row) => (
                <Pressable
                  key={`${row.id}-${row.SerialNo}`}
                  onPress={() => {
                    setUserLabel(row.userName);
                    setUserSerial(row.SerialNo);
                    setUserPickerOpen(false);
                  }}
                  style={({ pressed }) => [styles.modalRow, pressed && { opacity: 0.85 }]}>
                  <Text style={[styles.modalRowText, { color: titleColor }]}>{row.userName}</Text>
                </Pressable>
              ))
            )}
          </View>
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
  personalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: nrmTokens.space.sm,
  },
  personalInput: {
    flex: 1,
    borderWidth: INPUT_BORDER,
    borderRadius: nrmTokens.radius.md,
    paddingHorizontal: nrmTokens.space.md,
    paddingVertical: nrmTokens.space.sm,
    fontSize: nrmTokens.font.body,
    minHeight: 44,
  },
  searchBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: nrmTokens.radius.md,
    borderWidth: INPUT_BORDER,
    borderColor: 'rgba(128,128,128,0.35)',
  },
  searchBtnPressed: {
    opacity: 0.85,
  },
  saveBtn: {
    marginTop: nrmTokens.space.xl,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    borderRadius: nrmTokens.radius.pill,
    backgroundColor: nrmTokens.color.primary,
  },
  saveBtnPressed: {
    opacity: 0.92,
  },
  saveBtnDisabled: {
    opacity: 0.7,
  },
  saveBtnLabel: {
    color: nrmTokens.color.onPrimary,
    fontSize: nrmTokens.font.bodyStrong,
    fontWeight: '600',
  },
  modalRoot: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: nrmTokens.space.lg,
  },
  modalCard: {
    borderRadius: nrmTokens.radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  userModalCard: {
    maxHeight: 360,
  },
  modalRow: {
    paddingHorizontal: nrmTokens.space.lg,
    paddingVertical: nrmTokens.space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(128,128,128,0.25)',
  },
  modalRowText: {
    fontSize: nrmTokens.font.body,
  },
  userLoading: {
    paddingVertical: nrmTokens.space.lg,
  },
});
