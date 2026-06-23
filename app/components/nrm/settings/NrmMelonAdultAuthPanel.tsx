import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
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
  clearMelonAdultSession,
  getMelonAdultSession,
  hasMelonAdultSession,
  melonCookieHeaderHasLogin,
  saveMelonAdultSession,
} from '@/lib/nrmMelonAdultSession';
import {
  clearMelonWebLoginCookies,
  hasNrmMelonCookieNativeModule,
  readMelonLoginCookieHeader,
} from '@/lib/nrmMelonCookie';
import { notifyUser } from '@/lib/nrmUserNotify';

const PANEL_INPUT_BORDER = Platform.OS === 'web' ? StyleSheet.hairlineWidth : 1;
const FIELD_BORDER_COLOR = 'rgba(128,128,128,0.4)';

type Props = {
  titleColor: string;
  bodyColor: string;
  rowHover: string;
  onBack: () => void;
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

function formatSavedAt(ms: number): string {
  try {
    return new Date(ms).toLocaleString('ko-KR');
  } catch {
    return '';
  }
}

export function NrmMelonAdultAuthPanel({ titleColor, bodyColor, rowHover, onBack }: Props) {
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [manualCookie, setManualCookie] = useState('');
  const [loginVisible, setLoginVisible] = useState(false);
  const [webViewSessionKey, setWebViewSessionKey] = useState(0);
  const [saving, setSaving] = useState(false);

  const canUseWebView = Platform.OS === 'android' && hasNrmMelonCookieNativeModule();

  const refreshStatus = useCallback(async () => {
    setLoading(true);
    try {
      const session = await getMelonAdultSession();
      setSaved(session != null);
      setSavedAt(session?.savedAt ?? null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  const persistCookieHeader = useCallback(
    async (cookieHeader: string, source: 'webview' | 'manual') => {
      const trimmed = cookieHeader.trim();
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

  const handleSaveFromWebView = useCallback(async () => {
    const cookieHeader = await readMelonLoginCookieHeader();
    const ok = await persistCookieHeader(cookieHeader ?? '', 'webview');
    if (ok) setLoginVisible(false);
  }, [persistCookieHeader]);

  const handleSaveManual = useCallback(async () => {
    const ok = await persistCookieHeader(manualCookie, 'manual');
    if (ok) setManualCookie('');
  }, [manualCookie, persistCookieHeader]);

  const handleClear = useCallback(async () => {
    setSaving(true);
    try {
      await clearMelonAdultSession();
      await clearMelonWebLoginCookies();
      setSaved(false);
      setSavedAt(null);
      setManualCookie('');
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
      <MenuBackRow onPress={onBack} />
      <Text style={[styles.panelTitle, { color: titleColor }]}>멜론 성인인증</Text>
      <Text style={[styles.lead, { color: bodyColor }]}>
        일부 19금 곡은 멜론 로그인·성인인증 후에만 가사를 볼 수 있습니다. 인증 세션을 저장하면
        가사 조회·다운로드 시 자동으로 사용됩니다.
      </Text>

      {loading ? (
        <ActivityIndicator style={styles.loader} color={nrmTokens.color.primary} />
      ) : (
        <View style={[styles.statusBox, { borderColor: FIELD_BORDER_COLOR }]}>
          <Text style={[styles.statusLabel, { color: titleColor }]}>저장 상태</Text>
          <Text style={[styles.statusValue, { color: saved ? '#6ecf8a' : bodyColor }]}>
            {saved ? '인증 세션 저장됨' : '미저장'}
          </Text>
          {saved && savedAt ? (
            <Text style={[styles.statusMeta, { color: bodyColor }]}>
              저장 시각: {formatSavedAt(savedAt)}
            </Text>
          ) : null}
        </View>
      )}

      {canUseWebView ? (
        <Pressable
          onPress={handleOpenLogin}
          disabled={saving}
          style={({ pressed }) => [
            styles.actionRow,
            pressed && { backgroundColor: rowHover },
            saving && styles.disabled,
          ]}>
          <Text style={[styles.actionLabel, { color: titleColor }]}>멜론 로그인 · 성인인증</Text>
          <Ionicons name="open-outline" size={20} color={bodyColor} />
        </Pressable>
      ) : (
        <Text style={[styles.note, { color: bodyColor }]}>
          {Platform.OS === 'web'
            ? '웹에서는 브라우저 개발자 도구(F12) → Network → melon.com 요청의 Cookie 헤더를 아래에 붙여넣어 저장하세요.'
            : 'Expo Go에서는 WebView 쿠키를 읽을 수 없습니다. APK 빌드에서 WebView 로그인을 사용하거나, 쿠키를 직접 입력하세요.'}
        </Text>
      )}

      <Text style={[styles.fieldLabel, { color: titleColor }]}>Cookie 헤더 (수동)</Text>
      <TextInput
        value={manualCookie}
        onChangeText={setManualCookie}
        placeholder="MLCP=...; keyCookie=...; JSESSIONID=..."
        placeholderTextColor="rgba(128,128,128,0.7)"
        multiline
        textAlignVertical="top"
        autoCapitalize="none"
        autoCorrect={false}
        style={[
          styles.cookieInput,
          {
            color: titleColor,
            borderColor: FIELD_BORDER_COLOR,
            borderWidth: PANEL_INPUT_BORDER,
          },
        ]}
      />
      <Pressable
        onPress={() => void handleSaveManual()}
        disabled={saving || !manualCookie.trim()}
        style={({ pressed }) => [
          styles.primaryBtn,
          (saving || !manualCookie.trim()) && styles.disabled,
          pressed && !saving && manualCookie.trim() && styles.primaryBtnPressed,
        ]}>
        <Text style={styles.primaryBtnText}>쿠키 저장</Text>
      </Pressable>

      {saved ? (
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
      ) : null}

      <NrmMelonAdultAuthLoginModal
        visible={loginVisible}
        titleColor={titleColor}
        bodyColor={bodyColor}
        webViewSessionKey={webViewSessionKey}
        onClose={() => setLoginVisible(false)}
        onRequestSave={() => void handleSaveFromWebView()}
      />
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
  lead: {
    fontSize: nrmTokens.font.caption,
    lineHeight: 20,
    marginBottom: nrmTokens.space.md,
  },
  loader: {
    marginVertical: nrmTokens.space.lg,
  },
  statusBox: {
    borderWidth: PANEL_INPUT_BORDER,
    borderRadius: nrmTokens.radius.md,
    padding: nrmTokens.space.md,
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
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 52,
    paddingHorizontal: nrmTokens.space.sm,
    marginBottom: nrmTokens.space.md,
  },
  actionLabel: {
    fontSize: nrmTokens.font.body,
    fontWeight: '500',
  },
  note: {
    fontSize: nrmTokens.font.caption,
    lineHeight: 18,
    marginBottom: nrmTokens.space.md,
  },
  fieldLabel: {
    fontSize: nrmTokens.font.caption,
    marginBottom: nrmTokens.space.xs,
  },
  cookieInput: {
    minHeight: 88,
    borderRadius: nrmTokens.radius.md,
    paddingHorizontal: nrmTokens.space.sm,
    paddingVertical: nrmTokens.space.sm,
    fontSize: nrmTokens.font.caption,
    marginBottom: nrmTokens.space.sm,
  },
  primaryBtn: {
    backgroundColor: nrmTokens.color.primary,
    borderRadius: nrmTokens.radius.md,
    paddingVertical: nrmTokens.space.md,
    alignItems: 'center',
    marginBottom: nrmTokens.space.md,
  },
  primaryBtnPressed: {
    opacity: 0.85,
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: nrmTokens.font.body,
    fontWeight: '600',
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
