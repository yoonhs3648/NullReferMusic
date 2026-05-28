import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { NrmDownloadQualitySlider } from '@/components/nrm/settings/NrmDownloadQualitySlider';
import { nrmTokens } from '@/constants/nrmTokens';
import {
  loadStoredSafGrant,
  requestNewSafDirUri,
  safUriToDisplayPath,
} from '@/lib/nrmDownloadSafGrant';
import {
  loadDownloadAudioExtension,
  loadDownloadAudioQuality,
  loadDownloadFileNameFormat,
  loadDownloadMetadataMode,
  loadWhisperModelPreference,
  NRM_AUDIO_EXTENSIONS,
  NRM_ENABLED_AUDIO_EXTENSIONS,
  NRM_DOWNLOAD_FILENAME_FORMATS,
  NRM_DOWNLOAD_METADATA_MODES,
  saveWhisperModelPreference,
  saveDownloadAudioExtension,
  saveDownloadAudioQuality,
  saveDownloadFileNameFormat,
  saveDownloadMetadataMode,
  type NrmAudioExtension,
  type NrmDownloadFileNameFormat,
  type NrmDownloadMetadataMode,
  type NrmWhisperModelPreference,
} from '@/lib/nrmDownloadSettings';
import { NrmWhisperModelPicker } from '@/components/nrm/settings/NrmWhisperModelPicker';
import { NRM_DOWNLOAD_PUBLIC_FOLDER_NAME } from '@/lib/nrmPersistDownload.native';
import {
  isStandaloneAndroid,
  isStandaloneIos,
  isYtDlpEncodeSettingsEffective,
} from '@/lib/nrmStandalonePlatform';
import { fetchWhisperModelStatuses } from '@/lib/nrmWhisperModelNative';
import type { NrmWhisperModelId } from '@/lib/nrmWhisperCatalog';

const PANEL_INPUT_BORDER = Platform.OS === 'web' ? StyleSheet.hairlineWidth : 1;

export type NrmDownloadSettingsSection =
  | 'path'
  | 'extension'
  | 'quality'
  | 'filename'
  | 'metadata'
  | 'lyricsEmbed';

const SECTION_TITLES: Record<NrmDownloadSettingsSection, string> = {
  path: '다운로드 경로 설정',
  extension: '확장자 설정',
  quality: '비트레이트 설정',
  filename: '파일명 설정',
  metadata: '메타데이터 설정',
  lyricsEmbed: '가사 임베드 설정',
};

type Props = {
  section: NrmDownloadSettingsSection;
  titleColor: string;
  bodyColor: string;
  onBack: () => void;
};

