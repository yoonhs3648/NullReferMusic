import Ionicons from '@expo/vector-icons/Ionicons';
import * as WebBrowser from 'expo-web-browser';
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

import { nrmTokens } from '@/constants/nrmTokens';
import { copyToClipboard } from '@/lib/nrmCopyText';
import { issueSpotifyAccessToken } from '@/lib/nrmSpotifyApiClient';
import {
  getManualSpotifyAccessToken,
  getSpotifyAccessTokenCache,
  getSpotifyCredentials,
  hasSpotifyChartAccess,
  maskSecret,
  saveManualSpotifyAccessToken,
  saveSpotifyAccessTokenCache,
  saveSpotifyCredentials,
  type NrmSpotifyCredentials,
} from '@/lib/nrmSpotifyApiSettings';
import { notifyUser } from '@/lib/nrmUserNotify';

type ScreenId = 'hub' | 'view' | 'manual' | 'issue';

const HUB_ROW_H = 52;
const PANEL_INPUT_BORDER = Platform.OS === 'web' ? StyleSheet.hairlineWidth : 1;
const FIELD_BORDER_COLOR = 'rgba(128,128,128,0.4)';

type Props = {
  titleColor: string;
  bodyColor: string;
  rowHover: string;
  onBack: () => void;
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

export function NrmSpotifyApiManagePanel({
  titleColor,
  bodyColor,
  rowHover,
  onBack,
}: Props) {
  const [screen, setScreen] = useState<ScreenId>('hub');
  const [chartAccess, setChartAccess] = useState(false);
  const [manualToken, setManualToken] = useState<string | null>(null);
  const [creds, setCreds] = useState<NrmSpotifyCredentials | null>(null);
  const [accessTokenCached, setAccessTokenCached] = useState<string | null>(
    null,
  );
  const [tokenExpiresAt, setTokenExpiresAt] = useState<number | null>(null);
  const [manualDraft, setManualDraft] = useState('');
  const [draftId, setDraftId] = useState('');
  const [draftSecret, setDraftSecret] = useState('');
  const [issuing, setIssuing] = useState(false);

  const reload = useCallback(async () => {
    const access = await hasSpotifyChartAccess();
    setChartAccess(access);
    setManualToken(await getManualSpotifyAccessToken());
    const c = await getSpotifyCredentials();
    setCreds(c);
    const cache = await getSpotifyAccessTokenCache();
    if (cache && cache.expiresAt > Date.now()) {
      setAccessTokenCached(cache.accessToken);
      setTokenExpiresAt(cache.expiresAt);
    } else {
      setAccessTokenCached(null);
      setTokenExpiresAt(null);
    }
    if (c) {
      setDraftId(c.clientId);
      setDraftSecret(c.clientSecret);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    void getManualSpotifyAccessToken().then((t) => {
      if (t) setManualDraft(t);
    });
  }, []);

  const onCopy = async (label: string, value: string) => {
    const ok = await copyToClipboard(value);
    void notifyUser(
      ok ? `${label}을(를) 복사했습니다.` : `${label} 복사에 실패했습니다.`,
    );
  };

  const onSaveManualToken = async () => {
    if (!manualDraft.trim()) {
      void notifyUser('액세스 토큰을 입력하세요.');
      return;
    }
    await saveManualSpotifyAccessToken(manualDraft);
    void notifyUser('액세스 토큰을 저장했습니다.');
    await reload();
    setScreen('hub');
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
    const expiresAt = Date.now() + out.expiresIn * 1000;
    await saveSpotifyAccessTokenCache({
      accessToken: out.accessToken,
      expiresAt,
    });
    void notifyUser('액세스 토큰을 저장했습니다.');
    await reload();
  };

  const openDashboard = async () => {
    await WebBrowser.openBrowserAsync(SPOTIFY_DASHBOARD_URL);
  };

  const tokenExpiryLabel =
    tokenExpiresAt != null
      ? new Date(tokenExpiresAt).toLocaleString('ko-KR')
      : null;

  if (screen === 'view') {
    return (
      <>
        <MenuBackRow onPress={() => setScreen('hub')} />
        <Text style={[styles.panelTitle, { color: titleColor }]}>
          API 토큰 조회
        </Text>

        {manualToken ? (
          <>
            <Text style={[styles.subHead, { color: titleColor }]}>
              직접 등록한 액세스 토큰
            </Text>
            <Text
              style={[styles.valueLine, { color: titleColor }]}
              selectable>
              {maskSecret(manualToken)}
            </Text>
            <Pressable
              onPress={() => void onCopy('액세스 토큰', manualToken)}
              style={styles.copyBtn}>
              <Text style={styles.copyBtnLabel}>복사</Text>
            </Pressable>
          </>
        ) : null}

        {creds ? (
          <>
            <Text style={[styles.subHead, { color: titleColor }]}>
              Client ID / Secret (자동 발급용 저장)
            </Text>
            <Text style={[styles.fieldLabel, { color: bodyColor }]}>
              Client ID
            </Text>
            <Text
              style={[styles.valueLine, { color: titleColor }]}
              selectable>
              {creds.clientId}
            </Text>
            <Pressable
              onPress={() => void onCopy('Client ID', creds.clientId)}
              style={styles.copyBtn}>
              <Text style={styles.copyBtnLabel}>Client ID 복사</Text>
            </Pressable>
            <Text style={[styles.fieldLabel, { color: bodyColor }]}>
              Client Secret
            </Text>
            <Text
              style={[styles.valueLine, { color: titleColor }]}
              selectable>
              {maskSecret(creds.clientSecret)}
            </Text>
            <Pressable
              onPress={() =>
                void onCopy('Client Secret', creds.clientSecret)
              }
              style={styles.copyBtn}>
              <Text style={styles.copyBtnLabel}>Client Secret 복사</Text>
            </Pressable>
          </>
        ) : null}

        {accessTokenCached ? (
          <>
            <Text style={[styles.subHead, { color: titleColor }]}>
              자동 발급 액세스 토큰 (캐시)
            </Text>
            <Text
              style={[styles.valueLine, { color: titleColor }]}
              selectable>
              {maskSecret(accessTokenCached)}
            </Text>
            {tokenExpiryLabel ? (
              <Text style={[styles.expiryLabel, { color: bodyColor }]}>
                만료: {tokenExpiryLabel}
              </Text>
            ) : null}
            <Pressable
              onPress={() =>
                void onCopy('액세스 토큰', accessTokenCached)
              }
              style={styles.copyBtn}>
              <Text style={styles.copyBtnLabel}>복사</Text>
            </Pressable>
          </>
        ) : null}

      </>
    );
  }

  if (screen === 'manual') {
    return (
      <>
        <MenuBackRow onPress={() => setScreen('hub')} />
        <Text style={[styles.panelTitle, { color: titleColor }]}>
          API 토큰 수동 등록
        </Text>
        <View
          style={[
            styles.fieldShell,
            { borderColor: FIELD_BORDER_COLOR, borderWidth: PANEL_INPUT_BORDER },
          ]}>
          <TextInput
            value={manualDraft}
            onChangeText={setManualDraft}
            autoCapitalize="none"
            autoCorrect={false}
            multiline={false}
            placeholder="액세스 토큰을 입력하세요"
            placeholderTextColor={bodyColor}
            style={[styles.fieldInner, styles.fieldInnerSingle, { color: titleColor }]}
          />
        </View>
        <Pressable
          onPress={() => void onSaveManualToken()}
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
        <MenuBackRow onPress={() => setScreen('hub')} />
        <Text style={[styles.panelTitle, { color: titleColor }]}>
          API 토큰 발급
        </Text>
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
        <Text style={[styles.fieldLabel, { color: bodyColor }]}>Client ID</Text>
        <View
          style={[
            styles.fieldShell,
            { borderColor: FIELD_BORDER_COLOR, borderWidth: PANEL_INPUT_BORDER },
          ]}>
          <TextInput
            value={draftId}
            onChangeText={setDraftId}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="Client ID"
            placeholderTextColor={bodyColor}
            style={[styles.fieldInner, { color: titleColor }]}
          />
        </View>
        <Text style={[styles.fieldLabel, { color: bodyColor }]}>
          Client Secret
        </Text>
        <View
          style={[
            styles.fieldShell,
            { borderColor: FIELD_BORDER_COLOR, borderWidth: PANEL_INPUT_BORDER },
          ]}>
          <TextInput
            value={draftSecret}
            onChangeText={setDraftSecret}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            placeholder="Client Secret"
            placeholderTextColor={bodyColor}
            style={[styles.fieldInner, { color: titleColor }]}
          />
        </View>
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
      <MenuBackRow onPress={onBack} />
      <Text style={[styles.panelTitle, { color: titleColor }]}>
        Spotify API 토큰 관리
      </Text>

      {chartAccess ? (
        <Pressable
          onPress={() => setScreen('view')}
          style={({ pressed }) => [
            styles.hubRow,
            styles.hubRowFixed,
            pressed && styles.hubRowPressed,
          ]}>
          <Text
            style={[styles.hubRowTitleSm, { color: titleColor }]}
            numberOfLines={1}>
            API 토큰 조회
          </Text>
        </Pressable>
      ) : (
        <Pressable
          disabled
          style={[styles.hubRow, styles.hubRowFixed, styles.hubRowMuted]}
          accessibilityState={{ disabled: true }}>
          <Text
            style={[styles.hubRowTitleSm, { color: bodyColor }]}
            numberOfLines={1}>
            API 토큰 조회
          </Text>
        </Pressable>
      )}

      <Pressable
        onPress={() => setScreen('manual')}
        style={({ pressed }) => [
          styles.hubRow,
          styles.hubRowFixed,
          pressed && styles.hubRowPressed,
        ]}>
        <Text
          style={[styles.hubRowTitleSm, { color: titleColor }]}
          numberOfLines={1}>
          API 토큰 수동 등록
        </Text>
      </Pressable>

      <Pressable
        onPress={() => setScreen('issue')}
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
  subHead: {
    fontSize: nrmTokens.font.caption,
    fontWeight: '600',
    marginTop: nrmTokens.space.md,
    marginBottom: nrmTokens.space.xs,
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
  hubRowMuted: {
    opacity: 0.45,
    borderColor: 'rgba(128,128,128,0.22)',
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
  valueLine: {
    fontSize: nrmTokens.font.caption,
    lineHeight: 20,
    marginBottom: nrmTokens.space.xs,
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
  copyBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 6,
    marginBottom: nrmTokens.space.xs,
  },
  copyBtnLabel: {
    fontSize: nrmTokens.font.caption,
    color: nrmTokens.color.primary,
    fontWeight: '600',
  },
});
