import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { NrmMelonAdultAuthLoginModal } from '@/components/nrm/settings/NrmMelonAdultAuthLoginModal';
import { nrmTokens } from '@/constants/nrmTokens';
import {
  NRM_API_SETTINGS_SAVED_MESSAGE,
  NRM_API_SETTINGS_UNSAVED_CONFIRM,
  NRM_API_SETTINGS_UNSAVED_CONFIRM_MESSAGE,
} from '@/lib/nrmApiSettingsUi';
import {
  clearMelonAdultSession,
  getMelonAdultSession,
  hasMelonAdultSession,
  melonCookieHeaderHasLogin,
  saveMelonAdultSession,
} from '@/lib/nrmMelonAdultSession';
import {
  clearMelonWebLoginCookies,
  hasNrmMelonCookieNativeModule,
} from '@/lib/nrmMelonCookie';
import { copyToClipboard } from '@/lib/nrmCopyText';
import { confirmUser, notifyUser } from '@/lib/nrmUserNotify';

const PANEL_INPUT_BORDER = Platform.OS === 'web' ? StyleSheet.hairlineWidth : 1;
const FIELD_BORDER_COLOR = 'rgba(128,128,128,0.4)';

type Props = {
  titleColor: string;
  bodyColor: string;
  rowHover: string;
  onBack: () => void;
  onCloseDrawer?: () => void;
  registerBackHandler?: (handler: (() => boolean) | null) => void;
  registerDrawerDismiss?: (handler: (() => void) | null) => void;
};

function MenuBackRow({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={styles.backRow}
      accessibilityRole="button"
      accessibilityLabel="뒤로">
      <Ionicons name="chevron-back" size={22} color={nrmTokens.color.primary} />
      <Text style={styles.backText}>뒤로</Text>
    </Pressable>
  );
}

function FieldLabelRow({
  label,
  bodyColor: color,
  hasValue,
  onCopy,
}: {
  label: string;
  bodyColor: string;
  hasValue: boolean;
  onCopy?: () => void;
}) {
  return (
    <View style={styles.fieldLabelRow}>
      <Text style={[styles.fieldLabel, { color }]}>{label}</Text>
      {onCopy ? (
        <Pressable
          onPress={onCopy}
          disabled={!hasValue}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`${label} 복사`}
          accessibilityState={{ disabled: !hasValue }}
          style={({ pressed }) => [
            styles.copyIconBtn,
            !hasValue && styles.copyIconBtnDisabled,
            pressed && hasValue && styles.copyIconBtnPressed,
          ]}>
          <Ionicons
            name="copy-outline"
            size={18}
            color={hasValue ? nrmTokens.color.primary : 'rgba(128,128,128,0.45)'}
          />
        </Pressable>
      ) : null}
    </View>
  );
}

function formatSavedAt(ms: number): string {
  try {
    return new Date(ms).toLocaleString('ko-KR');
  } catch {
    return '';
  }
}

