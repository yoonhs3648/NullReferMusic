import Ionicons from '@expo/vector-icons/Ionicons';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { nrmTokens } from '@/constants/nrmTokens';
import { copyToClipboard } from '@/lib/nrmCopyText';
import { fetchDeepLUsage } from '@/lib/nrmDeepLApiClient';
import { getDeepLApiKey, loadDeepLUsageSnapshot, saveDeepLApiKey, type NrmDeepLUsageSnapshot } from '@/lib/nrmDeepLApiSettings';
import { NRM_API_SETTINGS_SAVED_MESSAGE, NRM_API_SETTINGS_UNSAVED_CONFIRM, NRM_API_SETTINGS_UNSAVED_CONFIRM_MESSAGE } from '@/lib/nrmApiSettingsUi';
import { hasDeepLWebLogin, logoutDeepLWebLogin } from '@/lib/nrmDeepLWebLogout';
import { confirmUser, notifyUser } from '@/lib/nrmUserNotify';

type ScreenId = 'hub' | 'manage' | 'issue' | 'usage';
const HUB_ROW_H = 52;
const PANEL_INPUT_BORDER = Platform.OS === 'web' ? StyleSheet.hairlineWidth : 1;
const DEEPL_API_URL = 'https://www.deepl.com/account/summary';

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
    <Pressable onPress={onPress} style={styles.backRow} accessibilityRole="button" accessibilityLabel="뒤로">
      <Ionicons name="chevron-back" size={22} color={nrmTokens.color.primary} />
      <Text style={styles.backText}>뒤로</Text>
    </Pressable>
  );
}

function UsageDonut({ usage }: { usage: NrmDeepLUsageSnapshot }) {
  const r = 42;
  const stroke = 10;
  const size = 100;
  const c = 2 * Math.PI * r;
  const pct = usage.characterLimit > 0 ? Math.max(0, Math.min(1, usage.characterCount / usage.characterLimit)) : 0;
  return (
    <View style={styles.donutWrap}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(128,128,128,0.25)" strokeWidth={stroke} fill="none" />
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={nrmTokens.color.primary} strokeWidth={stroke} fill="none" strokeDasharray={`${c} ${c}`} strokeDashoffset={c * (1 - pct)} strokeLinecap="round" transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </Svg>
      <Text style={styles.donutPct}>{Math.round(pct * 100)}%</Text>
    </View>
  );
}

