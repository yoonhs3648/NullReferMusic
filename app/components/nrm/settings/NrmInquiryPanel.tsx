import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useMemo, useState } from 'react';
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
import { registerInquiryToGithub } from '@/lib/nrmGithubInquiryRegister';
import {
  pickInquiryAttachmentFile,
  type NrmInquiryAttachmentPick,
} from '@/lib/nrmInquiryAttachment';
import { validateInquiryContent } from '@/lib/nrmJsonFieldValidation';
import {
  NRM_INQUIRY_MAX_ATTACHMENT_BYTES,
  NRM_INQUIRY_MAX_CONTENT_CHARS,
} from '@/lib/nrmRemoteDataConfig';
import { notifyUser } from '@/lib/nrmUserNotify';
import { getNrmModalScrimColor } from '@/lib/nrmUiAppearanceColors';

type Props = {
  titleColor: string;
  bodyColor: string;
  isDark: boolean;
  onBack: () => void;
};

const INPUT_BORDER = Platform.OS === 'web' ? StyleSheet.hairlineWidth : 1;
const MB = 1024 * 1024;

function formatMb(bytes: number): string {
  return (bytes / MB).toFixed(1);
}

function isTxtAttachmentName(name: string): boolean {
  return name.trim().toLowerCase().endsWith('.txt');
}

function MenuBackRow({ onPress }: { onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.backRow} accessibilityRole="button" accessibilityLabel="뒤로">
      <Ionicons name="chevron-back" size={22} color={nrmTokens.color.primary} />
      <Text style={styles.backText}>뒤로</Text>
    </Pressable>
  );
}

