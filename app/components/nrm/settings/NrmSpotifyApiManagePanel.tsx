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
import { issueSpotifyAccessToken } from '@/lib/nrmSpotifyApiClient';
import { NrmSpotifyChartsLoginModal } from '@/components/nrm/settings/NrmSpotifyChartsLoginModal';
import {
  clearAllSpotifyChartsSessionData,
  getSpotifyChartsAccount,
  saveSpotifyChartsSession,
  saveSpotifyChartsSessionFromForm,
} from '@/lib/nrmSpotifyChartsSession';
import { NRM_CHARTS_SPOTIFY_URL, isSpotifyChartsWebViewLoginVisible } from '@/lib/nrmSpotifyChartsPlatform';
import {
  clearManualSpotifyAccessToken,
  getManualSpotifyAccessToken,
  getSpotifyAccessTokenCache,
  clearSpotifyAccessTokenCache,
  getSpotifyCredentials,
  persistClientCredentialsToken,
  persistManualSpotifyAccessTokenOnly,
  saveSpotifyCredentials,
  type NrmSpotifyCredentials,
} from '@/lib/nrmSpotifyApiSettings';
import { confirmUser, notifyUser } from '@/lib/nrmUserNotify';

type ScreenId = 'hub' | 'manage' | 'issue' | 'chartsSession';

type DraftSnapshot = {
  clientId: string;
  clientSecret: string;
  accessToken: string;
};

type ChartsDraftSnapshot = {
  bearerToken: string;
};

const HUB_ROW_H = 52;
const PANEL_INPUT_BORDER = Platform.OS === 'web' ? StyleSheet.hairlineWidth : 1;
const FIELD_BORDER_COLOR = 'rgba(128,128,128,0.4)';

type Props = {
  titleColor: string;
  bodyColor: string;
  rowHover: string;
  focusChartsSession?: boolean;
  onChartsSessionFocusConsumed?: () => void;
  onBack: () => void;
  onCloseDrawer?: () => void;
  registerBackHandler?: (handler: (() => boolean) | null) => void;
  registerDrawerDismiss?: (handler: (() => void) | null) => void;
};

const SPOTIFY_DASHBOARD_URL = 'https://developer.spotify.com/dashboard';

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
  draftAccessToken,
  setDraftId,
  setDraftSecret,
  setDraftAccessToken,
  titleColor,
  bodyColor,
  onCopy,
}: {
  draftId: string;
  draftSecret: string;
  draftAccessToken: string;
  setDraftId: (v: string) => void;
  setDraftSecret: (v: string) => void;
  setDraftAccessToken: (v: string) => void;
  titleColor: string;
  bodyColor: string;
  onCopy: (label: string, raw: string) => void;
}) {
  const id = draftId.trim();
  const secret = draftSecret.trim();
  const token = draftAccessToken.trim();

  return (
    <>
      <FieldLabelRow
        label="Client ID"
        bodyColor={bodyColor}
        hasValue={id.length > 0}
        onCopy={id ? () => void onCopy('Client ID', id) : undefined}
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
        label="Client Secret"
        bodyColor={bodyColor}
        hasValue={secret.length > 0}
        onCopy={secret ? () => void onCopy('Client Secret', secret) : undefined}
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
      <FieldLabelRow
        label="공식 API 액세스 토큰"
        bodyColor={bodyColor}
        hasValue={token.length > 0}
        onCopy={token ? () => void onCopy('액세스 토큰', token) : undefined}
      />
      <View style={[styles.fieldShell, fieldShellStyle()]}>
        <TextInput
          value={draftAccessToken}
          onChangeText={setDraftAccessToken}
          autoCapitalize="none"
          autoCorrect={false}
          style={[styles.fieldInner, styles.fieldInnerSingle, { color: titleColor }]}
        />
      </View>
    </>
  );
}