export function NrmDeepLApiManagePanel({
  titleColor, bodyColor, rowHover, onBack, onCloseDrawer, registerBackHandler, registerDrawerDismiss,
}: Props) {
  const [screen, setScreen] = useState<ScreenId>('hub');
  const [draftKey, setDraftKey] = useState('');
  const [usageLoading, setUsageLoading] = useState(false);
  const [usage, setUsage] = useState<NrmDeepLUsageSnapshot | null>(null);
  const [deeplWebLoginActive, setDeeplWebLoginActive] = useState(false);
  const savedSnapshotRef = useRef('');

  const reload = useCallback(async () => {
    const savedKey = await getDeepLApiKey();
    setDraftKey(savedKey);
    savedSnapshotRef.current = savedKey.trim();
    setUsage(await loadDeepLUsageSnapshot());
    setDeeplWebLoginActive(await hasDeepLWebLogin());
  }, []);
  useEffect(() => { void reload(); }, [reload]);

  const isDraftDirty = useCallback(() => draftKey.trim() !== savedSnapshotRef.current, [draftKey]);

  const saveDraft = useCallback(async () => {
    await saveDeepLApiKey(draftKey);
    void notifyUser(NRM_API_SETTINGS_SAVED_MESSAGE);
    await reload();
  }, [draftKey, reload]);

  const restoreDraft = useCallback(() => {
    setDraftKey(savedSnapshotRef.current);
  }, []);

  const handleLeaveEditable = useCallback(
    async (target: 'hub' | 'closeDrawer' | 'appSettings') => {
      if (isDraftDirty() && (screen === 'manage' || screen === 'issue')) {
        const save = await confirmUser(
          NRM_API_SETTINGS_UNSAVED_CONFIRM_MESSAGE,
          NRM_API_SETTINGS_UNSAVED_CONFIRM,
        );
        if (save) {
          await saveDraft();
        } else {
          restoreDraft();
        }
      }
      if (target === 'hub') {
        setScreen('hub');
      } else if (target === 'appSettings') {
        onBack();
      } else {
        onCloseDrawer?.();
      }
    },
    [isDraftDirty, onBack, onCloseDrawer, restoreDraft, saveDraft, screen],
  );

  const refreshUsage = useCallback(async () => {
    const key = draftKey.trim() || (await getDeepLApiKey());
    if (!key) {
      void notifyUser('API 토큰을 먼저 등록해주세요.');
      setUsage(null);
      return;
    }
    setUsageLoading(true);
    const out = await fetchDeepLUsage(key);
    setUsageLoading(false);
    if (!out.ok) {
      void notifyUser(out.message);
      return;
    }
    setUsage(out.usage);
  }, [draftKey]);

  useEffect(() => {
    if (screen !== 'usage') return;
    void refreshUsage();
  }, [refreshUsage, screen]);

  const goBack = useCallback(() => {
    if (screen === 'hub') return false;
    void handleLeaveEditable('hub');
    return true;
  }, [handleLeaveEditable, screen]);
  useEffect(() => {
    registerBackHandler?.(() => {
      if (screen === 'hub') {
        if (isDraftDirty()) {
          void handleLeaveEditable('appSettings');
          return true;
        }
        return false;
      }
      return goBack();
    });
    return () => registerBackHandler?.(null);
  }, [goBack, handleLeaveEditable, isDraftDirty, registerBackHandler, screen]);
  useEffect(() => {
    registerDrawerDismiss?.(() => {
      if (screen === 'hub') {
        if (isDraftDirty()) {
          void handleLeaveEditable('closeDrawer');
          return;
        }
        onCloseDrawer?.();
        return;
      }
      void handleLeaveEditable('closeDrawer');
    });
    return () => registerDrawerDismiss?.(null);
  }, [handleLeaveEditable, isDraftDirty, onCloseDrawer, registerDrawerDismiss, screen]);
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (screen === 'hub') {
        if (isDraftDirty()) {
          void handleLeaveEditable('appSettings');
          return true;
        }
        return false;
      }
      return goBack();
    });
    return () => sub.remove();
  }, [goBack, handleLeaveEditable, isDraftDirty, screen]);

  const copyKey = async () => {
    const ok = await copyToClipboard(draftKey.trim());
    if (Platform.OS === 'web') void notifyUser(ok ? 'API Key를 복사했습니다.' : '복사에 실패했습니다.');
  };

  const handleDeepLLogout = async () => {
    if (!deeplWebLoginActive) return;
    await logoutDeepLWebLogin();
    setDraftKey('');
    setUsage(null);
    savedSnapshotRef.current = '';
    setDeeplWebLoginActive(false);
    void notifyUser('DeepL 로그인 정보를 삭제했습니다.');
  };

  if (screen === 'manage') {
    return (
      <>
        <MenuBackRow onPress={() => void handleLeaveEditable('hub')} />
        <Text style={[styles.panelTitle, { color: titleColor }]}>API Key 관리</Text>
        <View style={styles.fieldLabelRow}>
          <Text style={[styles.fieldLabel, styles.fieldLabelInRow, { color: bodyColor }]}>API Key</Text>
          {draftKey.trim() ? (
            <Pressable onPress={copyKey} hitSlop={8} style={({ pressed }) => [styles.copyIconBtn, pressed && styles.copyIconBtnPressed]}>
              <Ionicons name="copy-outline" size={18} color={nrmTokens.color.primary} />
            </Pressable>
          ) : null}
        </View>
        <View style={[styles.fieldShell, { borderColor: 'rgba(128,128,128,0.4)', borderWidth: PANEL_INPUT_BORDER }]}>
          <TextInput value={draftKey} onChangeText={setDraftKey} autoCapitalize="none" autoCorrect={false} style={[styles.fieldInner, { color: titleColor }]} />
        </View>
        <Pressable onPress={() => void saveDraft()} style={({ pressed }) => [styles.primaryBtn, styles.issueMainBtn, pressed && styles.primaryBtnPressed]}>
          <Text style={[styles.primaryBtnLabel, { color: titleColor }]}>저장</Text>
        </Pressable>
      </>
    );
  }

  if (screen === 'issue') {
    return (
      <>
        <MenuBackRow onPress={() => void handleLeaveEditable('hub')} />
        <Text style={[styles.panelTitle, { color: titleColor }]}>API Key 발급</Text>
        <Text style={[styles.issueGuideLine, { color: bodyColor }]}>DeepL API 페이지에서 API Key를 발급받은 뒤 아래 입력칸에 저장하세요.</Text>
        <Pressable onPress={() => void WebBrowser.openBrowserAsync(DEEPL_API_URL)} accessibilityRole="link" style={({ pressed }) => [styles.dashboardLinkCard, pressed && styles.dashboardLinkCardPressed, pressed && { backgroundColor: rowHover }]}>
          <Ionicons name="open-outline" size={22} color={nrmTokens.color.primary} />
          <Text style={[styles.dashboardLinkLinePrimary, { color: titleColor }]}>DeepL API 조회 페이지 열기</Text>
        </Pressable>
        <Text style={[styles.fieldLabel, { color: bodyColor }]}>API Key</Text>
        <View style={[styles.fieldShell, { borderColor: 'rgba(128,128,128,0.4)', borderWidth: PANEL_INPUT_BORDER }]}>
          <TextInput value={draftKey} onChangeText={setDraftKey} autoCapitalize="none" autoCorrect={false} style={[styles.fieldInner, { color: titleColor }]} />
        </View>
        <Pressable onPress={() => void saveDraft()} style={({ pressed }) => [styles.primaryBtn, styles.issueMainBtn, pressed && styles.primaryBtnPressed]}>
          <Text style={[styles.primaryBtnLabel, { color: titleColor }]}>저장</Text>
        </Pressable>
      </>
    );
  }

  if (screen === 'usage') {
    return (
      <>
        <MenuBackRow onPress={() => setScreen('hub')} />
        <Text style={[styles.panelTitle, { color: titleColor }]}>API 사용량 조회</Text>
        {!draftKey.trim() ? (
          <Text style={[styles.issueGuideLine, { color: bodyColor }]}>API 토큰을 먼저 등록해주세요.</Text>
        ) : (
          <>
            {usage ? (
              <View style={styles.usageCard}>
                <UsageDonut usage={usage} />
                <Text style={[styles.issueGuideLine, { color: bodyColor }]}>월 사용량: {usage.characterCount.toLocaleString()} / {usage.characterLimit.toLocaleString()}</Text>
                <Pressable onPress={() => void refreshUsage()} disabled={usageLoading} style={({ pressed }) => [styles.primaryBtn, usageLoading && styles.primaryBtnDisabled, pressed && !usageLoading && styles.primaryBtnPressed]}>
                  {usageLoading ? <ActivityIndicator color={nrmTokens.color.primary} /> : <Text style={[styles.primaryBtnLabel, { color: titleColor }]}>새로고침</Text>}
                </Pressable>
              </View>
            ) : (
              <Pressable onPress={() => void refreshUsage()} disabled={usageLoading} style={({ pressed }) => [styles.primaryBtn, usageLoading && styles.primaryBtnDisabled, pressed && !usageLoading && styles.primaryBtnPressed]}>
                {usageLoading ? <ActivityIndicator color={nrmTokens.color.primary} /> : <Text style={[styles.primaryBtnLabel, { color: titleColor }]}>새로고침</Text>}
              </Pressable>
            )}
          </>
        )}
      </>
    );
  }

  return (
    <>
      <MenuBackRow onPress={() => void handleLeaveEditable('appSettings')} />
      <Text style={[styles.panelTitle, { color: titleColor }]}>번역기 API Key 관리</Text>
      <Text style={[styles.issueGuideLine, { color: bodyColor }]}>DeepL 번역기 API를 사용합니다.</Text>
      <Pressable onPress={() => setScreen('manage')} style={({ pressed }) => [styles.hubRow, styles.hubRowFixed, pressed && styles.hubRowPressed]}><Text style={[styles.hubRowTitleSm, { color: titleColor }]}>API Key 관리</Text></Pressable>
      <Pressable onPress={() => setScreen('issue')} style={({ pressed }) => [styles.hubRow, styles.hubRowFixed, pressed && styles.hubRowPressed]}><Text style={[styles.hubRowTitleSm, { color: titleColor }]}>API Key 발급</Text></Pressable>
      <Pressable onPress={() => setScreen('usage')} style={({ pressed }) => [styles.hubRow, styles.hubRowFixed, pressed && styles.hubRowPressed]}><Text style={[styles.hubRowTitleSm, { color: titleColor }]}>API 사용량 조회</Text></Pressable>
      <Pressable
        onPress={() => void handleDeepLLogout()}
        disabled={!deeplWebLoginActive}
        style={({ pressed }) => [
          styles.hubRow,
          styles.hubRowFixed,
          !deeplWebLoginActive && styles.hubRowDisabled,
          pressed && deeplWebLoginActive && styles.hubRowPressed,
        ]}
        accessibilityRole="button"
        accessibilityState={{ disabled: !deeplWebLoginActive }}>
        <Text style={[styles.hubRowTitleSm, { color: titleColor }]}>로그아웃</Text>
      </Pressable>
    </>
  );
}

