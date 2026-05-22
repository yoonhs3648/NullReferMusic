import Ionicons from '@expo/vector-icons/Ionicons';
import * as WebBrowser from 'expo-web-browser';
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

import { nrmTokens } from '@/constants/nrmTokens';
import { copyToClipboard } from '@/lib/nrmCopyText';
import { issueLastfmAccessToken } from '@/lib/nrmLastfmApiClient';
import {
  getLastfmCredentials,
  saveLastfmCredentials,
  type NrmLastfmCredentials,
} from '@/lib/nrmLastfmApiSettings';
import { confirmUser, notifyUser } from '@/lib/nrmUserNotify';

type ScreenId = 'hub' | 'manage' | 'issue';

type DraftSnapshot = {
  clientId: string;
  clientSecret: string;
};

const HUB_ROW_H = 52;
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

const LASTFM_DASHBOARD_URL = 'https://www.last.fm/api/account/create';

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

function fieldShellStyle() {
  return {
    borderColor: FIELD_BORDER_COLOR,
    borderWidth: PANEL_INPUT_BORDER,
  };
}

function FieldLabelRow({
  label,
  bodyColor,
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
      <Text style={[styles.fieldLabel, styles.fieldLabelInRow, { color: bodyColor }]}>
        {label}
      </Text>
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
            color={
              hasValue
                ? nrmTokens.color.primary
                : 'rgba(128,128,128,0.45)'
            }
          />
        </Pressable>
      ) : null}
    </View>
  );
}

function CredentialFields({
  draftId,
  draftSecret,
  setDraftId,
  setDraftSecret,
  titleColor,
  bodyColor,
  onCopy,
}: {
  draftId: string;
  draftSecret: string;
  setDraftId: (v: string) => void;
  setDraftSecret: (v: string) => void;
  titleColor: string;
  bodyColor: string;
  onCopy: (label: string, raw: string) => void;
}) {
  const id = draftId.trim();
  const secret = draftSecret.trim();

  return (
    <>
      <FieldLabelRow
        label="API Key"
        bodyColor={bodyColor}
        hasValue={id.length > 0}
        onCopy={id ? () => void onCopy('API Key', id) : undefined}
      />
      <View style={[styles.fieldShell, fieldShellStyle()]}>
        <TextInput
          value={draftId}
          onChangeText={setDraftId}
          autoCapitalize="none"
          autoCorrect={false}
          style={[styles.fieldInner, styles.fieldInnerSingle, { color: titleColor }]}
        />
      </View>
      <FieldLabelRow
        label="Shared Secret"
        bodyColor={bodyColor}
        hasValue={secret.length > 0}
        onCopy={secret ? () => void onCopy('Shared Secret', secret) : undefined}
      />
      <View style={[styles.fieldShell, fieldShellStyle()]}>
        <TextInput
          value={draftSecret}
          onChangeText={setDraftSecret}
          autoCapitalize="none"
          autoCorrect={false}
          style={[styles.fieldInner, styles.fieldInnerSingle, { color: titleColor }]}
        />
      </View>
    </>
  );
}