export function NrmSpotifyApiManagePanel({
  titleColor,
  bodyColor,
  rowHover,
  focusChartsSession = false,
  onChartsSessionFocusConsumed,
  onBack,
  onCloseDrawer,
  registerBackHandler,
  registerDrawerDismiss,
}: Props) {
  const [screen, setScreen] = useState<ScreenId>('hub');
  const [tokenExpiresAt, setTokenExpiresAt] = useState<number | null>(null);
  const [draftId, setDraftId] = useState('');
  const [draftSecret, setDraftSecret] = useState('');
  const [draftAccessToken, setDraftAccessToken] = useState('');
  const [chartsBearerToken, setChartsBearerToken] = useState('');
  const [chartsSessionActive, setChartsSessionActive] = useState(false);
  const [chartsLoginModalOpen, setChartsLoginModalOpen] = useState(false);
  const webViewLoginVisible = isSpotifyChartsWebViewLoginVisible();
  const [issuing, setIssuing] = useState(false);
  const savedSnapshotRef = useRef<DraftSnapshot | null>(null);
  const chartsSavedRef = useRef<ChartsDraftSnapshot | null>(null);

  const reload = useCallback(async () => {
    const c = await getSpotifyCredentials();
    const id = c?.clientId ?? '';
    const secret = c?.clientSecret ?? '';

    const manual = await getManualSpotifyAccessToken();
    const cache = await getSpotifyAccessTokenCache();
    const cacheValid =
      cache && cache.expiresAt > Date.now() ? cache.accessToken : null;
    const token = manual ?? cacheValid ?? '';
    setDraftId(id);
    setDraftSecret(secret);
    setDraftAccessToken(token);
    setTokenExpiresAt(
      manual
        ? null
        : cache && cache.expiresAt > Date.now()
          ? cache.expiresAt
          : null,
    );
    savedSnapshotRef.current = {
      clientId: id.trim(),
      clientSecret: secret.trim(),
      accessToken: token.trim(),
    };
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const reloadChartsSession = useCallback(async () => {
    const account = await getSpotifyChartsAccount();
    setChartsBearerToken(account?.bearerToken ?? '');
    setChartsSessionActive(!!account);
    chartsSavedRef.current = {
      bearerToken: account?.bearerToken ?? '',
    };
  }, []);

  useEffect(() => {
    void reloadChartsSession();
  }, [reloadChartsSession]);

  useEffect(() => {
    if (!focusChartsSession) return;
    void reloadChartsSession().then(() => {
      setScreen('chartsSession');
      onChartsSessionFocusConsumed?.();
    });
  }, [focusChartsSession, onChartsSessionFocusConsumed, reloadChartsSession]);

  const captureEditableBaseline = useCallback(() => {
    savedSnapshotRef.current = {
      clientId: draftId.trim(),
      clientSecret: draftSecret.trim(),
      accessToken: draftAccessToken.trim(),
    };
  }, [draftAccessToken, draftId, draftSecret]);

  const captureChartsBaseline = useCallback(() => {
    chartsSavedRef.current = {
      bearerToken: chartsBearerToken.trim(),
    };
  }, [chartsBearerToken]);

  const isApiDraftDirty = useCallback(() => {
    const saved = savedSnapshotRef.current;
    if (!saved) return false;
    return (
      draftId.trim() !== saved.clientId ||
      draftSecret.trim() !== saved.clientSecret ||
      draftAccessToken.trim() !== saved.accessToken
    );
  }, [draftId, draftSecret, draftAccessToken]);

  const isChartsDraftDirty = useCallback(() => {
    const current = chartsBearerToken.trim();
    const saved = chartsSavedRef.current;
    if (!saved) return current.length > 0;
    return current !== saved.bearerToken;
  }, [chartsBearerToken]);

  const isDraftDirty = useCallback(() => {
    if (screen === 'chartsSession') return isChartsDraftDirty();
    if (screen === 'manage' || screen === 'issue') return isApiDraftDirty();
    return isApiDraftDirty() || isChartsDraftDirty();
  }, [isApiDraftDirty, isChartsDraftDirty, screen]);

  const restoreDraftSnapshot = useCallback(() => {
    if (screen === 'chartsSession' || isChartsDraftDirty()) {
      const charts = chartsSavedRef.current;
      if (charts) {
        setChartsBearerToken(charts.bearerToken);
      }
    }
    if (screen !== 'chartsSession') {
      const saved = savedSnapshotRef.current;
      if (!saved) return;
      setDraftId(saved.clientId);
      setDraftSecret(saved.clientSecret);
      setDraftAccessToken(saved.accessToken);
    }
  }, [isChartsDraftDirty, screen]);

  const persistChartsSession = useCallback(async () => {
    const token = chartsBearerToken.trim();
    if (!token) {
      await clearAllSpotifyChartsSessionData();
      setChartsSessionActive(false);
    } else {
      await saveSpotifyChartsSessionFromForm(token);
      setChartsSessionActive(true);
    }
    await reloadChartsSession();
    captureChartsBaseline();
  }, [captureChartsBaseline, chartsBearerToken, reloadChartsSession]);

  const onChartsSessionCaptured = useCallback(
    async (payload: { bearerToken?: string }) => {
      const token = (payload.bearerToken ?? '').trim();
      if (!token) {
        void notifyUser('Bearer 토큰을 가져오지 못했습니다. charts.spotify.com에서 차트가 보이는지 확인해 주세요.');
        return;
      }
      await saveSpotifyChartsSession({ bearerToken: token });
      setChartsBearerToken(token);
      setChartsSessionActive(true);
      chartsSavedRef.current = { bearerToken: token };
      void notifyUser('Bearer 토큰을 저장했습니다.');
    },
    [],
  );

  const openChartsWebViewLogin = useCallback(() => {
    setChartsLoginModalOpen(true);
  }, []);

  const openChartsSite = useCallback(async () => {
    await WebBrowser.openBrowserAsync(NRM_CHARTS_SPOTIFY_URL);
  }, []);

  const persistAllDrafts = useCallback(async () => {
    const id = draftId.trim();
    const secret = draftSecret.trim();
    const token = draftAccessToken.trim();

    await saveSpotifyCredentials({ clientId: id, clientSecret: secret });
    if (token) {
      await persistManualSpotifyAccessTokenOnly(token);
    } else {
      await clearManualSpotifyAccessToken();
      await clearSpotifyAccessTokenCache();
      setTokenExpiresAt(null);
    }
    await reload();
  }, [draftAccessToken, draftId, draftSecret, reload]);

  const handleLeaveEditable = useCallback(
    async (target: 'hub' | 'closeDrawer' | 'appSettings') => {
      if (isDraftDirty()) {
        const save = await confirmUser('변경된 값을 저장할까요?');
        if (save) {
          if (screen === 'chartsSession' || isChartsDraftDirty()) {
            await persistChartsSession();
          }
          if (screen !== 'chartsSession' && isApiDraftDirty()) {
            await persistAllDrafts();
          }
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
      isApiDraftDirty,
      isChartsDraftDirty,
      isDraftDirty,
      onBack,
      onCloseDrawer,
      persistAllDrafts,
      persistChartsSession,
      restoreDraftSnapshot,
      screen,
    ],
  );

  const handleDrawerDismiss = useCallback(() => {
    if (
      screen === 'manage' ||
      screen === 'issue' ||
      screen === 'chartsSession' ||
      isDraftDirty()
    ) {
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
      if (screen === 'manage' || screen === 'issue' || screen === 'chartsSession') {
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
      if (screen === 'manage' || screen === 'issue' || screen === 'chartsSession') {
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

  const onFetchAccessToken = async () => {
    if (!draftId.trim() || !draftSecret.trim()) {
      void notifyUser('Client ID와 Client Secret을 모두 입력하세요.');
      return;
    }
    const body: NrmSpotifyCredentials = {
      clientId: draftId.trim(),
      clientSecret: draftSecret.trim(),
    };
    setIssuing(true);
    const out = await issueSpotifyAccessToken(body);
    setIssuing(false);
    if (!out.ok) {
      void notifyUser(out.message);
      return;
    }
    await saveSpotifyCredentials(body);
    await persistClientCredentialsToken(out.accessToken, out.expiresIn);
    const expiresAt = Date.now() + out.expiresIn * 1000;
    setDraftAccessToken(out.accessToken);
    setTokenExpiresAt(expiresAt);
    savedSnapshotRef.current = {
      clientId: body.clientId,
      clientSecret: body.clientSecret,
      accessToken: out.accessToken,
    };
    void notifyUser('액세스 토큰을 발급·저장했습니다.');
    await reload();
  };

  const openDashboard = async () => {
    await WebBrowser.openBrowserAsync(SPOTIFY_DASHBOARD_URL);
  };

  const tokenExpiryLabel =
    tokenExpiresAt != null
      ? new Date(tokenExpiresAt).toLocaleString('ko-KR')
      : null;

  if (screen === 'chartsSession') {
    return (
      <>
        <MenuBackRow onPress={() => void handleLeaveEditable('hub')} />
        <Text style={[styles.panelTitle, { color: titleColor }]}>
          Charts 세션
        </Text>
        <Text style={[styles.chartsSessionDesc, { color: bodyColor }]}>
          https://charts.spotify.com 에 로그인 후 Bearer 토큰을 가져옵니다.
          Network 탭에서 charts-spotify-com-service 요청의 Authorization
          헤더 값(Bearer 제거)을 사용합니다.
        </Text>
        {webViewLoginVisible ? (
          <Pressable
            onPress={() => openChartsWebViewLogin()}
            style={({ pressed }) => [
              styles.primaryBtn,
              pressed && styles.primaryBtnPressed,
            ]}>
            <Text style={[styles.primaryBtnLabel, { color: titleColor }]}>
              charts.spotify.com WebView 로그인
            </Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={() => void openChartsSite()}
            style={({ pressed }) => [
              styles.primaryBtn,
              pressed && styles.primaryBtnPressed,
            ]}>
            <Text style={[styles.primaryBtnLabel, { color: titleColor }]}>
              charts.spotify.com 바로가기
            </Text>
          </Pressable>
        )}
        <NrmSpotifyChartsLoginModal
          visible={chartsLoginModalOpen}
          titleColor={titleColor}
          bodyColor={bodyColor}
          onClose={() => setChartsLoginModalOpen(false)}
          onSessionCaptured={(payload) => void onChartsSessionCaptured(payload)}
        />
        <FieldLabelRow
          label="Bearer 토큰"
          bodyColor={bodyColor}
          hasValue={chartsBearerToken.trim().length > 0}
          onCopy={
            chartsBearerToken.trim()
              ? () => void onCopy('Bearer 토큰', chartsBearerToken.trim())
              : undefined
          }
        />
        <View style={[styles.fieldShell, fieldShellStyle()]}>
          <TextInput
            value={chartsBearerToken}
            onChangeText={setChartsBearerToken}
            autoCapitalize="none"
            autoCorrect={false}
            style={[styles.fieldInner, styles.fieldInnerSingle, { color: titleColor }]}
          />
        </View>
        <Pressable
          onPress={() =>
            void persistChartsSession().then(() => notifyUser('저장했습니다.'))
          }
          style={({ pressed }) => [
            styles.primaryBtn,
            styles.manualSaveBtn,
            pressed && styles.primaryBtnPressed,
          ]}>
          <Text style={[styles.primaryBtnLabel, { color: titleColor }]}>저장</Text>
        </Pressable>
      </>
    );
  }

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
          draftAccessToken={draftAccessToken}
          setDraftId={setDraftId}
          setDraftSecret={setDraftSecret}
          setDraftAccessToken={setDraftAccessToken}
          titleColor={titleColor}
          bodyColor={bodyColor}
          onCopy={onCopy}
        />
        {tokenExpiryLabel ? (
          <Text style={[styles.expiryLabel, { color: bodyColor }]}>
            자동 발급 토큰 만료: {tokenExpiryLabel}
          </Text>
        ) : null}
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
            모바일에서 Spotify 로그인 후 Create app 버튼이 보이지 않을 경우,
            브라우저에서 데스크톱 사이트로 변경한 뒤 다시 시도하세요.
          </Text>
          <Text style={[styles.issueGuideLine, { color: bodyColor }]}>
            앱 등록 시 Redirect URI는 필수 항목입니다. 이 앱에서는 실제로
            사용하지 않으므로 https://example.com/callback 처럼 형식만 맞는
            값을 넣으면 됩니다.
          </Text>
          <Text style={[styles.issueGuideLine, { color: bodyColor }]}>
            Charts 차트는 Charts 세션의 Spotify 계정만 사용합니다. 이 화면의
            토큰은 공식 Web API 전용입니다.
          </Text>
        </View>
        <Pressable
          onPress={() => void openDashboard()}
          accessibilityRole="link"
          accessibilityLabel="Spotify 개발자 대시보드 열기"
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
              Spotify 개발자 대시보드
            </Text>
            <Text
              style={[
                styles.dashboardLinkLineAccent,
                { color: nrmTokens.color.primary },
              ]}>
              Client ID · Secret 발급 페이지 열기
            </Text>
          </View>
        </Pressable>
        <CredentialFields
          draftId={draftId}
          draftSecret={draftSecret}
          draftAccessToken={draftAccessToken}
          setDraftId={setDraftId}
          setDraftSecret={setDraftSecret}
          setDraftAccessToken={setDraftAccessToken}
          titleColor={titleColor}
          bodyColor={bodyColor}
          onCopy={onCopy}
        />
        {tokenExpiryLabel ? (
          <Text style={[styles.expiryLabel, { color: bodyColor }]}>
            저장된 토큰 만료: {tokenExpiryLabel}
          </Text>
        ) : null}
        <Pressable
          onPress={() => void onFetchAccessToken()}
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
              액세스 토큰 받기
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
        Spotify API 토큰 관리
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

      <Pressable
        onPress={() => {
          captureChartsBaseline();
          setScreen('chartsSession');
        }}
        style={({ pressed }) => [
          styles.hubRow,
          styles.hubRowFixed,
          pressed && styles.hubRowPressed,
        ]}>
        <Text
          style={[styles.hubRowTitleSm, { color: titleColor }]}
          numberOfLines={1}>
          Charts 세션
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
  chartsSessionDesc: {
    fontSize: nrmTokens.font.caption,
    fontWeight: '400',
    lineHeight: 18,
    marginBottom: nrmTokens.space.md,
  },
  chartsSessionStatus: {
    marginTop: nrmTokens.space.sm,
    marginBottom: nrmTokens.space.sm,
    fontSize: nrmTokens.font.caption,
    fontWeight: '500',
    lineHeight: 18,
  },
  chartsSessionWebOnly: {
    fontSize: nrmTokens.font.caption,
    fontWeight: '400',
    lineHeight: 18,
    marginBottom: nrmTokens.space.md,
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
  expiryLabel: {
    marginTop: nrmTokens.space.xxs,
    marginBottom: nrmTokens.space.sm,
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
  fieldInnerBearer: {
    minHeight: 72,
    maxHeight: 120,
    textAlignVertical: 'top',
  },
  secondaryBtn: {
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    borderRadius: nrmTokens.radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(128,128,128,0.4)',
    marginTop: nrmTokens.space.xs,
  },
  secondaryBtnPressed: {
    opacity: 0.9,
  },
  secondaryBtnLabel: {
    fontSize: nrmTokens.font.caption,
    fontWeight: '500',
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