const styles = StyleSheet.create({
  backRow: { flexDirection: 'row', alignItems: 'center', gap: nrmTokens.space.xxs, marginTop: nrmTokens.space.md, marginBottom: nrmTokens.space.md, alignSelf: 'flex-start' },
  backText: { fontSize: nrmTokens.font.body, color: nrmTokens.color.primary, fontWeight: '500' },
  panelTitle: { fontSize: nrmTokens.font.lead, fontWeight: '600', marginBottom: nrmTokens.space.md, letterSpacing: -0.4 },
  issueGuideLine: { fontSize: nrmTokens.font.caption, fontWeight: '400', lineHeight: 18, marginBottom: nrmTokens.space.sm },
  hubRow: { justifyContent: 'center', paddingHorizontal: nrmTokens.space.md, borderRadius: nrmTokens.radius.pill, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(128,128,128,0.4)', marginBottom: nrmTokens.space.sm },
  hubRowFixed: { height: HUB_ROW_H, overflow: 'hidden' },
  hubRowPressed: { opacity: 0.92 },
  hubRowDisabled: { opacity: 0.55 },
  hubRowTitleSm: { fontSize: 15, fontWeight: '600', textAlign: 'center', lineHeight: 18 },
  fieldShell: { alignSelf: 'stretch', maxWidth: '100%', borderRadius: nrmTokens.radius.sm, overflow: 'hidden', marginBottom: nrmTokens.space.sm },
  fieldInner: { paddingHorizontal: nrmTokens.space.sm, paddingVertical: Platform.OS === 'ios' ? 12 : 10, fontSize: nrmTokens.font.body },
  fieldLabel: { fontSize: nrmTokens.font.caption, marginBottom: nrmTokens.space.xxs, marginTop: nrmTokens.space.sm },
  fieldLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: nrmTokens.space.sm, marginBottom: nrmTokens.space.xxs },
  fieldLabelInRow: { marginTop: 0, marginBottom: 0, flex: 1 },
  copyIconBtn: { padding: nrmTokens.space.xxs, marginLeft: nrmTokens.space.xs },
  copyIconBtnDisabled: { opacity: 0.45 },
  copyIconBtnPressed: { opacity: 0.75 },
  primaryBtn: { alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: nrmTokens.radius.pill, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(128,128,128,0.4)', marginBottom: nrmTokens.space.sm },
  primaryBtnLabel: { fontSize: nrmTokens.font.body, fontWeight: '600' },
  issueMainBtn: { backgroundColor: 'rgba(0, 102, 204, 0.06)', borderColor: 'rgba(0, 102, 204, 0.35)' },
  primaryBtnDisabled: { opacity: 0.55 },
  primaryBtnPressed: { opacity: 0.92 },
  dashboardLinkCard: { flexDirection: 'column', alignItems: 'center', gap: nrmTokens.space.sm, paddingVertical: nrmTokens.space.md, paddingHorizontal: nrmTokens.space.md, borderRadius: nrmTokens.radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(0, 102, 204, 0.35)', marginBottom: nrmTokens.space.sm },
  dashboardLinkCardPressed: { opacity: 0.95 },
  dashboardLinkLinePrimary: { fontSize: nrmTokens.font.body, fontWeight: '600', letterSpacing: -0.3, textAlign: 'center', lineHeight: 24 },
  usageCard: { alignItems: 'center', gap: nrmTokens.space.sm, marginTop: nrmTokens.space.sm },
  donutWrap: { alignItems: 'center', justifyContent: 'center' },
  donutPct: { position: 'absolute', fontSize: nrmTokens.font.body, fontWeight: '700', color: nrmTokens.color.primary },
});
