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

import { NrmAdminUserPickerModal } from '@/components/nrm/settings/NrmAdminUserPickerModal';
import { NrmMenuDrawerScroll } from '@/components/nrm/NrmMenuDrawerScroll';
import { nrmTokens } from '@/constants/nrmTokens';
import { validateBanContent } from '@/lib/nrmJsonFieldValidation';
import { registerUserBanToGithub } from '@/lib/nrmGithubUserBanRegister';
import {
  formatNrmLoginKindLabel,
  formatNrmUserListSubtitle,
  type NrmUserListEntry,
} from '@/lib/nrmUserListClient';
import { getNrmModalScrimColor } from '@/lib/nrmUiAppearanceColors';
import { notifyUserError } from '@/lib/nrmDevLog';
import { notifyUser } from '@/lib/nrmUserNotify';

type DetailField =
  | { key: Exclude<keyof NrmUserListEntry, 'deviceId'>; label: string; special?: undefined }
  | { key: 'deviceId'; label: string; special: 'device' };

const DETAIL_FIELDS: DetailField[] = [
  { key: 'appKind', label: '로그인' },
  { key: 'userName', label: '사용자 이름' },
  { key: 'userEmail', label: '이메일' },
  { key: 'deviceId', label: '기기', special: 'device' },
  { key: 'lastAccessDate', label: '마지막 접속' },
  { key: 'version', label: '버전' },
  { key: 'Createddate', label: '등록일' },
];

function resolveBanUserDetailValue(entry: NrmUserListEntry, field: DetailField): string {
  if (field.special === 'device') {
    const v = entry.deviceId;
    return v !== null && v !== '' ? '등록됨' : '미등록';
  }
  if (field.key === 'appKind') {
    return formatNrmLoginKindLabel(entry.appKind);
  }
  const raw = entry[field.key];
  return String(raw ?? '-');
}

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
  const [pickerOpen, setPickerOpen] = useState(false);

  const hairline = isDark ? nrmTokens.color.borderOnDark : nrmTokens.color.hairline;
  const inputBg = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)';
  const surfaceBg = isDark ? nrmTokens.color.surfaceTile1 : nrmTokens.color.canvas;
  const modalScrim = getNrmModalScrimColor(isDark);

  const onUserSelect = useCallback((entry: NrmUserListEntry) => {
    setUserEntry(entry);
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
    if (!userEntry.deviceId?.trim()) {
      void notifyUser('기기 미등록 사용자는 차단할 수 없습니다. 해당 기기에서 앱을 한 번 실행한 뒤 다시 시도하세요.');
      return;
    }
    setSaving(true);
    try {
      await registerUserBanToGithub({
        userName: userEntry.userName,
        serialNo: userEntry.SerialNo,
        deviceId: userEntry.deviceId.trim(),
        content,
      });
      setUserEntry(null);
      setContent('');
      void notifyUser('블랙리스트에 등록되었습니다.');
    } catch (e) {
      notifyUserError('admin.userBanRegister', e, '등록에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  }, [content, userEntry]);

  return (
    <NrmMenuDrawerScroll>
      <MenuBackRow onPress={onBack} />
      <Text style={[styles.title, { color: titleColor }]}>사용자 블랙리스트 등록</Text>

      <Text style={[styles.fieldLabel, { color: titleColor }]}>사용자 선택</Text>
      <View style={styles.userSelectRow}>
        <TextInput
          editable={false}
          value={
            userEntry
              ? `${userEntry.userName} · ${formatNrmUserListSubtitle(userEntry)}`
              : ''
          }
          placeholder="사용자 선택"
          placeholderTextColor={isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)'}
          style={[styles.userSelectInput, { color: titleColor, borderColor: hairline, backgroundColor: inputBg }]}
        />
        <Pressable
          onPress={() => setPickerOpen(true)}
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
        ]}
        accessibilityRole="button">
        <Text style={styles.saveBtnLabel}>저장</Text>
      </Pressable>

      {/* 저장 중 — 전체 화면 블로킹 스피너 */}
      <Modal visible={saving} transparent animationType="none" statusBarTranslucent>
        <View style={styles.savingOverlay}>
          <ActivityIndicator size="large" color={nrmTokens.color.primary} />
        </View>
      </Modal>

      <NrmAdminUserPickerModal
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={onUserSelect}
        titleColor={titleColor}
        bodyColor={bodyColor}
        isDark={isDark}
      />

      <Modal visible={detailOpen} transparent animationType="fade" onRequestClose={() => setDetailOpen(false)}>
        <View style={[styles.modalFullscreen, { backgroundColor: modalScrim }]}>
          <Pressable onPress={() => setDetailOpen(false)} style={StyleSheet.absoluteFillObject} />
          <View style={[styles.detailCard, { backgroundColor: surfaceBg, borderColor: hairline }]}>
            <Text style={[styles.detailTitle, { color: titleColor }]}>사용자 상세 정보</Text>
            {userEntry !== null &&
              DETAIL_FIELDS.map((field) => (
                <View key={field.key} style={[styles.detailRow, { borderColor: hairline }]}>
                  <Text style={[styles.detailLabel, { color: bodyColor }]}>{field.label}</Text>
                  <Text style={[styles.detailValue, { color: titleColor }]} selectable>
                    {resolveBanUserDetailValue(userEntry, field)}
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
  saveBtn: {
    marginTop: nrmTokens.space.xl,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    borderRadius: nrmTokens.radius.pill,
    backgroundColor: nrmTokens.color.primary,
  },
  saveBtnPressed: { opacity: 0.92 },
  savingOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  saveBtnLabel: {
    color: nrmTokens.color.onPrimary,
    fontSize: nrmTokens.font.bodyStrong,
    fontWeight: '600',
  },
  modalFullscreen: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: nrmTokens.space.lg,
  },
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