export function NrmInquiryPanel({ titleColor, bodyColor, isDark, onBack }: Props) {
  const [content, setContent] = useState('');
  const [attachment, setAttachment] = useState<NrmInquiryAttachmentPick | null>(null);
  const [picking, setPicking] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const hairline = isDark ? nrmTokens.color.borderOnDark : nrmTokens.color.hairline;
  const inputBg = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)';
  const modalScrim = getNrmModalScrimColor(isDark);

  const attachMb = useMemo(() => formatMb(attachment?.sizeBytes ?? 0), [attachment]);
  const maxMb = useMemo(() => formatMb(NRM_INQUIRY_MAX_ATTACHMENT_BYTES), []);

  const onChangeContent = useCallback((text: string) => {
    if (text.length > NRM_INQUIRY_MAX_CONTENT_CHARS) return;
    setContent(text);
  }, []);

  const onAttachPress = useCallback(async () => {
    if (Platform.OS === 'web') {
      void notifyUser('첨부 파일은 Android 앱에서만 선택할 수 있습니다.');
      return;
    }
    setPicking(true);
    try {
      const picked = await pickInquiryAttachmentFile();
      if (!picked) return;
      if (!isTxtAttachmentName(picked.name)) {
        void notifyUser('txt 파일만 첨부할 수 있습니다.');
        return;
      }
      if (picked.sizeBytes > NRM_INQUIRY_MAX_ATTACHMENT_BYTES) {
        void notifyUser('첨부파일은 20MB 까지 가능합니다.');
        return;
      }
      setAttachment(picked);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '파일을 선택하지 못했습니다.';
      void notifyUser(msg);
    } finally {
      setPicking(false);
    }
  }, []);

  const onSubmit = useCallback(async () => {
    const err = validateInquiryContent(content);
    if (err) {
      void notifyUser(err);
      return;
    }
    if (attachment && attachment.sizeBytes > NRM_INQUIRY_MAX_ATTACHMENT_BYTES) {
      void notifyUser('첨부파일은 20MB 까지 가능합니다.');
      return;
    }
    setSubmitting(true);
    try {
      await registerInquiryToGithub({ content, attachment });
      setContent('');
      setAttachment(null);
      void notifyUser('완료되었습니다.');
    } catch (e) {
      void notifyUser(e instanceof Error ? e.message : '문의 등록에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  }, [attachment, content]);

  return (
    <View style={styles.root}>
      <NrmMenuDrawerScroll>
        <MenuBackRow onPress={onBack} />
        <Text style={[styles.panelTitle, { color: titleColor }]}>문의하기</Text>
        <Text style={[styles.fieldLabel, { color: titleColor }]}>문의내용</Text>
        <TextInput
          value={content}
          onChangeText={onChangeContent}
          multiline
          editable={!submitting}
          textAlignVertical="top"
          style={[
            styles.textArea,
            { color: titleColor, borderColor: hairline, backgroundColor: inputBg },
          ]}
        />
        <Text style={[styles.counter, { color: bodyColor }]}>
          [{content.length}/{NRM_INQUIRY_MAX_CONTENT_CHARS}]
        </Text>

        <View style={styles.attachHeadRow}>
          <Text style={[styles.fieldLabel, { color: titleColor, marginTop: 0 }]}>첨부파일</Text>
          <Text style={[styles.attachQuota, { color: bodyColor }]}>
            ({attachMb}/{maxMb}MB, txt)
          </Text>
        </View>
        <View style={styles.attachRow}>
          <Text
            style={[styles.attachName, { color: titleColor, borderColor: hairline, backgroundColor: inputBg }]}
            numberOfLines={1}>
            {attachment?.name ?? '선택된 파일 없음'}
          </Text>
          <Pressable
            onPress={() => void onAttachPress()}
            disabled={submitting || picking}
            style={({ pressed }) => [
              styles.attachBtn,
              (pressed || picking) && styles.attachBtnPressed,
              (submitting || picking) && styles.attachBtnDisabled,
            ]}
            accessibilityRole="button"
            accessibilityLabel="파일 첨부">
            {picking ? (
              <ActivityIndicator color={nrmTokens.color.primary} size="small" />
            ) : (
              <Ionicons name="folder-open-outline" size={20} color={nrmTokens.color.primary} />
            )}
            <Text style={styles.attachBtnLabel}>파일첨부</Text>
          </Pressable>
        </View>

        <Pressable
          onPress={() => void onSubmit()}
          disabled={submitting}
          style={({ pressed }) => [
            styles.submitBtn,
            (pressed || submitting) && styles.submitBtnPressed,
            submitting && styles.submitBtnDisabled,
          ]}
          accessibilityRole="button">
          <Text style={styles.submitBtnLabel}>문의하기</Text>
        </Pressable>
      </NrmMenuDrawerScroll>

      {submitting ? (
        <Modal visible transparent animationType="fade">
          <View style={[styles.blocker, { backgroundColor: modalScrim }]}>
            <ActivityIndicator size="large" color={nrmTokens.color.primary} />
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
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
  panelTitle: {
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
  textArea: {
    borderWidth: INPUT_BORDER,
    borderRadius: nrmTokens.radius.md,
    paddingHorizontal: nrmTokens.space.md,
    paddingVertical: nrmTokens.space.sm,
    fontSize: nrmTokens.font.body,
    minHeight: 140,
    lineHeight: 22,
  },
  counter: {
    marginTop: nrmTokens.space.xs,
    fontSize: nrmTokens.font.caption,
    textAlign: 'right',
  },
  attachHeadRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: nrmTokens.space.md,
  },
  attachQuota: {
    fontSize: nrmTokens.font.caption,
  },
  attachRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: nrmTokens.space.sm,
  },
  attachName: {
    flex: 1,
    borderWidth: INPUT_BORDER,
    borderRadius: nrmTokens.radius.md,
    paddingHorizontal: nrmTokens.space.md,
    paddingVertical: nrmTokens.space.sm,
    fontSize: nrmTokens.font.body,
    minHeight: 44,
  },
  attachBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: nrmTokens.space.sm,
    minHeight: 44,
    borderRadius: nrmTokens.radius.md,
    borderWidth: INPUT_BORDER,
    borderColor: 'rgba(128,128,128,0.35)',
  },
  attachBtnPressed: {
    opacity: 0.88,
  },
  attachBtnDisabled: {
    opacity: 0.65,
  },
  attachBtnLabel: {
    color: nrmTokens.color.primary,
    fontSize: nrmTokens.font.caption,
    fontWeight: '600',
  },
  submitBtn: {
    marginTop: nrmTokens.space.xl,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    borderRadius: nrmTokens.radius.pill,
    backgroundColor: nrmTokens.color.primary,
  },
  submitBtnPressed: {
    opacity: 0.92,
  },
  submitBtnDisabled: {
    opacity: 0.7,
  },
  submitBtnLabel: {
    color: nrmTokens.color.onPrimary,
    fontSize: nrmTokens.font.bodyStrong,
    fontWeight: '600',
  },
  blocker: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
