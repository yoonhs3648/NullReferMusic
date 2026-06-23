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
import { validateAlarmJsonField } from '@/lib/nrmJsonFieldValidation';
import { registerAlarmToGithub } from '@/lib/nrmGithubAlarmRegister';
import { fetchDedupedUserListEntries, type NrmUserListEntry } from '@/lib/nrmUserListClient';
import { notifyUser } from '@/lib/nrmUserNotify';
import { getNrmModalScrimColor } from '@/lib/nrmUiAppearanceColors';

type Props = {
  titleColor: string;
  bodyColor: string;
  isDark: boolean;
  onBack: () => void;
};

type NotiKind = 'normal' | 'notice';

const NOTI_LABEL: Record<NotiKind, string> = {
  normal: '일반',
  notice: '공지',
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

export function NrmAdminAlarmRegisterPanel({ titleColor, bodyColor, isDark, onBack }: Props) {
  const [notiKind, setNotiKind] = useState<NotiKind>('normal');
  const [notiPickerOpen, setNotiPickerOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [personalLabel, setPersonalLabel] = useState('설정안함');
  const [personalSerial, setPersonalSerial] = useState('');
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
    const titleErr = validateAlarmJsonField('title', title);
    if (titleErr) {
      void notifyUser(titleErr);
      return;
    }
    const contentErr = validateAlarmJsonField('content', content);
    if (contentErr) {
      void notifyUser(contentErr);
      return;
    }
    setSaving(true);
    try {
      await registerAlarmToGithub({
        isNoti: notiKind === 'notice',
        title,
        content,
        serialNo: personalSerial,
      });
      setTitle('');
      setContent('');
      setNotiKind('normal');
      setPersonalLabel('설정안함');
      setPersonalSerial('');
      void notifyUser('알림이 등록되었습니다.');
    } catch (e) {
      void notifyUser(e instanceof Error ? e.message : '알림 등록에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  }, [content, notiKind, personalSerial, title]);

  return (
    <NrmMenuDrawerScroll>
      <MenuBackRow onPress={onBack} />
      <Text style={[styles.title, { color: titleColor }]}>알림 등록</Text>

      <Text style={[styles.fieldLabel, { color: titleColor }]}>알림종류</Text>
      <Pressable
        onPress={() => setNotiPickerOpen(true)}
        style={[styles.selectRow, { borderColor: hairline, backgroundColor: inputBg }]}>
        <Text style={[styles.selectValue, { color: titleColor }]}>{NOTI_LABEL[notiKind]}</Text>
        <Ionicons name="chevron-down" size={18} color={bodyColor} />
      </Pressable>

      <Text style={[styles.fieldLabel, { color: titleColor }]}>제목</Text>
      <TextInput
        value={title}
        onChangeText={setTitle}
        style={[styles.input, { color: titleColor, borderColor: hairline, backgroundColor: inputBg }]}
      />

      <Text style={[styles.fieldLabel, { color: titleColor }]}>내용</Text>
      <TextInput
        value={content}
        onChangeText={setContent}
        multiline
        textAlignVertical="top"
        style={[
          styles.textArea,
          { color: titleColor, borderColor: hairline, backgroundColor: inputBg },
        ]}
      />

      <Text style={[styles.fieldLabel, { color: titleColor }]}>개인전송</Text>
      <View style={styles.personalRow}>
        <TextInput
          editable={false}
          value={personalLabel}
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

      <Modal visible={notiPickerOpen} transparent animationType="fade" onRequestClose={() => setNotiPickerOpen(false)}>
        <Pressable style={[styles.modalRoot, { backgroundColor: modalScrim }]} onPress={() => setNotiPickerOpen(false)}>
          <View style={[styles.modalCard, { backgroundColor: isDark ? nrmTokens.color.surfaceTile1 : nrmTokens.color.canvas, borderColor: hairline }]}>
            {(['normal', 'notice'] as const).map((kind) => (
              <Pressable
                key={kind}
                onPress={() => {
                  setNotiKind(kind);
                  setNotiPickerOpen(false);
                }}
                style={({ pressed }) => [styles.modalRow, pressed && { opacity: 0.85 }]}>
                <Text style={[styles.modalRowText, { color: titleColor }]}>{NOTI_LABEL[kind]}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>

      <Modal visible={userPickerOpen} transparent animationType="fade" onRequestClose={() => setUserPickerOpen(false)}>
        <Pressable style={[styles.modalRoot, { backgroundColor: modalScrim }]} onPress={() => setUserPickerOpen(false)}>
          <View style={[styles.modalCard, styles.userModalCard, { backgroundColor: isDark ? nrmTokens.color.surfaceTile1 : nrmTokens.color.canvas, borderColor: hairline }]}>
            <Pressable
              onPress={() => {
                setPersonalLabel('설정안함');
                setPersonalSerial('');
                setUserPickerOpen(false);
              }}
              style={({ pressed }) => [styles.modalRow, pressed && { opacity: 0.85 }]}>
              <Text style={[styles.modalRowText, { color: titleColor }]}>설정안함</Text>
            </Pressable>
            {userLoading ? (
              <ActivityIndicator style={styles.userLoading} color={nrmTokens.color.primary} />
            ) : (
              userRows.map((row) => (
                <Pressable
                  key={`${row.id}-${row.SerialNo}`}
                  onPress={() => {
                    setPersonalLabel(row.userName);
                    setPersonalSerial(row.SerialNo);
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
  textArea: {
    borderWidth: INPUT_BORDER,
    borderRadius: nrmTokens.radius.md,
    paddingHorizontal: nrmTokens.space.md,
    paddingVertical: nrmTokens.space.sm,
    fontSize: nrmTokens.font.body,
    minHeight: 120,
    lineHeight: 22,
  },
  selectRow: {
    borderWidth: INPUT_BORDER,
    borderRadius: nrmTokens.radius.md,
    paddingHorizontal: nrmTokens.space.md,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectValue: {
    fontSize: nrmTokens.font.body,
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