export function NrmLastfmApiManagePanel({
  titleColor,
  bodyColor,
  rowHover,
  onBack,
  onCloseDrawer,
  registerBackHandler,
  registerDrawerDismiss,
}: Props) {
  const [screen, setScreen] = useState<ScreenId>('hub');
  const [draftId, setDraftId] = useState('');
  const [draftSecret, setDraftSecret] = useState('');
  const [issuing, setIssuing] = useState(false);
  const savedSnapshotRef = useRef<DraftSnapshot | null>(null);

  const reload = useCallback(async () => {
    const c = await getLastfmCredentials();
    const id = c?.clientId ?? '';
    const secret = c?.clientSecret ?? '';
    setDraftId(id);
    setDraftSecret(secret);
    savedSnapshotRef.current = {
      clientId: id.trim(),
      clientSecret: secret.trim(),
    };
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const captureEditableBaseline = useCallback(() => {
    savedSnapshotRef.current = {
      clientId: draftId.trim(),
      clientSecret: draftSecret.trim(),
    };
  }, [draftId, draftSecret]);

  const isDraftDirty = useCallback(() => {
    const saved = savedSnapshotRef.current;
    if (!saved) return false;
    return (
      draftId.trim() !== saved.clientId ||
      draftSecret.trim() !== saved.clientSecret
    );
  }, [draftId, draftSecret]);

  const restoreDraftSnapshot = useCallback(() => {
    const saved = savedSnapshotRef.current;
    if (!saved) return;
    setDraftId(saved.clientId);
    setDraftSecret(saved.clientSecret);
  }, []);

  const persistAllDrafts = useCallback(async () => {
    await saveLastfmCredentials({
      clientId: draftId.trim(),
      clientSecret: draftSecret.trim(),
    });
    await reload();
  }, [draftId, draftSecret, reload]);

  const handleLeaveEditable = useCallback(
    async (target: 'hub' | 'closeDrawer' | 'appSettings') => {
      if (isDraftDirty()) {
        const save = await confirmUser('변경된 값을 저장할까요?');
        if (save) {
          await persistAllDrafts();
          void notifyUser('저장했습니다.');
        } else {
          restoreDraftSnapshot();
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
    [
      isDraftDirty,
      onBack,
      onCloseDrawer,
      persistAllDrafts,
      restoreDraftSnapshot,
    ],
  );

  const handleDrawerDismiss = useCallback(() => {
    if (screen === 'manage' || screen === 'issue' || isDraftDirty()) {
      void handleLeaveEditable('closeDrawer');
      return;
    }
    onCloseDrawer?.();
  }, [handleLeaveEditable, isDraftDirty, onCloseDrawer, screen]);

  useEffect(() => {
    registerBackHandler?.(() => {
      if (screen === 'hub') {
        if (isDraftDirty()) {
          void handleLeaveEditable('appSettings');
          return true;
        }
        return false;
      }
      if (screen === 'manage' || screen === 'issue') {
        void handleLeaveEditable('hub');
        return true;
      }
      return false;
    });
    return () => registerBackHandler?.(null);
  }, [handleLeaveEditable, isDraftDirty, registerBackHandler, screen]);

  useEffect(() => {
    registerDrawerDismiss?.(handleDrawerDismiss);
    return () => registerDrawerDismiss?.(null);
  }, [handleDrawerDismiss, registerDrawerDismiss]);

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
      if (screen === 'manage' || screen === 'issue') {
        void handleLeaveEditable('hub');
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [handleLeaveEditable, isDraftDirty, screen]);

  const onCopy = async (label: string, value: string) => {
    const ok = await copyToClipboard(value);
    if (Platform.OS === 'web') {
      void notifyUser(
        ok ? `${label}을(를) 복사했습니다.` : `${label} 복사에 실패했습니다.`,
      );
    }
  };

  const onSaveManage = async () => {
    await persistAllDrafts();
    void notifyUser('저장했습니다.');
  };

  const onVerifyAndSave = async () => {
    if (!draftId.trim()) {
      void notifyUser('API Key를 입력하세요.');
      return;
    }
    const body: NrmLastfmCredentials = {
      clientId: draftId.trim(),
      clientSecret: draftSecret.trim(),
    };
    setIssuing(true);
    const out = await issueLastfmAccessToken(body);
    setIssuing(false);
    if (!out.ok) {
      void notifyUser(out.message);
      return;
    }
    await saveLastfmCredentials(body);
    savedSnapshotRef.current = {
      clientId: body.clientId,
      clientSecret: body.clientSecret,
    };
    void notifyUser('API Key를 확인·저장했습니다.');
    await reload();
  };

  const openDashboard = async () => {
    await WebBrowser.openBrowserAsync(LASTFM_DASHBOARD_URL);
  };

  if (screen === 'manage') {
    return (
      <>
        <MenuBackRow onPress={() => void handleLeaveEditable('hub')} />
        <Text style={[styles.panelTitle, { color: titleColor }]}>
          API 토큰 관리
        </Text>
        <CredentialFields
          draftId={draftId}
          draftSecret={draftSecret}
          setDraftId={setDraftId}
          setDraftSecret={setDraftSecret}
          titleColor={titleColor}
          bodyColor={bodyColor}
          onCopy={onCopy}
        />
        <Pressable
          onPress={() => void onSaveManage()}
          style={({ pressed }) => [
            styles.primaryBtn,
            styles.manualSaveBtn,
            pressed && styles.primaryBtnPressed,
          ]}>
          <Text style={[styles.primaryBtnLabel, { color: titleColor }]}>
            저장
          </Text>
        </Pressable>
      </>
    );
  }

  if (screen === 'issue') {
    return (
      <>
        <MenuBackRow onPress={() => void handleLeaveEditable('hub')} />
        <Text style={[styles.panelTitle, { color: titleColor }]}>
          API 토큰 발급
        </Text>
        <View style={styles.issueGuideBlock}>
          <Text style={[styles.issueGuideLine, { color: bodyColor }]}>
            Last.fm API 계정 페이지에서 API Key와 Shared Secret을 발급받으세요.
          </Text>
          <Text style={[styles.issueGuideLine, { color: bodyColor }]}>
            차트 조회에는 API Key만 사용합니다. Shared Secret은 확인·저장 시
            함께 검증합니다.
          </Text>
        </View>
        <Pressable
          onPress={() => void openDashboard()}
          accessibilityRole="link"
          accessibilityLabel="Last.fm API 계정 페이지 열기"
          style={({ pressed }) => [
            styles.dashboardLinkCard,
            { borderColor: 'rgba(0, 102, 204, 0.35)' },
            pressed && styles.dashboardLinkCardPressed,
            pressed && { backgroundColor: rowHover },
          ]}>
          <View style={styles.dashboardLinkGlyph}>
            <Ionicons
              name="open-outline"
              size={22}
              color={nrmTokens.color.primary}
            />
          </View>
          <View style={styles.dashboardLinkTexts}>
            <Text
              style={[
                styles.dashboardLinkLinePrimary,
                { color: titleColor },
              ]}>
              Last.fm API 계정
            </Text>
            <Text
              style={[
                styles.dashboardLinkLineAccent,
                { color: nrmTokens.color.primary },
              ]}>
              API Key · Shared Secret 발급 페이지 열기
            </Text>
          </View>
        </Pressable>
        <CredentialFields
          draftId={draftId}
          draftSecret={draftSecret}
          setDraftId={setDraftId}
          setDraftSecret={setDraftSecret}
          titleColor={titleColor}
          bodyColor={bodyColor}
          onCopy={onCopy}
        />
        <Pressable
          onPress={() => void onVerifyAndSave()}
          disabled={issuing}
          style={({ pressed }) => [
            styles.primaryBtn,
            styles.issueMainBtn,
            issuing && styles.primaryBtnDisabled,
            pressed && !issuing && styles.primaryBtnPressed,
          ]}>
          {issuing ? (
            <ActivityIndicator color={nrmTokens.color.primary} />
          ) : (
            <Text style={[styles.primaryBtnLabel, { color: titleColor }]}>
              API Key 확인·저장
            </Text>
          )}
        </Pressable>
      </>
    );
  }

  return (
    <>
      <MenuBackRow onPress={() => void handleLeaveEditable('appSettings')} />
      <Text style={[styles.panelTitle, { color: titleColor }]}>
        Last.fm API 토큰 관리
      </Text>

      <Pressable
        onPress={() => {
          captureEditableBaseline();
          setScreen('manage');
        }}
        style={({ pressed }) => [
          styles.hubRow,
          styles.hubRowFixed,
          pressed && styles.hubRowPressed,
        ]}>
        <Text
          style={[styles.hubRowTitleSm, { color: titleColor }]}
          numberOfLines={1}>
          API 토큰 관리
        </Text>
      </Pressable>

      <Pressable
        onPress={() => {
          captureEditableBaseline();
          setScreen('issue');
        }}
        style={({ pressed }) => [
          styles.hubRow,
          styles.hubRowFixed,
          pressed && styles.hubRowPressed,
        ]}>
        <Text
          style={[styles.hubRowTitleSm, { color: titleColor }]}
          numberOfLines={1}>
          API 토큰 발급
        </Text>
      </Pressable>
    </>
  );
}

const styles = StyleSheet.create({
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: nrmTokens.space.xxs,
    marginTop: nrmTokens.space.md,
    marginBottom: nrmTokens.space.md,
    alignSelf: 'flex-start',
  },
  backText: {
    fontSize: nrmTokens.font.body,
    color: nrmTokens.color.primary,
    fontWeight: '500',
  },
  panelTitle: {
    fontSize: nrmTokens.font.lead,
    fontWeight: '600',
    marginBottom: nrmTokens.space.md,
    letterSpacing: -0.4,
  },
  issueGuideBlock: {
    marginBottom: nrmTokens.space.md,
    gap: nrmTokens.space.sm,
  },
  issueGuideLine: {
    fontSize: nrmTokens.font.caption,
    fontWeight: '400',
    lineHeight: 18,
  },
  hubRow: {
    justifyContent: 'center',
    paddingHorizontal: nrmTokens.space.md,
    borderRadius: nrmTokens.radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(128,128,128,0.4)',
    marginBottom: nrmTokens.space.sm,
  },
  hubRowFixed: {
    height: HUB_ROW_H,
    overflow: 'hidden',
  },
  hubRowPressed: {
    opacity: 0.92,
  },
  hubRowTitleSm: {
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 18,
  },
  primaryBtn: {
    alignSelf: 'stretch',
    maxWidth: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: nrmTokens.radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(128,128,128,0.4)',
    marginBottom: nrmTokens.space.sm,
  },
  manualSaveBtn: {
    marginTop: nrmTokens.space.md,
  },
  issueMainBtn: {
    marginTop: nrmTokens.space.sm,
    backgroundColor: 'rgba(0, 102, 204, 0.06)',
    borderColor: 'rgba(0, 102, 204, 0.35)',
  },
  primaryBtnDisabled: {
    opacity: 0.55,
  },
  primaryBtnPressed: {
    opacity: 0.92,
  },
  primaryBtnLabel: {
    fontSize: nrmTokens.font.body,
    fontWeight: '600',
  },
  fieldLabel: {
    fontSize: nrmTokens.font.caption,
    marginBottom: nrmTokens.space.xxs,
    marginTop: nrmTokens.space.sm,
  },
  fieldLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: nrmTokens.space.sm,
    marginBottom: nrmTokens.space.xxs,
  },
  fieldLabelInRow: {
    marginTop: 0,
    marginBottom: 0,
    flex: 1,
  },
  copyIconBtn: {
    padding: nrmTokens.space.xxs,
    marginLeft: nrmTokens.space.xs,
  },
  copyIconBtnDisabled: {
    opacity: 0.45,
  },
  copyIconBtnPressed: {
    opacity: 0.75,
  },
  fieldShell: {
    alignSelf: 'stretch',
    maxWidth: '100%',
    borderRadius: nrmTokens.radius.sm,
    overflow: 'hidden',
  },
  fieldInner: {
    paddingHorizontal: nrmTokens.space.sm,
    paddingVertical: Platform.OS === 'ios' ? 12 : 10,
    fontSize: nrmTokens.font.body,
    ...Platform.select({
      android: { textAlignVertical: 'center' as const },
      web: {
        outlineStyle: 'none',
        outlineWidth: 0,
        borderWidth: 0,
        boxSizing: 'border-box' as const,
      },
    }),
  },
  fieldInnerSingle: {
    minHeight: nrmTokens.layout.touchMin,
    maxHeight: nrmTokens.layout.touchMin,
  },
  dashboardLinkCard: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: nrmTokens.space.sm,
    paddingVertical: nrmTokens.space.md,
    paddingHorizontal: nrmTokens.space.md,
    borderRadius: nrmTokens.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: nrmTokens.space.sm,
  },
  dashboardLinkCardPressed: {
    opacity: 0.95,
  },
  dashboardLinkGlyph: {
    width: 40,
    height: 40,
    borderRadius: nrmTokens.radius.sm,
    backgroundColor: 'rgba(0, 102, 204, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dashboardLinkTexts: {
    alignItems: 'center',
    gap: nrmTokens.space.xxs,
    maxWidth: '100%',
  },
  dashboardLinkLinePrimary: {
    fontSize: nrmTokens.font.body,
    fontWeight: '600',
    letterSpacing: -0.3,
    textAlign: 'center',
    lineHeight: 24,
  },
  dashboardLinkLineAccent: {
    fontSize: nrmTokens.font.body,
    fontWeight: '500',
    letterSpacing: -0.37,
    textAlign: 'center',
    lineHeight: 23,
  },
});
