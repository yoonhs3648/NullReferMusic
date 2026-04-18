import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

import { nrmTokens } from '@/constants/nrmTokens';
import {
  clearApiBaseUrlOverride,
  fetchHealth,
  getDefaultApiBaseUrl,
  getResolvedApiBaseUrl,
  normalizeApiBaseUrl,
  requestDownload,
  setApiBaseUrlOverride,
} from '@/lib/downloadClient';
import {
  downloadOnDevice,
  isOnDeviceDownloadAvailable,
} from '@/lib/onDeviceDownload';

type Props = {
  isDark: boolean;
};

export function NrmUrlDownloader({ isDark }: Props) {
  const onDeviceCapable = isOnDeviceDownloadAvailable();
  const [usePcServer, setUsePcServer] = useState(
    () =>
      Platform.OS === 'web' ||
      Platform.OS === 'ios' ||
      !onDeviceCapable,
  );

  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [fullPlaylist, setFullPlaylist] = useState(false);

  const [resolvedBase, setResolvedBase] = useState(getDefaultApiBaseUrl);
  const [serverDraft, setServerDraft] = useState('');
  const [serverBusy, setServerBusy] = useState(false);
  const [serverHint, setServerHint] = useState<string | null>(null);

  useEffect(() => {
    getResolvedApiBaseUrl().then((b) => {
      setResolvedBase(b);
      setServerDraft(b);
    });
  }, []);

  const inputColors = {
    backgroundColor: isDark ? nrmTokens.color.surface : '#ffffff',
    color: isDark ? nrmTokens.color.text : '#111118',
    borderColor: isDark ? nrmTokens.color.border : '#e2e2ee',
  };

  const onSaveServer = useCallback(async () => {
    setServerHint(null);
    const n = normalizeApiBaseUrl(serverDraft);
    if (!n) {
      setServerHint('주소를 입력하거나, 기본값으로 초기화하세요.');
      return;
    }
    setServerBusy(true);
    try {
      await setApiBaseUrlOverride(n);
      const next = await getResolvedApiBaseUrl();
      setResolvedBase(next);
      setServerHint('저장했습니다. 연결 테스트를 눌러 확인하세요.');
    } finally {
      setServerBusy(false);
    }
  }, [serverDraft]);

  const onTestServer = useCallback(async () => {
    setServerHint(null);
    setServerBusy(true);
    try {
      const h = await fetchHealth();
      if (h.ok && h.ytDlp && h.ffmpeg) {
        setServerHint('연결 OK · yt-dlp·ffmpeg 인식됨');
      } else if (h.ok) {
        setServerHint('서버는 응답했으나 yt-dlp/ffmpeg 경로를 확인하세요.');
      } else {
        setServerHint(h.error ?? '연결 실패');
      }
    } catch (e) {
      setServerHint(e instanceof Error ? e.message : '연결 실패');
    } finally {
      setServerBusy(false);
    }
  }, []);

  const onResetServer = useCallback(async () => {
    setServerHint(null);
    setServerBusy(true);
    try {
      await clearApiBaseUrlOverride();
      const d = getDefaultApiBaseUrl();
      setResolvedBase(await getResolvedApiBaseUrl());
      setServerDraft(d);
      setServerHint('빌드 기본 주소로 초기화했습니다.');
    } finally {
      setServerBusy(false);
    }
  }, []);

  const onSubmit = useCallback(async () => {
    setError(null);
    setSuccess(null);
    const trimmed = url.trim();
    if (!trimmed) {
      setError('YouTube URL을 입력해 주세요.');
      return;
    }
    setLoading(true);
    try {
      const useDevice =
        Platform.OS === 'android' && onDeviceCapable && !usePcServer;
      if (useDevice) {
        const res = await downloadOnDevice(trimmed, !fullPlaylist);
        setSuccess(
          `${res.message ?? '완료되었습니다.'}\n저장 경로: ${res.path}`,
        );
      } else {
        const res = await requestDownload(trimmed, {
          noPlaylist: !fullPlaylist,
        });
        setSuccess(
          res.message
            ? `${res.message}\n저장 위치: ${res.outputDir ?? ''}`
            : '완료되었습니다.',
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '알 수 없는 오류');
    } finally {
      setLoading(false);
    }
  }, [url, fullPlaylist, usePcServer, onDeviceCapable]);

  const showServerPanel = Platform.OS !== 'web' && usePcServer;

  return (
    <View
      style={[styles.block, isDark ? styles.blockDark : styles.blockLight]}
      accessibilityLabel="YouTube URL 다운로드">
      {Platform.OS === 'android' && onDeviceCapable ? (
        <View style={styles.modeSection}>
          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text
                style={[
                  styles.switchTitle,
                  { color: isDark ? nrmTokens.color.text : '#111118' },
                ]}>
                같은 Wi‑Fi의 PC 서버로 받기
              </Text>
              <Text
                style={[
                  styles.switchHint,
                  { color: isDark ? nrmTokens.color.textMuted : '#6b6b7a' },
                ]}>
                끄면 이 기기만으로 yt-dlp(내장)·FFmpeg(최초 다운로드)로 저장합니다.
              </Text>
            </View>
            <Switch
              value={usePcServer}
              onValueChange={setUsePcServer}
              disabled={loading}
              trackColor={{
                false: isDark ? '#3b3b4d' : '#d1d5db',
                true: nrmTokens.color.accentDim,
              }}
              thumbColor={usePcServer ? nrmTokens.color.accent : '#f4f4f5'}
            />
          </View>
          {!usePcServer ? (
            <Text
              style={[
                styles.sectionDesc,
                { color: isDark ? nrmTokens.color.textMuted : '#6b6b7a' },
              ]}>
              Expo Go에는 네이티브 모듈이 없습니다. `npx expo run:android` 또는
              릴리스 APK로 설치하세요. 첫 저장 시 FFmpeg 바이너리를 BtbN 빌드에서
              받습니다(Wi‑Fi 권장).
            </Text>
          ) : null}
        </View>
      ) : null}

      {showServerPanel ? (
        <View style={styles.serverSection}>
          <Text
            style={[
              styles.sectionTitle,
              { color: isDark ? nrmTokens.color.text : '#111118' },
            ]}>
            다운로드 서버 (같은 Wi‑Fi의 PC)
          </Text>
          <Text
            style={[
              styles.sectionDesc,
              { color: isDark ? nrmTokens.color.textMuted : '#6b6b7a' },
            ]}>
            PC에서 server를 실행하면 콘솔에{' '}
            <Text style={styles.monoHint}>http://192.168.x.x:8787</Text> 형태가
            출력됩니다. AWS 등 외부 배포 없이 망 내부만 사용합니다.
          </Text>
          <TextInput
            value={serverDraft}
            onChangeText={setServerDraft}
            placeholder="예: http://192.168.0.12:8787"
            placeholderTextColor={isDark ? '#6b7288' : '#9ca3af'}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            editable={!serverBusy}
            style={[styles.input, inputColors, styles.serverInput]}
          />
          <View style={styles.serverActions}>
            <Pressable
              onPress={onSaveServer}
              disabled={serverBusy}
              style={({ pressed }) => [
                styles.secondaryBtn,
                pressed && styles.secondaryBtnPressed,
              ]}>
              <Text style={styles.secondaryBtnLabel}>저장</Text>
            </Pressable>
            <Pressable
              onPress={onTestServer}
              disabled={serverBusy}
              style={({ pressed }) => [
                styles.secondaryBtn,
                pressed && styles.secondaryBtnPressed,
              ]}>
              <Text style={styles.secondaryBtnLabel}>연결 테스트</Text>
            </Pressable>
            <Pressable
              onPress={onResetServer}
              disabled={serverBusy}
              style={({ pressed }) => [
                styles.secondaryBtn,
                pressed && styles.secondaryBtnPressed,
              ]}>
              <Text style={styles.secondaryBtnLabel}>기본값</Text>
            </Pressable>
          </View>
          {serverHint ? (
            <Text style={styles.serverHintText}>{serverHint}</Text>
          ) : null}
          <Text
            style={[
              styles.miniHint,
              { color: isDark ? nrmTokens.color.textMuted : '#6b6b7a' },
            ]}>
            현재 사용: {resolvedBase}
            {'\n'}
            USB만 쓸 때: PC에서{' '}
            <Text style={styles.monoHint}>adb reverse tcp:8787 tcp:8787</Text> 후{' '}
            <Text style={styles.monoHint}>http://127.0.0.1:8787</Text> 도 가능.
          </Text>
        </View>
      ) : null}

      <Text
        style={[styles.label, { color: isDark ? nrmTokens.color.textMuted : '#5b5b6b' }]}>
        YouTube URL
      </Text>
      <TextInput
        testID="nrm_downloader__input"
        value={url}
        onChangeText={setUrl}
        placeholder="https://www.youtube.com/watch?v=…"
        placeholderTextColor={isDark ? '#6b7288' : '#9ca3af'}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        editable={!loading}
        style={[styles.input, inputColors]}
      />

      <View style={styles.row}>
        <View style={styles.rowText}>
          <Text style={[styles.switchTitle, { color: isDark ? nrmTokens.color.text : '#111118' }]}>
            Mix·재생목록 전체 받기
          </Text>
          <Text
            style={[
              styles.switchHint,
              { color: isDark ? nrmTokens.color.textMuted : '#6b6b7a' },
            ]}>
            끄면 한 영상만 저장합니다 (권장)
          </Text>
        </View>
        <Switch
          testID="nrm_downloader__playlist_switch"
          value={fullPlaylist}
          onValueChange={setFullPlaylist}
          disabled={loading}
          trackColor={{
            false: isDark ? '#3b3b4d' : '#d1d5db',
            true: nrmTokens.color.accentDim,
          }}
          thumbColor={fullPlaylist ? nrmTokens.color.accent : '#f4f4f5'}
        />
      </View>

      <Pressable
        testID="nrm_downloader__button--primary"
        onPress={onSubmit}
        disabled={loading}
        style={({ pressed }) => [
          styles.button,
          loading && styles.buttonDisabled,
          pressed && !loading && styles.buttonPressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel="음원 추출 시작">
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonLabel}>음원 추출 · MP3</Text>
        )}
      </Pressable>

      {error ? (
        <Text style={styles.error} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
      {success ? (
        <Text style={styles.success} accessibilityLiveRegion="polite">
          {success}
        </Text>
      ) : null}

      {Platform.OS === 'web' ? (
        <Text
          style={[
            styles.hint,
            { color: isDark ? nrmTokens.color.textMuted : '#6b6b7a' },
          ]}>
          서버: {resolvedBase}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    width: '100%',
    maxWidth: nrmTokens.layout.maxContentWidth,
    padding: nrmTokens.space.lg,
    borderRadius: nrmTokens.radius.lg,
    borderWidth: 1,
  },
  blockDark: {
    backgroundColor: nrmTokens.color.surface,
    borderColor: nrmTokens.color.border,
  },
  blockLight: {
    backgroundColor: '#ffffff',
    borderColor: '#e8e8f0',
    ...Platform.select({
      web: {
        boxShadow: '0 24px 60px rgba(15, 15, 35, 0.12)',
      },
      default: {
        elevation: 6,
        shadowColor: '#0f0f23',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.25,
        shadowRadius: 24,
      },
    }),
  },
  modeSection: {
    marginBottom: nrmTokens.space.lg,
    paddingBottom: nrmTokens.space.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(128,128,160,0.25)',
  },
  serverSection: {
    marginBottom: nrmTokens.space.lg,
    paddingBottom: nrmTokens.space.lg,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(128,128,160,0.25)',
  },
  sectionTitle: {
    fontSize: nrmTokens.font.body,
    fontWeight: '700',
    marginBottom: nrmTokens.space.xs,
  },
  sectionDesc: {
    fontSize: nrmTokens.font.small,
    lineHeight: 20,
    marginBottom: nrmTokens.space.md,
  },
  monoHint: {
    fontFamily: Platform.select({
      ios: 'Menlo',
      android: 'monospace',
      default: 'monospace',
    }),
    fontSize: 12,
  },
  serverInput: {
    marginBottom: nrmTokens.space.sm,
  },
  serverActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: nrmTokens.space.sm,
    marginBottom: nrmTokens.space.sm,
  },
  secondaryBtn: {
    paddingVertical: 10,
    paddingHorizontal: nrmTokens.space.md,
    borderRadius: nrmTokens.radius.sm,
    backgroundColor: 'rgba(139,124,255,0.2)',
    minHeight: 40,
    justifyContent: 'center',
  },
  secondaryBtnPressed: {
    opacity: 0.85,
  },
  secondaryBtnLabel: {
    color: nrmTokens.color.accent,
    fontWeight: '700',
    fontSize: nrmTokens.font.small,
  },
  serverHintText: {
    fontSize: nrmTokens.font.small,
    color: nrmTokens.color.accent2,
    marginBottom: nrmTokens.space.sm,
    lineHeight: 20,
  },
  miniHint: {
    fontSize: 11,
    lineHeight: 17,
  },
  label: {
    fontSize: nrmTokens.font.small,
    fontWeight: '600',
    marginBottom: nrmTokens.space.xs,
  },
  input: {
    minHeight: nrmTokens.layout.touchMin,
    borderWidth: 1,
    borderRadius: nrmTokens.radius.md,
    paddingHorizontal: nrmTokens.space.md,
    fontSize: nrmTokens.font.body,
    marginBottom: nrmTokens.space.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: nrmTokens.space.md,
    marginBottom: nrmTokens.space.lg,
  },
  rowText: {
    flex: 1,
  },
  switchTitle: {
    fontSize: nrmTokens.font.body,
    fontWeight: '600',
  },
  switchHint: {
    fontSize: nrmTokens.font.small,
    marginTop: 4,
    lineHeight: 18,
  },
  button: {
    minHeight: nrmTokens.layout.touchMin,
    borderRadius: nrmTokens.radius.md,
    backgroundColor: nrmTokens.color.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: nrmTokens.space.lg,
  },
  buttonPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.99 }],
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  buttonLabel: {
    color: '#fff',
    fontSize: nrmTokens.font.body,
    fontWeight: '700',
  },
  error: {
    marginTop: nrmTokens.space.md,
    color: nrmTokens.color.danger,
    fontSize: nrmTokens.font.small,
    lineHeight: 20,
  },
  success: {
    marginTop: nrmTokens.space.md,
    color: nrmTokens.color.success,
    fontSize: nrmTokens.font.small,
    lineHeight: 20,
  },
  hint: {
    marginTop: nrmTokens.space.lg,
    fontSize: 12,
    lineHeight: 18,
  },
});
