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
import { logNrmRunError } from '@/lib/nrmDevLog';
import { parseYoutubeVideoId } from '@/lib/nrmYoutubeIds';
import { buildAudioFileName } from '@/lib/nrmYoutubeDownloadMeta';

type Props = {
  isDark: boolean;
};

export function NrmUrlDownloader({ isDark }: Props) {
  const isWeb = Platform.OS === 'web';
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [serverDraft, setServerDraft] = useState('');
  const [serverBusy, setServerBusy] = useState(false);
  const [fullPlaylist, setFullPlaylist] = useState(false);

  useEffect(() => {
    if (isWeb) {
      getResolvedApiBaseUrl().then(setServerDraft);
    }
  }, [isWeb]);

  const inputColors = {
    backgroundColor: isDark ? nrmTokens.color.surfaceTile2 : nrmTokens.color.canvas,
    color: isDark ? nrmTokens.color.bodyOnDark : nrmTokens.color.ink,
    borderColor: isDark ? nrmTokens.color.borderOnDark : 'rgba(0, 0, 0, 0.08)',
  };

  const onSaveServer = useCallback(async () => {
    const n = normalizeApiBaseUrl(serverDraft);
    if (!n) return;
    setServerBusy(true);
    try {
      await setApiBaseUrlOverride(n);
      setServerDraft(await getResolvedApiBaseUrl());
    } finally {
      setServerBusy(false);
    }
  }, [serverDraft]);

  const onTestServer = useCallback(async () => {
    setServerBusy(true);
    try {
      await fetchHealth();
    } finally {
      setServerBusy(false);
    }
  }, []);

  const onResetServer = useCallback(async () => {
    setServerBusy(true);
    try {
      await clearApiBaseUrlOverride();
      const d = getDefaultApiBaseUrl();
      setServerDraft((await getResolvedApiBaseUrl()) || d);
    } finally {
      setServerBusy(false);
    }
  }, []);

  const onSubmit = useCallback(async () => {
    setError(null);
    setSuccess(null);
    const trimmed = url.trim();
    if (!trimmed) return;
    setLoading(true);
    try {
      if (!isWeb) {
        const { getInnertube, downloadYoutubeAudioOnDevice } = await import(
          '@/lib/nrmInnertubeYoutube'
        );
        const videoId = parseYoutubeVideoId(trimmed);
        if (!videoId) {
          throw new Error(
            'YouTube 영상 주소(watch?v=·youtu.be·Shorts) 또는 11자 동영상 ID를 입력해 주세요.',
          );
        }
        const yt = await getInnertube();
        const info = await yt.getBasicInfo(videoId);
        const title = info.basic_info.title?.trim() || 'Unknown';
        const author = info.basic_info.author?.trim() || 'Unknown';
        const { loadDownloadAudioExtension, loadDownloadFileNameFormat } =
          await import('@/lib/nrmDownloadSettings');
        const [ext, fileNameFormat] = await Promise.all([
          loadDownloadAudioExtension(),
          loadDownloadFileNameFormat(),
        ]);
        const fileName = buildAudioFileName(author, title, ext, fileNameFormat);
        const { savedLabel } = await downloadYoutubeAudioOnDevice(
          videoId,
          fileName,
        );
        setSuccess(savedLabel);
        return;
      }

      const { loadDownloadEncodeSettings, extensionToYtDlpFormat } =
        await import('@/lib/nrmDownloadSettings');
      const encode = await loadDownloadEncodeSettings();
      const res = await requestDownload(trimmed, {
        noPlaylist: !fullPlaylist,
        audioFormat: extensionToYtDlpFormat(encode.extension),
        audioQuality: encode.audioQuality,
      });
      const line = (res.outputDir || res.message || '').trim();
      if (line) setSuccess(line);
    } catch (e) {
      logNrmRunError('urlDownloader.submit', e, { url: trimmed.slice(0, 200) });
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setLoading(false);
    }
  }, [isWeb, url, fullPlaylist]);

  return (
    <View style={[styles.block, isDark ? styles.blockDark : styles.blockLight]}>
      {isWeb ? (
        <View style={styles.serverSection}>
          <TextInput
            value={serverDraft}
            onChangeText={setServerDraft}
            placeholder="http://"
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
              <Text style={styles.secondaryBtnLabel}>테스트</Text>
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
        </View>
      ) : null}

      <TextInput
        testID="nrm_downloader__input"
        value={url}
        onChangeText={setUrl}
        placeholder="https://"
        placeholderTextColor={isDark ? '#6b7288' : '#9ca3af'}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        editable={!loading}
        style={[styles.input, inputColors]}
      />

      {isWeb ? (
        <View style={styles.row}>
          <View style={styles.rowText}>
            <Text
              style={[
                styles.switchTitle,
                { color: isDark ? nrmTokens.color.bodyOnDark : nrmTokens.color.ink },
              ]}>
              재생목록
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
      ) : null}

      <Pressable
        testID="nrm_downloader__button--primary"
        onPress={onSubmit}
        disabled={loading}
        style={({ pressed }) => [
          styles.button,
          loading && styles.buttonDisabled,
          pressed && !loading && styles.buttonPressed,
        ]}
        accessibilityRole="button">
        {loading ? (
          <ActivityIndicator color={nrmTokens.color.onPrimary} />
        ) : (
          <Text style={styles.buttonLabel}>
            {isWeb ? 'MP3 (서버)' : '오디오 저장'}
          </Text>
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
    backgroundColor: nrmTokens.color.surfaceTile1,
    borderColor: nrmTokens.color.borderOnDark,
  },
  blockLight: {
    backgroundColor: nrmTokens.color.canvas,
    borderColor: nrmTokens.color.hairline,
  },
  serverSection: {
    marginBottom: nrmTokens.space.lg,
    paddingBottom: nrmTokens.space.lg,
    borderBottomWidth: 1,
    borderBottomColor: nrmTokens.color.accent2Soft,
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
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: nrmTokens.radius.md,
    backgroundColor: nrmTokens.color.surfacePearl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: nrmTokens.color.dividerSoft,
    minHeight: 40,
    justifyContent: 'center',
  },
  secondaryBtnPressed: {
    transform: [{ scale: 0.95 }],
    opacity: 0.96,
  },
  secondaryBtnLabel: {
    color: nrmTokens.color.inkMuted80,
    fontWeight: '400',
    fontSize: nrmTokens.font.caption,
    letterSpacing: -0.22,
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
  input: {
    minHeight: nrmTokens.layout.touchMin,
    borderWidth: 1,
    borderRadius: nrmTokens.radius.pill,
    paddingHorizontal: 20,
    fontSize: nrmTokens.font.body,
    fontWeight: '400',
    letterSpacing: -0.37,
    marginBottom: nrmTokens.space.md,
  },
  button: {
    minHeight: nrmTokens.layout.touchMin,
    borderRadius: nrmTokens.radius.pill,
    backgroundColor: nrmTokens.color.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    paddingHorizontal: 22,
  },
  buttonPressed: {
    transform: [{ scale: 0.95 }],
    opacity: 0.98,
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  buttonLabel: {
    color: nrmTokens.color.onPrimary,
    fontSize: nrmTokens.font.body,
    fontWeight: '400',
    letterSpacing: -0.37,
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
});