export function NrmMelonAdultAuthPanel({
  titleColor,
  bodyColor,
  rowHover,
  onBack,
  onCloseDrawer,
  registerBackHandler,
  registerDrawerDismiss,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [cookieField, setCookieField] = useState('');
  const [loginVisible, setLoginVisible] = useState(false);
  const [webViewSessionKey, setWebViewSessionKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const savedCookieRef = useRef('');

  const canUseWebView = Platform.OS === 'android' && hasNrmMelonCookieNativeModule();

  const refreshStatus = useCallback(async () => {
    setLoading(true);
    try {
      const session = await getMelonAdultSession();
      const cookie = session?.cookieHeader ?? '';
      setSaved(session != null);
      setSavedAt(session?.savedAt ?? null);
      setCookieField(cookie);
      savedCookieRef.current = cookie.trim();
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  const isDraftDirty = useCallback(
    () => cookieField.trim() !== savedCookieRef.current,
    [cookieField],
  );

  const restoreDraft = useCallback(() => {
    setCookieField(savedCookieRef.current);
  }, []);

  const persistCookieHeader = useCallback(
    async (rawCookie: string, source: 'webview' | 'manual'): Promise<boolean> => {
      const trimmed = rawCookie.trim();
      if (!trimmed) {
        notifyUser('저장할 쿠키가 없습니다. 멜론 로그인 후 다시 시도해 주세요.');
        return false;
      }
      if (!melonCookieHeaderHasLogin(trimmed)) {
        notifyUser(
          '멜론 로그인 쿠키(MLCP)가 없습니다. 로그인·성인인증을 완료한 뒤 다시 저장해 주세요.',
        );
        return false;
      }
      setSaving(true);
      try {
        await saveMelonAdultSession(trimmed);
        setSaved(true);
        setSavedAt(Date.now());
        setCookieField(trimmed);
        savedCookieRef.current = trimmed;
        notifyUser(
          source === 'webview'
            ? '멜론 성인인증 세션이 저장되었습니다.'
            : '멜론 쿠키가 저장되었습니다.',
        );
        return true;
      } finally {
        setSaving(false);
      }
    },
    [],
  );

  const handleSaveManual = useCallback(async () => {
    await persistCookieHeader(cookieField, 'manual');
  }, [cookieField, persistCookieHeader]);

  const handleLeave = useCallback(
    async (target: 'appSettings' | 'closeDrawer') => {
      if (isDraftDirty()) {
        const save = await confirmUser(
          NRM_API_SETTINGS_UNSAVED_CONFIRM_MESSAGE,
          NRM_API_SETTINGS_UNSAVED_CONFIRM,
        );
        if (save) {
          const ok = await persistCookieHeader(cookieField, 'manual');
          if (!ok) return;
          void notifyUser(NRM_API_SETTINGS_SAVED_MESSAGE);
        } else {
          restoreDraft();
        }
      }
      if (target === 'appSettings') {
        onBack();
      } else {
        onCloseDrawer?.();
      }
    },
    [cookieField, isDraftDirty, onBack, onCloseDrawer, persistCookieHeader, restoreDraft],
  );

  useEffect(() => {
    registerBackHandler?.(() => {
      if (isDraftDirty()) {
        void handleLeave('appSettings');
        return true;
      }
      return false;
    });
    return () => registerBackHandler?.(null);
  }, [handleLeave, isDraftDirty, registerBackHandler]);

  useEffect(() => {
    registerDrawerDismiss?.(() => {
      void handleLeave('closeDrawer');
    });
    return () => registerDrawerDismiss?.(null);
  }, [handleLeave, registerDrawerDismiss]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (isDraftDirty()) {
        void handleLeave('appSettings');
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [handleLeave, isDraftDirty]);

  /** WebView 에서 MLCP 쿠키를 감지하면 자동 저장 후 모달 닫기 */
  const handleWebViewCookieCaptured = useCallback(
    async (cookieHeader: string) => {
      const ok = await persistCookieHeader(cookieHeader, 'webview');
      if (ok) setLoginVisible(false);
    },
    [persistCookieHeader],
  );

  const handleClear = useCallback(async () => {
    setSaving(true);
    try {
      await clearMelonAdultSession();
      await clearMelonWebLoginCookies();
      setSaved(false);
      setSavedAt(null);
      setCookieField('');
      savedCookieRef.current = '';
      setWebViewSessionKey((k) => k + 1);
      notifyUser('멜론 성인인증 세션이 삭제되었습니다.');
    } finally {
      setSaving(false);
    }
  }, []);

  const handleOpenLogin = useCallback(() => {
    setWebViewSessionKey((k) => k + 1);
    setLoginVisible(true);
  }, []);

  return (
    <>
      <MenuBackRow onPress={() => void handleLeave('appSettings')} />
      <Text style={[styles.panelTitle, { color: titleColor }]}>멜론 성인인증</Text>

      {canUseWebView ? (
        <Pressable
          onPress={handleOpenLogin}
          disabled={saving}
          style={({ pressed }) => [
            styles.primaryBtn,
            pressed && styles.primaryBtnPressed,
            saving && styles.disabled,
          ]}>
          <Text style={[styles.primaryBtnLabel, { color: titleColor }]}>
            멜론 WebView 로그인
          </Text>
        </Pressable>
      ) : (
        <Text style={[styles.webUnavailableNote, { color: bodyColor }]}>
          {Platform.OS === 'web'
            ? '웹에서는 브라우저 개발자 도구(F12) → Network → melon.com 요청의 Cookie 헤더를 아래에 붙여넣어 저장하세요.'
            : 'Expo Go에서는 WebView 쿠키를 읽을 수 없습니다. APK 빌드에서 WebView 로그인을 사용하거나, 쿠키를 직접 입력하세요.'}
        </Text>
      )}

      <NrmMelonAdultAuthLoginModal
        visible={loginVisible}
        titleColor={titleColor}
        webViewSessionKey={webViewSessionKey}
        onClose={() => setLoginVisible(false)}
        onCookieCaptured={(cookie) => void handleWebViewCookieCaptured(cookie)}
      />

      <FieldLabelRow
        label="쿠키 헤더"
        bodyColor={bodyColor}
        hasValue={cookieField.trim().length > 0}
        onCopy={
          cookieField.trim()
            ? () => void copyToClipboard(cookieField.trim()).then(() => notifyUser('쿠키가 복사되었습니다.'))
            : undefined
        }
      />
      <View style={[styles.fieldShell, { borderColor: FIELD_BORDER_COLOR, borderWidth: PANEL_INPUT_BORDER }]}>
        <TextInput
          value={cookieField}
          onChangeText={setCookieField}
          autoCapitalize="none"
          autoCorrect={false}
          style={[styles.fieldInner, { color: titleColor }]}
        />
      </View>

      <Pressable
        onPress={() => void handleSaveManual()}
        disabled={saving || !cookieField.trim()}
        style={({ pressed }) => [
          styles.primaryBtn,
          styles.saveBtn,
          (saving || !cookieField.trim()) && styles.disabled,
          pressed && !saving && cookieField.trim() ? styles.primaryBtnPressed : undefined,
        ]}>
        <Text style={[styles.saveBtnLabel, { color: titleColor }]}>저장</Text>
      </Pressable>

      {loading ? (
        <ActivityIndicator style={styles.loader} color={nrmTokens.color.primary} />
      ) : saved ? (
        <>
          <View style={[styles.statusBox, { borderColor: FIELD_BORDER_COLOR }]}>
            <Text style={[styles.statusLabel, { color: bodyColor }]}>저장 상태</Text>
            <Text style={[styles.statusValue, { color: '#6ecf8a' }]}>인증 세션 저장됨</Text>
            {savedAt ? (
              <Text style={[styles.statusMeta, { color: bodyColor }]}>
                저장 시각: {formatSavedAt(savedAt)}
              </Text>
            ) : null}
          </View>
          <Pressable
            onPress={() => void handleClear()}
            disabled={saving}
            style={({ pressed }) => [
              styles.dangerRow,
              pressed && { backgroundColor: rowHover },
              saving && styles.disabled,
            ]}>
            <Text style={styles.dangerLabel}>세션 삭제</Text>
          </Pressable>
        </>
      ) : null}
    </>
  );
}

/** 설정 화면 외부에서 세션 존재 여부 확인 */
export { hasMelonAdultSession };

const styles = StyleSheet.create({
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: nrmTokens.space.sm,
  },
  backText: {
    fontSize: nrmTokens.font.body,
    color: nrmTokens.color.primary,
  },
  panelTitle: {
    fontSize: nrmTokens.font.lead,
    fontWeight: '700',
    marginBottom: nrmTokens.space.sm,
  },
  primaryBtn: {
    borderRadius: nrmTokens.radius.md,
    borderWidth: PANEL_INPUT_BORDER,
    borderColor: FIELD_BORDER_COLOR,
    paddingVertical: nrmTokens.space.md,
    paddingHorizontal: nrmTokens.space.sm,
    marginBottom: nrmTokens.space.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnPressed: {
    opacity: 0.75,
  },
  primaryBtnLabel: {
    fontSize: nrmTokens.font.body,
    fontWeight: '500',
    textAlign: 'center',
  },
  saveBtn: {
    marginBottom: nrmTokens.space.sm,
  },
  saveBtnLabel: {
    fontSize: nrmTokens.font.body,
    fontWeight: '600',
    textAlign: 'center',
  },
  webUnavailableNote: {
    fontSize: nrmTokens.font.caption,
    lineHeight: 18,
    marginBottom: nrmTokens.space.md,
  },
  fieldLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: nrmTokens.space.xs,
  },
  fieldLabel: {
    fontSize: nrmTokens.font.caption,
    flex: 1,
  },
  copyIconBtn: {
    padding: 4,
  },
  copyIconBtnDisabled: {
    opacity: 0.4,
  },
  copyIconBtnPressed: {
    opacity: 0.6,
  },
  fieldShell: {
    borderRadius: nrmTokens.radius.md,
    overflow: 'hidden',
    marginBottom: nrmTokens.space.sm,
  },
  fieldInner: {
    minHeight: 44,
    paddingHorizontal: nrmTokens.space.sm,
    paddingVertical: nrmTokens.space.sm,
    fontSize: nrmTokens.font.body,
  },
  loader: {
    marginVertical: nrmTokens.space.lg,
  },
  statusBox: {
    borderWidth: PANEL_INPUT_BORDER,
    borderRadius: nrmTokens.radius.md,
    padding: nrmTokens.space.md,
    marginTop: nrmTokens.space.sm,
    marginBottom: nrmTokens.space.md,
  },
  statusLabel: {
    fontSize: nrmTokens.font.caption,
    marginBottom: 4,
  },
  statusValue: {
    fontSize: nrmTokens.font.body,
    fontWeight: '600',
  },
  statusMeta: {
    fontSize: nrmTokens.font.caption,
    marginTop: 4,
  },
  dangerRow: {
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: nrmTokens.space.sm,
  },
  dangerLabel: {
    color: '#e57373',
    fontSize: nrmTokens.font.body,
  },
  disabled: {
    opacity: 0.5,
  },
});