export function NrmDownloadSettingsPanel({
  section,
  titleColor,
  bodyColor,
  onBack,
}: Props) {
  const [dirUri, setDirUri] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [extension, setExtension] = useState<NrmAudioExtension>('.mp3');
  const [audioQuality, setAudioQuality] = useState(0);
  const [fileNameFormat, setFileNameFormat] =
    useState<NrmDownloadFileNameFormat>('artist-title');
  const [metadataMode, setMetadataMode] = useState<NrmDownloadMetadataMode>('manual');
  const [whisperModelPreference, setWhisperModelPreference] =
    useState<NrmWhisperModelPreference>('whisper:large-v3-turbo');

  useEffect(() => {
    if (section === 'path') {
      if (Platform.OS !== 'android') {
        setLoaded(true);
        return;
      }
      void loadStoredSafGrant()
        .then((uri) => {
          setDirUri(uri);
          setLoaded(true);
        })
        .catch(() => setLoaded(true));
      return;
    }
    if (section === 'extension') {
      void loadDownloadAudioExtension()
        .then((ext) => {
          setExtension(ext);
          setLoaded(true);
        })
        .catch(() => setLoaded(true));
      return;
    }
    if (section === 'filename') {
      void loadDownloadFileNameFormat()
        .then((format) => {
          setFileNameFormat(format);
          setLoaded(true);
        })
        .catch(() => setLoaded(true));
      return;
    }
    if (section === 'metadata') {
      void loadDownloadMetadataMode()
        .then((mode) => {
          setMetadataMode(mode);
          setLoaded(true);
        })
        .catch(() => setLoaded(true));
      return;
    }
    if (section === 'lyricsEmbed') {
      void (async () => {
        try {
          const preference = await loadWhisperModelPreference();
          const { isWhisperModelNativeAvailable } = await import('@/lib/nrmWhisperModelNative');
          const rows = isWhisperModelNativeAvailable()
            ? await fetchWhisperModelStatuses()
            : [];
          if (rows.length > 0) {
            const installed = rows
              .filter((r) => r.installed)
              .map((r) => r.modelId as NrmWhisperModelId);
            if (installed.length > 0 && !installed.includes(preference)) {
              setWhisperModelPreference(installed[0]);
              await saveWhisperModelPreference(installed[0]);
            } else {
              setWhisperModelPreference(preference);
            }
          } else {
            setWhisperModelPreference(preference);
          }
        } catch {
          /* ignore */
        } finally {
          setLoaded(true);
        }
      })();
      return;
    }
    void loadDownloadAudioQuality()
      .then((quality) => {
        setAudioQuality(quality);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [section]);

  const handlePickFolder = useCallback(async () => {
    setPicking(true);
    try {
      const uri = await requestNewSafDirUri('NullReferenceMusic');
      if (uri) setDirUri(uri);
    } finally {
      setPicking(false);
    }
  }, []);

  const selectExtension = useCallback((ext: NrmAudioExtension) => {
    setExtension(ext);
    void saveDownloadAudioExtension(ext);
  }, []);

  const changeQuality = useCallback((q: number) => {
    setAudioQuality(q);
    void saveDownloadAudioQuality(q);
  }, []);

  const selectFileNameFormat = useCallback((format: NrmDownloadFileNameFormat) => {
    setFileNameFormat(format);
    void saveDownloadFileNameFormat(format);
  }, []);

  const selectMetadataMode = useCallback((mode: NrmDownloadMetadataMode) => {
    setMetadataMode(mode);
    void saveDownloadMetadataMode(mode);
  }, []);

  const selectWhisperModelPreference = useCallback((preference: NrmWhisperModelPreference) => {
    setWhisperModelPreference(preference);
    void saveWhisperModelPreference(preference);
  }, []);

  const displayPath = dirUri ? safUriToDisplayPath(dirUri) : null;

  return (
    <>
      <Pressable
        onPress={onBack}
        style={styles.backRow}
        accessibilityRole="button"
        accessibilityLabel="뒤로">
        <Ionicons name="chevron-back" size={22} color={nrmTokens.color.primary} />
        <Text style={styles.backText}>뒤로</Text>
      </Pressable>

      <Text style={[styles.panelTitle, { color: titleColor }]}>
        {SECTION_TITLES[section]}
      </Text>

      {section === 'extension' ? (
        <View style={[styles.sectionCard, { borderColor: 'rgba(128,128,128,0.28)' }]}>
          {isStandaloneIos() ? (
            <Text style={[styles.platformNote, { color: bodyColor }]}>
              iOS IPA는 YouTube가 제공하는 오디오 포맷 중에서 선택한 확장자에 가장 가까운
              스트림을 우선 사용합니다. (yt-dlp 변환 없음)
            </Text>
          ) : null}
          {!loaded ? (
            <ActivityIndicator size="small" color={bodyColor} />
          ) : (
            <View style={styles.extRow}>
              {NRM_AUDIO_EXTENSIONS.map((ext) => {
                const active = extension === ext;
                const enabled = (NRM_ENABLED_AUDIO_EXTENSIONS as readonly string[]).includes(ext);
                return (
                  <Pressable
                    key={ext}
                    onPress={() => selectExtension(ext)}
                    disabled={!enabled}
                    style={({ pressed }) => [
                      styles.extChip,
                      {
                        borderColor: active
                          ? nrmTokens.color.primary
                          : 'rgba(128,128,128,0.35)',
                        backgroundColor: active
                          ? 'rgba(0,102,204,0.12)'
                          : 'transparent',
                        opacity: enabled ? 1 : 0.4,
                      },
                      pressed && enabled && styles.pressed,
                    ]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active, disabled: !enabled }}>
                    <Text
                      style={[
                        styles.extChipLabel,
                        {
                          color: active
                            ? nrmTokens.color.primary
                            : enabled
                              ? titleColor
                              : bodyColor,
                        },
                      ]}>
                      {ext}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>
      ) : null}

      {section === 'filename' ? (
        <View style={[styles.sectionCard, { borderColor: 'rgba(128,128,128,0.28)' }]}>
          {!loaded ? (
            <ActivityIndicator size="small" color={bodyColor} />
          ) : (
            <View style={styles.formatCol}>
              {NRM_DOWNLOAD_FILENAME_FORMATS.map((opt) => {
                const active = fileNameFormat === opt.id;
                return (
                  <Pressable
                    key={opt.id}
                    onPress={() => selectFileNameFormat(opt.id)}
                    style={({ pressed }) => [
                      styles.formatRow,
                      {
                        borderColor: active
                          ? nrmTokens.color.primary
                          : 'rgba(128,128,128,0.35)',
                        backgroundColor: active
                          ? 'rgba(0,102,204,0.12)'
                          : 'transparent',
                      },
                      pressed && styles.pressed,
                    ]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}>
                    <Text
                      style={[
                        styles.formatRowLabel,
                        { color: active ? nrmTokens.color.primary : titleColor },
                      ]}>
                      {opt.label}
                    </Text>
                    {active ? (
                      <Ionicons
                        name="checkmark-circle"
                        size={20}
                        color={nrmTokens.color.primary}
                      />
                    ) : (
                      <View style={styles.formatRowSpacer} />
                    )}
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>
      ) : null}

      {section === 'metadata' ? (
        <View style={[styles.sectionCard, { borderColor: 'rgba(128,128,128,0.28)' }]}>
          <Text style={[styles.platformNote, { color: bodyColor }]}>
            다운로드 시 트랙 정보(메타데이터)를 어떻게 처리할지 선택합니다.
          </Text>
          {!loaded ? (
            <ActivityIndicator size="small" color={bodyColor} />
          ) : (
            <View style={styles.formatCol}>
              {NRM_DOWNLOAD_METADATA_MODES.map((opt) => {
                const active = metadataMode === opt.id;
                return (
                  <Pressable
                    key={opt.id}
                    onPress={() => selectMetadataMode(opt.id)}
                    style={({ pressed }) => [
                      styles.formatRow,
                      {
                        borderColor: active
                          ? nrmTokens.color.primary
                          : 'rgba(128,128,128,0.35)',
                        backgroundColor: active
                          ? 'rgba(0,102,204,0.12)'
                          : 'transparent',
                      },
                      pressed && styles.pressed,
                    ]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}>
                    <Text
                      style={[
                        styles.formatRowLabel,
                        { color: active ? nrmTokens.color.primary : titleColor },
                      ]}>
                      {opt.label}
                    </Text>
                    {active ? (
                      <Ionicons
                        name="checkmark-circle"
                        size={20}
                        color={nrmTokens.color.primary}
                      />
                    ) : (
                      <View style={styles.formatRowSpacer} />
                    )}
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>
      ) : null}

      {section === 'lyricsEmbed' ? (
        <View style={[styles.sectionCard, { borderColor: 'rgba(128,128,128,0.28)' }]}>
          {!loaded ? (
            <ActivityIndicator size="small" color={bodyColor} />
          ) : (
            <NrmWhisperModelPicker
              value={whisperModelPreference}
              onChange={selectWhisperModelPreference}
              titleColor={titleColor}
              bodyColor={bodyColor}
              active
            />
          )}
        </View>
      ) : null}

      {section === 'quality' ? (
        <View style={[styles.sectionCard, { borderColor: 'rgba(128,128,128,0.28)' }]}>
          {isStandaloneIos() ? (
            <Text style={[styles.platformNote, { color: bodyColor }]}>
              비트레이트 설정은 Android APK(yt-dlp)에서만 적용됩니다. iOS는 YouTube 원본
              비트레이트로 저장됩니다.
            </Text>
          ) : null}
          {!isStandaloneIos() && !isYtDlpEncodeSettingsEffective() && Platform.OS === 'android' ? (
            <Text style={[styles.platformNote, { color: bodyColor }]}>
              비트레이트·확장자 변환은 릴리스 APK(yt-dlp)에서 적용됩니다.
            </Text>
          ) : null}
          <Text style={[styles.bitrateDesc, { color: bodyColor }]}>
            비트레이트(Bit rate)는 오디오 파일이 1초 동안 담는 데이터 양(kbps)입니다.{'\n'}
            비트레이트가 높을수록 음질이 좋지만 파일 용량은 커집니다.
          </Text>
          {!loaded ? (
            <ActivityIndicator size="small" color={bodyColor} />
          ) : (
            <NrmDownloadQualitySlider
              value={audioQuality}
              onChange={changeQuality}
              titleColor={titleColor}
            />
          )}
        </View>
      ) : null}

      {section === 'path' ? (
        Platform.OS === 'ios' ? (
          <View style={[styles.sectionCard, { borderColor: 'rgba(128,128,128,0.28)' }]}>
            <Text style={[styles.platformNote, { color: bodyColor }]}>
              iOS에서는 사용자가 고른 폴더(SAF) 대신 앱 전용 저장소에 파일을 둡니다.
            </Text>
            <Text style={[styles.pathHint, { color: bodyColor }]}>
              «파일» 앱 → «내 iPhone» → NullReferenceMusic → «{NRM_DOWNLOAD_PUBLIC_FOLDER_NAME}»
              폴더에서 확인할 수 있습니다. (설정에서 «파일» 공유가 켜져 있어야 합니다.)
            </Text>
          </View>
        ) : Platform.OS === 'android' ? (
          <View style={[styles.sectionCard, { borderColor: 'rgba(128,128,128,0.28)' }]}>
            <Pressable
              onPress={() => void handlePickFolder()}
              disabled={picking}
              style={({ pressed }) => [
                styles.pickBtn,
                { borderColor: 'rgba(0,102,204,0.35)', backgroundColor: 'rgba(0,102,204,0.06)' },
                picking && styles.pickBtnDisabled,
                pressed && !picking && styles.pressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="다운로드 폴더 선택">
              {picking ? (
                <ActivityIndicator size="small" color={nrmTokens.color.primary} />
              ) : (
                <>
                  <Ionicons name="folder-open-outline" size={18} color={nrmTokens.color.primary} />
                  <Text style={[styles.pickBtnLabel, { color: nrmTokens.color.primary }]}>
                    경로 설정
                  </Text>
                </>
              )}
            </Pressable>

            <View style={styles.pathRow}>
              {!loaded ? (
                <ActivityIndicator size="small" color={bodyColor} style={styles.pathLoader} />
              ) : displayPath ? (
                <>
                  <Ionicons
                    name="checkmark-circle-outline"
                    size={15}
                    color={nrmTokens.color.success ?? nrmTokens.color.primary}
                    style={styles.pathIcon}
                  />
                  <Text
                    style={[styles.pathText, { color: titleColor }]}
                    numberOfLines={2}
                    ellipsizeMode="middle">
                    {displayPath}
                  </Text>
                </>
              ) : (
                <>
                  <Ionicons
                    name="alert-circle-outline"
                    size={15}
                    color="rgba(128,128,128,0.7)"
                    style={styles.pathIcon}
                  />
                  <Text style={[styles.pathTextEmpty, { color: bodyColor }]}>
                    선택된 경로 없음{'\n'}
                    <Text style={styles.pathHint}>
                      경로 설정을 눌러 다운로드 폴더를 선택하세요
                    </Text>
                  </Text>
                </>
              )}
            </View>
          </View>
        ) : (
          <Text style={[styles.pathWebNote, { color: bodyColor }]}>
            다운로드 경로는 Android 앱에서 폴더를 선택해 설정합니다.
          </Text>
        )
      ) : null}
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
  sectionCard: {
    borderWidth: PANEL_INPUT_BORDER,
    borderRadius: nrmTokens.radius.md,
    paddingHorizontal: nrmTokens.space.md,
    paddingTop: nrmTokens.space.md,
    paddingBottom: nrmTokens.space.sm,
    gap: nrmTokens.space.sm,
    marginBottom: nrmTokens.space.md,
  },
  extRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: nrmTokens.space.xs,
  },
  extChip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: nrmTokens.radius.pill,
    borderWidth: PANEL_INPUT_BORDER,
    minHeight: 36,
    justifyContent: 'center',
  },
  extChipLabel: {
    fontSize: nrmTokens.font.caption,
    fontWeight: '600',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  pickBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: nrmTokens.space.xs,
    paddingVertical: 11,
    borderRadius: nrmTokens.radius.pill,
    borderWidth: PANEL_INPUT_BORDER,
    minHeight: nrmTokens.layout?.touchMin ?? 44,
  },
  pickBtnDisabled: {
    opacity: 0.55,
  },
  pressed: {
    opacity: 0.85,
  },
  pickBtnLabel: {
    fontSize: nrmTokens.font.body,
    fontWeight: '600',
  },
  pathRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: nrmTokens.space.xs,
    paddingHorizontal: nrmTokens.space.xs,
    paddingBottom: nrmTokens.space.xxs,
  },
  pathLoader: {
    marginVertical: nrmTokens.space.xxs,
  },
  pathIcon: {
    marginTop: 2,
  },
  pathText: {
    flex: 1,
    fontSize: nrmTokens.font.body,
    fontWeight: '500',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    letterSpacing: 0.2,
  },
  pathTextEmpty: {
    flex: 1,
    fontSize: nrmTokens.font.caption,
    lineHeight: 18,
  },
  pathHint: {
    fontWeight: '400',
    opacity: 0.7,
  },
  pathWebNote: {
    fontSize: nrmTokens.font.caption,
    lineHeight: 20,
    opacity: 0.85,
  },
  platformNote: {
    fontSize: nrmTokens.font.caption,
    lineHeight: 20,
    opacity: 0.88,
  },
  bitrateDesc: {
    fontSize: nrmTokens.font.caption,
    lineHeight: 20,
    opacity: 0.9,
    marginBottom: nrmTokens.space.xs,
  },
  formatCol: {
    gap: nrmTokens.space.xs,
  },
  formatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: nrmTokens.space.md,
    borderRadius: nrmTokens.radius.md,
    borderWidth: PANEL_INPUT_BORDER,
    minHeight: nrmTokens.layout?.touchMin ?? 44,
  },
  formatRowLabel: {
    fontSize: nrmTokens.font.body,
    fontWeight: '600',
  },
  formatRowSpacer: {
    width: 20,
  },
  whisperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: nrmTokens.space.md,
    borderRadius: nrmTokens.radius.md,
    borderWidth: PANEL_INPUT_BORDER,
    minHeight: nrmTokens.layout?.touchMin ?? 44,
    gap: nrmTokens.space.sm,
  },
  whisperTextCol: {
    flex: 1,
    gap: 4,
  },
  whisperTitle: {
    fontSize: nrmTokens.font.body,
    fontWeight: '600',
  },
  whisperSubtitle: {
    fontSize: nrmTokens.font.caption,
    opacity: 0.88,
    lineHeight: 18,
  },
  whisperRateRow: {
    flexDirection: 'row',
    gap: nrmTokens.space.xs,
    marginTop: 2,
  },
  whisperRateChip: {
    fontSize: nrmTokens.font.caption,
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: nrmTokens.radius.pill,
    backgroundColor: 'rgba(128,128,128,0.14)',
    overflow: 'hidden',
  },
});
