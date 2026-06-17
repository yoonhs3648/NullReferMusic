import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';

import { nrmTokens } from '@/constants/nrmTokens';
import {
  loadDownloadAudioExtension,
  loadDownloadFileNameFormat,
  type NrmDownloadFileNameFormat,
} from '@/lib/nrmDownloadSettings';
import { parseEmbeddedLyricsModeToken } from '@/lib/nrmEmbeddedLyricsMode';
import type { NrmAudioFileMetadata } from '@/lib/nrmDownloadAudioMetadata';
import { loadNrmGenreTagCatalog } from '@/lib/nrmGenreTagSettings';
import { resolveGenreDropdownSelection } from '@/lib/nrmGenreResolve';
import {
  buildAudioFileName,
  guessInitialDownloadFields,
} from '@/lib/nrmYoutubeDownloadMeta';
import type { YoutubeSearchItem } from '@/lib/youtubeSearchClient';
import {
  buildLyricsSentinel,
  extractMelonSongIdFromUrl,
  isMelonLyricsUiMode,
  isMelonPlainLyricsText,
  normalizeMelonTrackWebsite,
  parseLyricsUiMode,
  resolveMelonPlainLyricsForEdit,
  type NrmLyricsUiMode,
} from '@/lib/nrmMelonLyrics';
import { isWhisperModelInstalled } from '@/lib/nrmWhisperModelNative';
import { isAlignModelInstalled } from '@/lib/nrmAlignModelNative';
import { isNrmWav2Vec2BundleId } from '@/lib/nrmAlignModelCatalog';
import type { MelonAlignLyricsLanguage } from '@/lib/nrmAlignLyricsLang';
import { loadAlignModelPreference } from '@/lib/nrmDownloadSettings';
import { loadWhisperModelPreference } from '@/lib/nrmDownloadSettings';
import { usesPcBackendInDev } from '@/lib/nrmDevRuntime';
import { isStandaloneAndroid } from '@/lib/nrmStandalonePlatform';
import {
  NrmUserNotifyOverlay,
} from '@/components/nrm/NrmUserNotifyOverlay';
import {
  defaultDownloadLyricsMode,
  loadLyricsModeOrder,
  NRM_LYRICS_MODE_LABELS,
  type NrmLyricsModeOrderId,
} from '@/lib/nrmLyricsOrderSettings';
import { isWhisperLyricsFamily } from '@/lib/nrmLrcUiMode';
import type { ConfirmPayload } from '@/lib/nrmUserNotify';

export type NrmMetadataEditModalProps = {
  visible: boolean;
  item: YoutubeSearchItem | null;
  isDark: boolean;
  metadataSource?: 'chart' | 'main' | 'lastfm' | 'spotify' | 'melon';
  initialArtist?: string;
  initialTitle?: string;
  /**
   * artist/title은 사용자가 편집하므로 여기에는 artist/title 외의 필드만 넘깁니다.
   * coverUrl은 웹 dataURL 또는 APK file:// / content:// uri 모두 허용합니다.
   */
  initialMetadataFields?: Omit<NrmAudioFileMetadata, 'artist' | 'title'>;
  /** trackEdit: LRC·내장 가사 플래그로 복원한 저장 모드 */
  initialStoredLyricsMode?: NrmLyricsUiMode;
  /** trackEdit: TXXX·nrm_plain_lyrics 등 파일에 내장된 멜론 plain 원문 존재 */
  initialHasEmbeddedPlainLyrics?: boolean;
  /** 초기 필드 로딩 중 (다운로드: API 선조회 / 트랙 편집: 파일에서 읽기) */
  busy?: boolean;
  /** download: 다운로드 / trackEdit: 저장된 트랙 편집 */
  purpose?: 'download' | 'trackEdit';
  /** trackEdit: 현재 파일 stem — 이름 충돌 검사 제외 */
  excludeFileStem?: string;
  /** trackEdit: 트랙 확장자 고정 (.mp3 등) */
  fixedExtension?: string;
  /** trackEdit: 삭제 확인에 표시할 실제 파일명 */
  deleteFileName?: string;
  /** trackEdit: 확인 후 물리 파일 삭제 */
  onDelete?: () => void | Promise<void>;
  onClose: () => void;
  onConfirm: (videoId: string, fileName: string, metadata: NrmAudioFileMetadata) => void;
};

const GENRE_MANUAL_VALUE = '__manual__';

function isPlatformDownloadSource(
  source: NrmMetadataEditModalProps['metadataSource'],
): boolean {
  return (
    source === 'melon' ||
    source === 'lastfm' ||
    source === 'spotify' ||
    source === 'chart'
  );
}

const WEB_SCROLL_CLASS = 'nrm-scroll-web';

function webScrollClassName(isDark: boolean): string | undefined {
  if (Platform.OS !== 'web') return undefined;
  return `${WEB_SCROLL_CLASS} ${isDark ? 'nrm-scroll-web--dark' : 'nrm-scroll-web--light'}`;
}

function webScrollInlineStyle(isDark: boolean): object | undefined {
  if (Platform.OS !== 'web') return undefined;
  return {
    scrollbarWidth: 'thin',
    scrollbarColor: isDark
      ? 'rgba(255, 255, 255, 0.28) transparent'
      : 'rgba(0, 0, 0, 0.2) transparent',
  } as const;
}

function normalizeString(s: string | undefined | null): string {
  return (s ?? '').trim();
}

function resolveGenreSelection(
  genreValue: string,
  catalog: import('@/lib/nrmGenreTagSettings').NrmGenreTagCatalog,
): { selection: string; custom: string } {
  const trimmed = genreValue.trim();
  if (!trimmed) {
    return { selection: GENRE_MANUAL_VALUE, custom: '' };
  }
  const resolved = resolveGenreDropdownSelection(catalog, { rawGenre: trimmed });
  if (resolved.selection) {
    return { selection: resolved.selection, custom: '' };
  }
  return { selection: GENRE_MANUAL_VALUE, custom: resolved.custom };
}

type InlineSelectProps = {
  label: string;
  value: string;
  options: { value: string; label: string; disabled?: boolean; hint?: string }[];
  onChange: (value: string) => void;
  isDark: boolean;
  titleColor: string;
  bodyColor: string;
  disabled?: boolean;
  hideSheetTitle?: boolean;
  scrollClassName?: string;
  scrollStyle?: object;
};

function MetadataInlineSelect({
  label,
  value,
  options,
  onChange,
  isDark,
  titleColor,
  bodyColor,
  disabled = false,
  hideSheetTitle = false,
  scrollClassName,
  scrollStyle,
}: InlineSelectProps) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);
  const border = isDark ? nrmTokens.color.borderOnDark : nrmTokens.color.hairline;
  const bg = isDark ? nrmTokens.color.surfaceTile2 : nrmTokens.color.canvas;

  const close = useCallback(() => setOpen(false), []);
  const pick = useCallback(
    (v: string, disabled?: boolean) => {
      if (disabled) return;
      onChange(v);
      close();
    },
    [close, onChange],
  );

  return (
    <View style={styles.inlineFieldRow}>
      <Text style={[styles.inlineFieldLabel, { color: bodyColor }]}>{label}</Text>
      <Pressable
        onPress={() => !disabled && setOpen(true)}
        disabled={disabled}
        style={({ pressed }) => [
          styles.selectTrigger,
          { borderColor: border, backgroundColor: bg, opacity: disabled ? 0.5 : 1 },
          pressed && !disabled && styles.pressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel={`${label} ${selected?.label ?? value}`}>
        <Text style={[styles.selectTriggerText, { color: titleColor }]} numberOfLines={1}>
          {selected?.label ?? value}
        </Text>
        <Ionicons name="chevron-down" size={16} color={bodyColor} />
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
        <Pressable style={styles.selectScrim} onPress={close}>
          <View
            style={[
              styles.selectSheet,
              {
                backgroundColor: isDark
                  ? nrmTokens.color.surfaceTile1
                  : nrmTokens.color.canvas,
                borderColor: border,
              },
            ]}>
            {hideSheetTitle ? null : (
              <Text style={[styles.selectSheetTitle, { color: titleColor }]}>{label}</Text>
            )}
            <ScrollView
              style={[styles.selectSheetScroll, scrollStyle]}
              contentContainerStyle={styles.selectSheetScrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              {...(Platform.OS === 'web' && scrollClassName
                ? { className: scrollClassName }
                : {})}>
              {options.map((o) => {
                const active = o.value === value;
                const disabledOpt = !!o.disabled;
                return (
                  <Pressable
                    key={o.value}
                    onPress={() => pick(o.value, disabledOpt)}
                    disabled={disabledOpt}
                    style={({ pressed }) => [
                      styles.selectOptionRow,
                      {
                        borderBottomColor: isDark
                          ? 'rgba(255,255,255,0.08)'
                          : 'rgba(0,0,0,0.08)',
                      },
                      active && styles.selectOptionRowActive,
                      pressed && !disabledOpt && styles.pressed,
                      disabledOpt && { opacity: 0.5 },
                    ]}>
                    <View style={styles.selectOptionTextCol}>
                      <Text
                        style={[
                          styles.selectOptionText,
                          { color: active ? nrmTokens.color.primary : titleColor },
                          active && { fontWeight: '600' },
                        ]}>
                        {o.label}
                      </Text>
                      {o.hint ? (
                        <Text style={[styles.selectOptionHint, { color: bodyColor }]}>
                          ({o.hint})
                        </Text>
                      ) : null}
                    </View>
                    {active ? (
                      <Ionicons name="checkmark" size={20} color={nrmTokens.color.primary} />
                    ) : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

type InlineTextFieldProps = {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  bodyColor: string;
  inputColors: { backgroundColor: string; color: string; borderColor: string };
  editable?: boolean;
};

function InlineTextField({
  label,
  value,
  onChangeText,
  placeholder,
  bodyColor,
  inputColors,
  editable = true,
}: InlineTextFieldProps) {
  return (
    <View style={styles.inlineFieldRow}>
      <Text style={[styles.inlineFieldLabel, { color: bodyColor }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={placeholder ? '#6b7288' : undefined}
        style={[styles.inlineInput, inputColors]}
        editable={editable}
      />
    </View>
  );
}

export function NrmMetadataEditModal({
  visible,
  item,
  isDark,
  metadataSource = 'main',
  initialArtist,
  initialTitle,
  initialMetadataFields,
  initialStoredLyricsMode,
  initialHasEmbeddedPlainLyrics = false,
  busy = false,
  purpose = 'download',
  excludeFileStem,
  fixedExtension,
  deleteFileName,
  onDelete,
  onClose,
  onConfirm,
}: NrmMetadataEditModalProps) {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const cardMaxWidth = Math.min(windowWidth - nrmTokens.space.lg * 2, 560);
  const cardMaxHeight = Math.min(windowHeight * 0.88, 680);

  const [artist, setArtist] = useState('');
  const [title, setTitle] = useState('');

  const [album, setAlbum] = useState('');
  const [genreSelection, setGenreSelection] = useState(GENRE_MANUAL_VALUE);
  const [genreCustom, setGenreCustom] = useState('');
  const [genreCategoryNames, setGenreCategoryNames] = useState<string[]>([]);
  const [releaseDate, setReleaseDate] = useState('');
  const [trackNumber, setTrackNumber] = useState('');
  const [discNumber, setDiscNumber] = useState('');
  const [composer, setComposer] = useState('');
  const [lyricsMode, setLyricsMode] = useState<NrmLyricsUiMode>('unset');
  const [lyricsModeOrder, setLyricsModeOrder] = useState<readonly NrmLyricsModeOrderId[]>([
    'unset',
    'configured',
    'translation',
    'melon',
    'melon_translation',
  ]);
  const [melonPlainLyrics, setMelonPlainLyrics] = useState('');
  const [storedLyricsMode, setStoredLyricsMode] = useState<NrmLyricsUiMode>('unset');
  const [whisperXAlignMissing, setWhisperXAlignMissing] = useState(false);
  const [translationOptionEnabled, setTranslationOptionEnabled] = useState(true);
  const [bpm, setBpm] = useState('');
  const [copyright, setCopyright] = useState('');
  const [website, setWebsite] = useState('');
  const [producer, setProducer] = useState('');
  const [remixer, setRemixer] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [moreExpanded, setMoreExpanded] = useState(false);
  const [platformGenreRaw, setPlatformGenreRaw] = useState('');
  const [whisperModelMissing, setWhisperModelMissing] = useState(false);
  const [whisperGateLoading, setWhisperGateLoading] = useState(false);

  const [extension, setExtension] = useState('.mp3');
  const [fileNameFormat, setFileNameFormat] =
    useState<NrmDownloadFileNameFormat>('artist-title');
  const [nameConflict, setNameConflict] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const titleColor = isDark ? nrmTokens.color.bodyOnDark : nrmTokens.color.ink;
  const scrollClassName = webScrollClassName(isDark);
  const scrollInlineStyle = webScrollInlineStyle(isDark);
  const bodyColor = isDark ? nrmTokens.color.bodyMuted : nrmTokens.color.inkMuted80;

  const inputColors = {
    backgroundColor: isDark ? nrmTokens.color.surfaceTile2 : nrmTokens.color.canvas,
    color: titleColor,
    borderColor: isDark ? nrmTokens.color.borderOnDark : 'rgba(0, 0, 0, 0.08)',
  };

  useEffect(() => {
    if (!visible) return;
    void loadNrmGenreTagCatalog().then((catalog) => {
      setGenreCategoryNames(catalog.categories.map((c) => c.name));
    });
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    void loadLyricsModeOrder().then(setLyricsModeOrder);
  }, [visible]);

  useEffect(() => {
    if (!visible || !item) return;

    let nextArtist = '';
    let nextTitle = '';
    const usePlatformSeedFields =
      purpose === 'trackEdit' ||
      (metadataSource !== 'main' &&
        (initialArtist != null || initialTitle != null));
    if (usePlatformSeedFields) {
      nextArtist = (initialArtist ?? '').trim();
      nextTitle = (initialTitle ?? '').trim();
    } else {
      const fields = guessInitialDownloadFields(item);
      nextArtist = fields.artist;
      nextTitle = fields.title;
    }
    setArtist(nextArtist);
    setTitle(nextTitle);

    const m = initialMetadataFields;
    setAlbum(normalizeString(m?.album));
    setReleaseDate(normalizeString(m?.releaseDate));
    setTrackNumber(normalizeString(m?.trackNumber));
    setDiscNumber(normalizeString(m?.discNumber));
    setComposer(normalizeString(m?.composer));
    const rawLyrics = normalizeString(m?.lyrics);
    const plainFromField = normalizeString(m?.melonLyricsPlain);
    const site = normalizeMelonTrackWebsite(normalizeString(m?.website));
    const initialPlain = isMelonPlainLyricsText(rawLyrics) ? rawLyrics : plainFromField;
    setMelonPlainLyrics(initialPlain);
    setWebsite(site);
    const storedMode =
      purpose === 'trackEdit'
        ? (initialStoredLyricsMode ?? 'unset')
        : parseLyricsUiMode(rawLyrics);
    setStoredLyricsMode(storedMode);
    if (purpose === 'download' && storedMode === 'unset') {
      void loadLyricsModeOrder().then((order) => {
        setLyricsMode(defaultDownloadLyricsMode(order));
      });
    } else {
      setLyricsMode(storedMode);
    }
    setBpm(normalizeString(m?.bpm));
    setCopyright(normalizeString(m?.copyright));
    setProducer(normalizeString(m?.producer));
    setRemixer(normalizeString(m?.remixer));
    setCoverUrl(normalizeString(m?.coverUrl));
    setMoreExpanded(false);
    setPlatformGenreRaw(
      purpose === 'download' && isPlatformDownloadSource(metadataSource)
        ? normalizeString(m?.platformGenreRaw ?? m?.genre)
        : '',
    );

    if (purpose === 'download' && extractMelonSongIdFromUrl(site)) {
      void resolveMelonPlainLyricsForEdit(site, initialPlain).then((plain) => {
        if (!plain) return;
        setMelonPlainLyrics(plain);
      });
    }

    void loadNrmGenreTagCatalog().then((catalog) => {
      const names = catalog.categories.map((c) => c.name);
      setGenreCategoryNames(names);
      const resolved = resolveGenreSelection(normalizeString(m?.genre), catalog);
      setGenreSelection(resolved.selection);
      setGenreCustom(resolved.custom);
    });
  }, [visible, item, purpose, metadataSource, initialArtist, initialTitle, initialMetadataFields, initialStoredLyricsMode]);

  useEffect(() => {
    if (!item || !visible) return;
    void Promise.all([loadDownloadAudioExtension(), loadDownloadFileNameFormat()]).then(
      ([ext, format]) => {
        setExtension(fixedExtension?.trim() || ext);
        setFileNameFormat(format);
      },
    );
  }, [fixedExtension, item, visible]);

  useEffect(() => {
    if (!visible) setDeleteConfirm(null);
  }, [visible]);

  const genreOptions = useMemo(() => {
    const fromSettings = genreCategoryNames.map((name) => ({ value: name, label: name }));
    return [{ value: GENRE_MANUAL_VALUE, label: '직접입력' }, ...fromSettings];
  }, [genreCategoryNames]);

  const resolvedGenre = useMemo(() => {
    if (genreSelection === GENRE_MANUAL_VALUE) {
      return genreCustom.trim();
    }
    return genreSelection.trim();
  }, [genreSelection, genreCustom]);

  const preview = useMemo(() => {
    return buildAudioFileName(artist, title, extension, fileNameFormat);
  }, [artist, title, extension, fileNameFormat]);

  const [deleting, setDeleting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<ConfirmPayload | null>(null);
  const [lyricsLangPick, setLyricsLangPick] = useState<{
    resolve: (lang: MelonAlignLyricsLanguage | null) => void;
  } | null>(null);

  const blocked = busy || deleting;
  const canSubmit =
    !!item && artist.trim().length > 0 && title.trim().length > 0 && !blocked;
  const canSubmitWithConflict = canSubmit && !nameConflict;
  const confirmLabel = purpose === 'trackEdit' ? '저장' : '다운로드';

  const submitWithMetadata = useCallback(
    async (melonAlignLang?: MelonAlignLyricsLanguage) => {
      if (!item) return;
      const site = normalizeMelonTrackWebsite(website);
      let melonPlainForSubmit = melonPlainLyrics.trim();
      const melonTrack = !!extractMelonSongIdFromUrl(site);
      if (melonTrack || isMelonLyricsUiMode(lyricsMode)) {
        melonPlainForSubmit = (await resolveMelonPlainLyricsForEdit(site, melonPlainForSubmit)).trim();
        if (isMelonLyricsUiMode(lyricsMode) && !melonPlainForSubmit) {
          const { notifyUser } = await import('@/lib/nrmUserNotify');
          notifyUser('멜론 가사를 가져올 수 없습니다.');
          return;
        }
      }
      const lyricsPayload = resolveLyricsForSubmit(
        isMelonLyricsUiMode(lyricsMode) ? melonPlainForSubmit : undefined,
      );
      const metadata: NrmAudioFileMetadata = {
        artist: artist.trim(),
        title: title.trim(),
        album: album.trim(),
        genre: resolvedGenre,
        releaseDate: releaseDate.trim(),
        coverUrl: coverUrl.trim(),
        albumArtist: artist.trim() || undefined,
        trackNumber: trackNumber.trim() || undefined,
        discNumber: discNumber.trim() || undefined,
        composer: composer.trim() || undefined,
        lyrics: lyricsPayload.lyrics,
        melonLyricsPlain: lyricsPayload.melonLyricsPlain ?? (melonPlainForSubmit || undefined),
        melonAlignLang:
          purpose === 'download' && isMelonLyricsUiMode(lyricsMode) && melonAlignLang
            ? melonAlignLang
            : undefined,
        bpm: bpm.trim() || undefined,
        copyright: copyright.trim() || undefined,
        website: site || undefined,
        producer: producer.trim() || undefined,
        remixer: remixer.trim() || undefined,
      };
      const fileName = buildAudioFileName(
        artist.trim(),
        title.trim(),
        extension,
        fileNameFormat,
      );
      onConfirm(item.videoId, fileName, metadata);
    },
    [
      album,
      artist,
      bpm,
      composer,
      copyright,
      discNumber,
      extension,
      fileNameFormat,
      item,
      lyricsMode,
      melonPlainLyrics,
      onConfirm,
      producer,
      purpose,
      releaseDate,
      remixer,
      resolvedGenre,
      title,
      trackNumber,
      website,
      coverUrl,
    ],
  );

  const handlePrimaryAction = useCallback(() => {
    void (async () => {
      if (!item || !canSubmitWithConflict) return;
      if (purpose === 'download' && isMelonLyricsUiMode(lyricsMode)) {
        const alignPref = await loadAlignModelPreference();
        if (isNrmWav2Vec2BundleId(alignPref)) {
          setLyricsLangPick({
            resolve: (lang) => {
              setLyricsLangPick(null);
              if (!lang) return;
              void submitWithMetadata(lang);
            },
          });
          return;
        }
      }
      void submitWithMetadata();
    })();
  }, [canSubmitWithConflict, item, lyricsMode, purpose, submitWithMetadata]);

  const stackCoverColumn = cardMaxWidth < 400;

  async function pickCoverWeb() {
    fileInputRef.current?.click();
  }

  async function onCoverFileChosenWeb(e: any) {
    const file = e?.target?.files?.[0] as File | undefined | null;
    if (!file) return;
    const reader = new FileReader();
    const result: string = await new Promise((resolve, reject) => {
      reader.onerror = () => reject(new Error('FileReader failed'));
      reader.onload = () => resolve(String(reader.result));
      reader.readAsDataURL(file);
    });
    setCoverUrl(result);
    e.target.value = '';
  }

  async function pickCoverNative() {
    const ImagePicker = await import('expo-image-picker');
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
    });
    if (res.canceled) return;
    const uri = res.assets?.[0]?.uri;
    if (uri) setCoverUrl(uri);
  }

  async function pickCover() {
    if (Platform.OS === 'web') {
      void pickCoverWeb();
      return;
    }
    await pickCoverNative();
  }

  const lyricsUnsupported = extension !== '.mp3' && extension !== '.m4a';

  const whisperChecksEnabled =
    !lyricsUnsupported &&
    (isStandaloneAndroid() || (Platform.OS === 'web' && usesPcBackendInDev()));

  const whisperLyricsLocked =
    whisperChecksEnabled && (whisperGateLoading || whisperModelMissing);

  const melonLyricsLocked = whisperChecksEnabled && whisperXAlignMissing;

  const storedWhisperFamily =
    purpose === 'trackEdit' && isWhisperLyricsFamily(storedLyricsMode);
  const storedMelonFamily =
    purpose === 'trackEdit' && isMelonLyricsUiMode(storedLyricsMode);
  const downloadMelonReady =
    purpose !== 'trackEdit' &&
    metadataSource === 'melon' &&
    melonPlainLyrics.trim().length > 0;

  const isMelonContext = useMemo(() => {
    if (purpose === 'download') return metadataSource === 'melon';
    const modeFromEmbed = parseEmbeddedLyricsModeToken(
      normalizeString(initialMetadataFields?.nrmLyricsMode),
    );
    return (
      initialHasEmbeddedPlainLyrics ||
      melonPlainLyrics.trim().length > 0 ||
      (modeFromEmbed != null && isMelonLyricsUiMode(modeFromEmbed))
    );
  }, [
    initialHasEmbeddedPlainLyrics,
    initialMetadataFields?.nrmLyricsMode,
    metadataSource,
    melonPlainLyrics,
    purpose,
  ]);

  const melonLyricsReady = useMemo(() => {
    if (purpose === 'download') {
      return isMelonContext && downloadMelonReady;
    }
    const modeFromEmbed = parseEmbeddedLyricsModeToken(
      normalizeString(initialMetadataFields?.nrmLyricsMode),
    );
    return (
      initialHasEmbeddedPlainLyrics ||
      melonPlainLyrics.trim().length > 0 ||
      (modeFromEmbed != null && isMelonLyricsUiMode(modeFromEmbed))
    );
  }, [
    downloadMelonReady,
    initialHasEmbeddedPlainLyrics,
    initialMetadataFields?.nrmLyricsMode,
    isMelonContext,
    melonPlainLyrics,
    purpose,
  ]);

  useEffect(() => {
    if (!visible || lyricsUnsupported) {
      setWhisperModelMissing(false);
      setWhisperGateLoading(false);
      setWhisperXAlignMissing(false);
      return;
    }
    const checkApk = isStandaloneAndroid();
    const checkWeb = Platform.OS === 'web' && usesPcBackendInDev();
    if (!checkApk && !checkWeb) {
      setWhisperModelMissing(false);
      setWhisperGateLoading(false);
      setWhisperXAlignMissing(false);
      return;
    }
    let cancelled = false;
    let first = true;

    const refreshGate = async () => {
      if (first) {
        first = false;
        setWhisperGateLoading(true);
      }
      const [pref, alignPref] = await Promise.all([
        loadWhisperModelPreference(),
        loadAlignModelPreference(),
      ]);
      const [hasWhisper, hasAlign] = await Promise.all([
        isWhisperModelInstalled(pref),
        isAlignModelInstalled(alignPref),
      ]);
      if (cancelled) return;
      setWhisperModelMissing(!hasWhisper);
      setWhisperXAlignMissing(!hasAlign);
      if (!hasWhisper) {
        setLyricsMode((m) => {
          if (purpose === 'trackEdit' && isWhisperLyricsFamily(storedLyricsMode)) return m;
          return m === 'configured' || m === 'translation' ? 'unset' : m;
        });
      }
      if (!hasAlign) {
        setLyricsMode((m) => {
          if (purpose === 'trackEdit' && isMelonLyricsUiMode(storedLyricsMode)) return m;
          return m === 'melon' || m === 'melon_translation' ? 'unset' : m;
        });
      }
      setWhisperGateLoading(false);
    };

    void refreshGate();
    const poll = setInterval(() => {
      void refreshGate();
    }, 5000);

    return () => {
      cancelled = true;
      clearInterval(poll);
    };
  }, [visible, lyricsUnsupported, purpose, storedLyricsMode]);
  useEffect(() => {
    if (!visible || lyricsUnsupported) return;
    let cancelled = false;
    const refreshTranslationGate = async () => {
      const { resolveTranslationOptionGate } = await import('@/lib/nrmTranslationClient');
      const gate = await resolveTranslationOptionGate();
      if (!cancelled) {
        setTranslationOptionEnabled(gate.enabled);
      }
    };
    void refreshTranslationGate();
    const poll = setInterval(() => {
      void refreshTranslationGate();
    }, 5000);
    return () => {
      cancelled = true;
      clearInterval(poll);
    };
  }, [lyricsUnsupported, visible]);

  const conflictDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!visible || !item || !artist.trim() || !title.trim()) {
      if (conflictDebounceRef.current) {
        clearTimeout(conflictDebounceRef.current);
        conflictDebounceRef.current = null;
      }
      setNameConflict(false);
      return;
    }
    let cancelled = false;
    if (conflictDebounceRef.current) clearTimeout(conflictDebounceRef.current);
    conflictDebounceRef.current = setTimeout(() => {
      if (cancelled) return;
      void (async () => {
        if (Platform.OS === 'web') {
          if (!cancelled) setNameConflict(false);
          return;
        }
        try {
          const { hasConflictingFileStemInDownloadDir } = await import(
            '@/lib/nrmPersistDownload.native'
          );
          const hasConflict = await hasConflictingFileStemInDownloadDir(preview);
          const exclude = (excludeFileStem ?? '').trim().toLowerCase();
          const previewStem = preview.replace(/\.[^.]+$/, '').trim().toLowerCase();
          const conflict =
            hasConflict && (!exclude || previewStem !== exclude);
          if (!cancelled) {
            setNameConflict(conflict);
          }
        } catch {
          if (!cancelled) {
            setNameConflict(false);
          }
        }
      })();
    }, 400);
    return () => {
      cancelled = true;
      if (conflictDebounceRef.current) {
        clearTimeout(conflictDebounceRef.current);
        conflictDebounceRef.current = null;
      }
    };
  }, [artist, excludeFileStem, item, preview, purpose, title, visible]);

  const lyricsOptions = useMemo(
    () =>
      lyricsModeOrder.map((modeId) => {
        const opt = {
          value: modeId as NrmLyricsUiMode,
          label: NRM_LYRICS_MODE_LABELS[modeId],
        };
        if (opt.value === 'translation') {
          return {
            ...opt,
            disabled:
              isMelonContext ||
              (purpose === 'trackEdit'
                ? (whisperLyricsLocked || !translationOptionEnabled) && !storedWhisperFamily
                : whisperLyricsLocked || !translationOptionEnabled),
          };
        }
        if (opt.value === 'melon_translation') {
          return {
            ...opt,
            disabled:
              !isMelonContext ||
              !melonLyricsReady ||
              (purpose === 'trackEdit'
                ? (melonLyricsLocked || !translationOptionEnabled) && !storedMelonFamily
                : melonLyricsLocked || !translationOptionEnabled),
          };
        }
        if (opt.value === 'configured') {
          return {
            ...opt,
            disabled:
              isMelonContext ||
              (purpose === 'trackEdit'
                ? whisperLyricsLocked && !storedWhisperFamily
                : whisperLyricsLocked),
          };
        }
        if (opt.value === 'melon') {
          return {
            ...opt,
            disabled:
              !isMelonContext ||
              !melonLyricsReady ||
              (purpose === 'trackEdit'
                ? melonLyricsLocked && !storedMelonFamily
                : melonLyricsLocked),
          };
        }
        return { ...opt, disabled: false as const };
      }),
    [
      isMelonContext,
      lyricsModeOrder,
      melonLyricsLocked,
      melonLyricsReady,
      purpose,
      storedMelonFamily,
      storedWhisperFamily,
      translationOptionEnabled,
      whisperLyricsLocked,
    ],
  );

  // 비활성 모드가 선택돼 있으면 설정안함
  useEffect(() => {
    if (!visible || lyricsMode === 'unset') return;
    const selected = lyricsOptions.find((o) => o.value === lyricsMode);
    if (selected?.disabled) {
      setLyricsMode('unset');
    }
  }, [visible, lyricsMode, lyricsOptions]);

  useEffect(() => {
    if (!translationOptionEnabled && (lyricsMode === 'translation' || lyricsMode === 'melon_translation')) {
      setLyricsMode('unset');
    }
  }, [lyricsMode, translationOptionEnabled]);

  function resolveLyricsForSubmit(
    plainOverride?: string,
  ): Pick<NrmAudioFileMetadata, 'lyrics' | 'melonLyricsPlain'> {
    if (lyricsUnsupported) return {};
    if (lyricsMode === 'unset') return {};
    const selected = lyricsOptions.find((o) => o.value === lyricsMode);
    if (selected?.disabled) return {};
    if (isMelonLyricsUiMode(lyricsMode)) {
      const melonBlocked =
        melonLyricsLocked &&
        !(purpose === 'trackEdit' && isMelonLyricsUiMode(storedLyricsMode));
      if (melonBlocked) return {};
      const plain = (plainOverride ?? melonPlainLyrics).trim();
      if (!plain) return {};
      return {
        lyrics: buildLyricsSentinel(lyricsMode),
        melonLyricsPlain: plain,
      };
    }
    if (whisperLyricsLocked) return {};
    return { lyrics: buildLyricsSentinel(lyricsMode) };
  }

  return (
    <Modal
      visible={visible && !!item}
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (deleteConfirm) {
          deleteConfirm.resolve(false);
          setDeleteConfirm(null);
          return;
        }
        onClose();
      }}
      statusBarTranslucent>
      <View style={styles.wrap}>
        <Pressable
          style={[StyleSheet.absoluteFill, styles.dim]}
          onPress={deleteConfirm ? undefined : onClose}
        />
        <View
          style={[
            styles.card,
            {
              width: cardMaxWidth,
              maxHeight: cardMaxHeight,
              backgroundColor: isDark ? nrmTokens.color.surfaceTile1 : nrmTokens.color.canvas,
              borderColor: isDark ? nrmTokens.color.borderOnDark : nrmTokens.color.hairline,
            },
          ]}>
          <Text style={[styles.heading, { color: titleColor }]}>트랙 정보</Text>

          {busy ? (
            <View style={styles.busyRow}>
              <ActivityIndicator color={nrmTokens.color.primary} />
              <Text style={[styles.busyHint, { color: bodyColor }]}>
                {purpose === 'trackEdit'
                  ? '저장된 파일에서 메타데이터를 읽는 중입니다...'
                  : 'Last.fm/Spotify 메타데이터를 불러오는 중입니다...'}
              </Text>
            </View>
          ) : null}

          <ScrollView
            style={[styles.scroll, scrollInlineStyle]}
            contentContainerStyle={[
              styles.scrollContent,
              Platform.OS === 'web' && styles.scrollContentWeb,
            ]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            {...(scrollClassName ? { className: scrollClassName } : {})}>
            <View
              style={[
                styles.topSection,
                stackCoverColumn ? styles.topSectionStacked : styles.topSectionRow,
              ]}>
              <View style={[styles.coverColumn, stackCoverColumn && styles.coverColumnStacked]}>
                <View style={styles.coverPreviewWrap}>
                  {coverUrl ? (
                    <Image source={{ uri: coverUrl }} style={styles.coverPreview} resizeMode="cover" />
                  ) : (
                    <View style={[styles.coverPreview, styles.coverEmpty]}>
                      <Text style={{ color: bodyColor, fontSize: nrmTokens.font.caption }}>
                        앨범커버
                      </Text>
                    </View>
                  )}
                </View>
                <View style={styles.coverActions}>
                  <Pressable
                    onPress={pickCover}
                    disabled={busy}
                    style={({ pressed }) => [
                      styles.coverActionBtn,
                      {
                        backgroundColor: isDark
                          ? 'rgba(255,255,255,0.08)'
                          : 'rgba(0,0,0,0.04)',
                        borderColor: isDark ? nrmTokens.color.borderOnDark : 'rgba(0,0,0,0.1)',
                        opacity: busy ? 0.5 : 1,
                      },
                      pressed && styles.pressed,
                    ]}>
                    <Text style={[styles.coverActionLabel, { color: titleColor }]}>편집</Text>
                  </Pressable>
                  {coverUrl ? (
                    <Pressable
                      onPress={() => setCoverUrl('')}
                      disabled={busy}
                      style={({ pressed }) => [
                        styles.coverActionBtn,
                        {
                          backgroundColor: isDark
                            ? 'rgba(255,255,255,0.08)'
                            : 'rgba(0,0,0,0.04)',
                          borderColor: isDark ? nrmTokens.color.borderOnDark : 'rgba(0,0,0,0.1)',
                          opacity: busy ? 0.5 : 1,
                        },
                        pressed && styles.pressed,
                      ]}>
                      <Text style={[styles.coverActionLabel, { color: titleColor }]}>제거</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>

              <View style={styles.fieldsColumn}>
                <InlineTextField
                  label="가수"
                  value={artist}
                  onChangeText={setArtist}
                  bodyColor={bodyColor}
                  inputColors={inputColors}
                  editable={!busy}
                />
                <InlineTextField
                  label="트랙"
                  value={title}
                  onChangeText={setTitle}
                  bodyColor={bodyColor}
                  inputColors={inputColors}
                  editable={!busy}
                />
                <InlineTextField
                  label="앨범"
                  value={album}
                  onChangeText={setAlbum}
                  bodyColor={bodyColor}
                  inputColors={inputColors}
                  editable={!busy}
                />
                <InlineTextField
                  label="연도"
                  value={releaseDate}
                  onChangeText={setReleaseDate}
                  bodyColor={bodyColor}
                  inputColors={inputColors}
                  editable={!busy}
                />
                <MetadataInlineSelect
                  label="장르"
                  value={genreSelection}
                  options={genreOptions}
                  onChange={setGenreSelection}
                  isDark={isDark}
                  titleColor={titleColor}
                  bodyColor={bodyColor}
                  disabled={busy || genreOptions.length === 0}
                  scrollClassName={scrollClassName}
                  scrollStyle={scrollInlineStyle}
                />
                {genreSelection === GENRE_MANUAL_VALUE ? (
                  <View style={styles.inlineFieldRow}>
                    <Text style={[styles.inlineFieldLabel, { color: bodyColor }]} />
                    <TextInput
                      value={genreCustom}
                      onChangeText={setGenreCustom}
                      placeholder="장르 직접입력"
                      placeholderTextColor={isDark ? '#6b7288' : '#9ca3af'}
                      style={[styles.inlineInput, inputColors]}
                      editable={!busy}
                    />
                  </View>
                ) : null}
                {lyricsUnsupported ? (
                  <View style={styles.inlineFieldRow}>
                    <Text style={[styles.inlineFieldLabel, { color: bodyColor }]}>가사</Text>
                    <Text style={[styles.lyricsUnsupportedHint, { color: bodyColor }]}>
                      mp3, m4a에서만 지원합니다.
                    </Text>
                  </View>
                ) : (
                  <MetadataInlineSelect
                    label="가사"
                    value={lyricsMode}
                    options={lyricsOptions}
                    onChange={(v) => setLyricsMode(v as NrmLyricsUiMode)}
                    isDark={isDark}
                    titleColor={titleColor}
                    bodyColor={bodyColor}
                    disabled={busy}
                    hideSheetTitle
                    scrollClassName={scrollClassName}
                    scrollStyle={scrollInlineStyle}
                  />
                )}
              </View>
            </View>

            <Pressable
              onPress={() => setMoreExpanded((v) => !v)}
              style={({ pressed }) => [styles.moreToggle, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityState={{ expanded: moreExpanded }}>
              <Text style={[styles.moreToggleLabel, { color: titleColor }]}>그 외 정보</Text>
              <Ionicons
                name={moreExpanded ? 'chevron-up' : 'chevron-down'}
                size={18}
                color={bodyColor}
              />
            </Pressable>

            {moreExpanded ? (
              <View style={styles.moreFields}>
                {purpose === 'download' && isPlatformDownloadSource(metadataSource) ? (
                  <View style={styles.platformGenreRow}>
                    <Text style={[styles.platformGenreText, { color: bodyColor }]}>
                      장르 원본 :{' '}
                      <Text style={{ color: titleColor }}>
                        {platformGenreRaw || '(없음)'}
                      </Text>
                    </Text>
                  </View>
                ) : null}
                <InlineTextField
                  label="트랙번호"
                  value={trackNumber}
                  onChangeText={setTrackNumber}
                  bodyColor={bodyColor}
                  inputColors={inputColors}
                  editable={!busy}
                />
                <InlineTextField
                  label="디스크"
                  value={discNumber}
                  onChangeText={setDiscNumber}
                  bodyColor={bodyColor}
                  inputColors={inputColors}
                  editable={!busy}
                />
                <InlineTextField
                  label="작곡가"
                  value={composer}
                  onChangeText={setComposer}
                  bodyColor={bodyColor}
                  inputColors={inputColors}
                  editable={!busy}
                />
                <InlineTextField
                  label="BPM"
                  value={bpm}
                  onChangeText={setBpm}
                  bodyColor={bodyColor}
                  inputColors={inputColors}
                  editable={!busy}
                />
                <InlineTextField
                  label="저작권"
                  value={copyright}
                  onChangeText={setCopyright}
                  bodyColor={bodyColor}
                  inputColors={inputColors}
                  editable={!busy}
                />
                <InlineTextField
                  label="URL"
                  value={website}
                  onChangeText={setWebsite}
                  bodyColor={bodyColor}
                  inputColors={inputColors}
                  editable={!busy}
                />
                <InlineTextField
                  label="프로듀서"
                  value={producer}
                  onChangeText={setProducer}
                  bodyColor={bodyColor}
                  inputColors={inputColors}
                  editable={!busy}
                />
                <InlineTextField
                  label="리믹서"
                  value={remixer}
                  onChangeText={setRemixer}
                  bodyColor={bodyColor}
                  inputColors={inputColors}
                  editable={!busy}
                />
              </View>
            ) : null}
          </ScrollView>

          {Platform.OS === 'web' ? (
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={onCoverFileChosenWeb}
            />
          ) : null}

          <Text style={[styles.preview, { color: bodyColor }]} numberOfLines={2}>
            파일명: {preview}
          </Text>
          {nameConflict ? (
            <Text
              style={[
                styles.conflictHint,
                { color: isDark ? '#fda4af' : '#b91c1c' },
              ]}>
              동일한 이름의 파일이 있습니다.
            </Text>
          ) : null}

          <View style={styles.footerRow}>
            {purpose === 'trackEdit' && onDelete ? (
              <Pressable
                onPress={() => {
                  if (blocked || deleteConfirm) return;
                  const name = deleteFileName?.trim() || preview;
                  setDeleteConfirm({
                    message: `${name}을 삭제할까요?`,
                    cancelLabel: '취소',
                    confirmLabel: '삭제',
                    resolve: (confirmed) => {
                      setDeleteConfirm(null);
                      if (!confirmed) return;
                      setDeleting(true);
                      void (async () => {
                        try {
                          await onDelete();
                        } finally {
                          setDeleting(false);
                        }
                      })();
                    },
                  });
                }}
                disabled={blocked}
                style={({ pressed }) => [
                  styles.btnDelete,
                  {
                    borderColor: isDark ? 'rgba(248,113,113,0.45)' : 'rgba(220,38,38,0.35)',
                  },
                  blocked && styles.btnDisabled,
                  pressed && !blocked && styles.pressed,
                ]}>
                {deleting ? (
                  <ActivityIndicator size="small" color={isDark ? '#fca5a5' : '#dc2626'} />
                ) : (
                  <Text style={[styles.btnDeleteLabel, { color: isDark ? '#fca5a5' : '#dc2626' }]}>
                    삭제
                  </Text>
                )}
              </Pressable>
            ) : (
              <View />
            )}

            <View style={styles.actions}>
            <Pressable
              onPress={onClose}
              disabled={blocked}
              style={({ pressed }) => [
                styles.btnSecondary,
                {
                  borderColor: isDark ? nrmTokens.color.borderOnDark : nrmTokens.color.hairline,
                },
                blocked && styles.btnDisabled,
                pressed && !blocked && styles.pressed,
              ]}>
              <Text style={{ color: titleColor }}>취소</Text>
            </Pressable>

            <Pressable
              onPress={handlePrimaryAction}
              disabled={!canSubmitWithConflict}
              style={({ pressed }) => [
                styles.btnPrimary,
                !canSubmitWithConflict && styles.btnDisabled,
                pressed && canSubmitWithConflict && styles.pressed,
              ]}>
              <Text style={styles.btnPrimaryLabel}>{confirmLabel}</Text>
            </Pressable>
            </View>
          </View>
        </View>

        {deleteConfirm ? (
          <View style={styles.confirmHost} pointerEvents="box-none">
            <NrmUserNotifyOverlay
              overlay={{ kind: 'confirm', payload: deleteConfirm }}
              isDark={isDark}
              onClose={() => {
                deleteConfirm.resolve(false);
                setDeleteConfirm(null);
              }}
            />
          </View>
        ) : null}

        {lyricsLangPick ? (
          <View style={styles.confirmHost} pointerEvents="box-none">
            <View style={[styles.lyricsLangCard, { borderColor: isDark ? nrmTokens.color.borderOnDark : nrmTokens.color.hairline, backgroundColor: isDark ? nrmTokens.color.surfaceTile1 : nrmTokens.color.canvas }]}>
              <Text style={[styles.lyricsLangTitle, { color: titleColor }]}>가사의 언어를 선택하세요.</Text>
              <View style={styles.lyricsLangActions}>
                <Pressable
                  onPress={() => lyricsLangPick.resolve('ko')}
                  style={({ pressed }) => [styles.lyricsLangBtn, styles.lyricsLangBtnPrimary, pressed && styles.pressed]}
                  accessibilityRole="button">
                  <Text style={styles.lyricsLangBtnPrimaryLabel}>한국어</Text>
                </Pressable>
                <Pressable
                  onPress={() => lyricsLangPick.resolve('en')}
                  style={({ pressed }) => [styles.lyricsLangBtn, styles.lyricsLangBtnPrimary, pressed && styles.pressed]}
                  accessibilityRole="button">
                  <Text style={styles.lyricsLangBtnPrimaryLabel}>English</Text>
                </Pressable>
                <Pressable
                  onPress={() => lyricsLangPick.resolve(null)}
                  style={({ pressed }) => [
                    styles.lyricsLangBtn,
                    styles.lyricsLangBtnSecondary,
                    { borderColor: isDark ? nrmTokens.color.borderOnDark : nrmTokens.color.hairline },
                    pressed && styles.pressed,
                  ]}
                  accessibilityRole="button">
                  <Text style={[styles.lyricsLangBtnSecondaryLabel, { color: bodyColor }]}>취소</Text>
                </Pressable>
              </View>
            </View>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: nrmTokens.space.lg,
  },
  confirmHost: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 300,
    elevation: 300,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  lyricsLangCard: {
    borderRadius: nrmTokens.radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: nrmTokens.space.lg,
    width: '88%',
    maxWidth: 360,
    gap: nrmTokens.space.md,
  },
  lyricsLangTitle: {
    fontSize: nrmTokens.font.body,
    fontWeight: '600',
    textAlign: 'center',
  },
  lyricsLangActions: { gap: nrmTokens.space.sm },
  lyricsLangBtn: {
    borderRadius: nrmTokens.radius.md,
    paddingVertical: nrmTokens.space.md,
    alignItems: 'center',
  },
  lyricsLangBtnPrimary: { backgroundColor: nrmTokens.color.primary },
  lyricsLangBtnPrimaryLabel: {
    color: nrmTokens.color.onPrimary,
    fontSize: nrmTokens.font.body,
    fontWeight: '600',
  },
  lyricsLangBtnSecondary: { borderWidth: StyleSheet.hairlineWidth },
  lyricsLangBtnSecondaryLabel: { fontSize: nrmTokens.font.body, fontWeight: '500' },
  dim: { backgroundColor: 'rgba(0,0,0,0.45)' },
  card: {
    borderRadius: nrmTokens.radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: nrmTokens.space.lg,
    zIndex: 1,
    overflow: 'hidden',
  },
  heading: {
    fontSize: nrmTokens.font.tagline,
    fontWeight: '600',
    marginBottom: nrmTokens.space.md,
  },
  busyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: nrmTokens.space.sm,
    marginBottom: nrmTokens.space.md,
  },
  busyHint: { fontSize: nrmTokens.font.caption, flex: 1 },
  scroll: { flexGrow: 0, flexShrink: 1, marginRight: -2 },
  scrollContent: { paddingBottom: nrmTokens.space.sm },
  scrollContentWeb: { paddingRight: nrmTokens.space.xs },
  topSection: { gap: nrmTokens.space.lg, marginBottom: nrmTokens.space.md },
  topSectionRow: { flexDirection: 'row', alignItems: 'flex-start' },
  topSectionStacked: { flexDirection: 'column' },
  coverColumn: { width: 128, flexShrink: 0 },
  coverColumnStacked: { alignSelf: 'center' },
  coverPreviewWrap: {
    width: 128,
    height: 128,
    borderRadius: nrmTokens.radius.lg,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: nrmTokens.color.hairline,
    marginBottom: nrmTokens.space.sm,
  },
  coverPreview: { width: '100%', height: '100%' },
  coverEmpty: { justifyContent: 'center', alignItems: 'center' },
  coverActions: { flexDirection: 'row', gap: nrmTokens.space.xs, width: 128 },
  coverActionBtn: {
    flex: 1,
    height: 34,
    borderRadius: nrmTokens.radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  coverActionLabel: {
    fontSize: nrmTokens.font.caption,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 18,
    includeFontPadding: false,
  },
  fieldsColumn: { flex: 1, minWidth: 0, gap: nrmTokens.space.sm },
  inlineFieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: nrmTokens.space.sm,
    minHeight: 40,
  },
  inlineFieldLabel: {
    width: 52,
    fontSize: nrmTokens.font.caption,
    fontWeight: '600',
    flexShrink: 0,
  },
  lyricsUnsupportedHint: {
    flex: 1,
    minWidth: 0,
    fontSize: nrmTokens.font.caption,
    lineHeight: 20,
    opacity: 0.85,
  },
  inlineInput: {
    flex: 1,
    minWidth: 0,
    maxWidth: 280,
    borderWidth: 1,
    borderRadius: nrmTokens.radius.md,
    paddingHorizontal: nrmTokens.space.sm,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    fontSize: nrmTokens.font.body,
  },
  selectTrigger: {
    flex: 1,
    minWidth: 0,
    maxWidth: 280,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 40,
    paddingHorizontal: nrmTokens.space.sm,
    borderRadius: nrmTokens.radius.md,
    borderWidth: 1,
    gap: 4,
  },
  selectTriggerText: {
    flex: 1,
    fontSize: nrmTokens.font.body,
  },
  selectScrim: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    paddingHorizontal: nrmTokens.space.lg,
  },
  selectSheet: {
    maxHeight: '70%',
    borderRadius: nrmTokens.radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: nrmTokens.space.md,
    alignSelf: 'center',
    width: '100%',
    maxWidth: 360,
  },
  selectSheetTitle: {
    fontSize: nrmTokens.font.body,
    fontWeight: '600',
    paddingHorizontal: nrmTokens.space.lg,
    marginBottom: nrmTokens.space.sm,
  },
  selectSheetScroll: { maxHeight: 320, marginRight: -2 },
  selectSheetScrollContent: {
    paddingRight: Platform.OS === 'web' ? nrmTokens.space.xs : 0,
  },
  selectOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: nrmTokens.space.md,
    paddingHorizontal: nrmTokens.space.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  selectOptionRowActive: { backgroundColor: 'rgba(0, 102, 204, 0.1)' },
  selectOptionTextCol: { flex: 1, paddingRight: nrmTokens.space.sm },
  selectOptionText: { fontSize: nrmTokens.font.body },
  selectOptionHint: { fontSize: nrmTokens.font.caption, marginTop: 2, lineHeight: 18 },
  moreToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: nrmTokens.space.sm,
    paddingHorizontal: nrmTokens.space.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: nrmTokens.color.hairline,
    marginBottom: nrmTokens.space.xs,
  },
  moreToggleLabel: { fontSize: nrmTokens.font.body, fontWeight: '600' },
  moreFields: { gap: nrmTokens.space.sm, paddingBottom: nrmTokens.space.sm },
  platformGenreRow: {
    paddingVertical: nrmTokens.space.xs,
    marginBottom: nrmTokens.space.xs,
  },
  platformGenreText: {
    fontSize: nrmTokens.font.caption,
    lineHeight: 20,
  },
  preview: {
    fontSize: nrmTokens.font.caption,
    marginTop: nrmTokens.space.sm,
    marginBottom: nrmTokens.space.md,
  },
  conflictHint: {
    fontSize: nrmTokens.font.caption,
    marginBottom: nrmTokens.space.md,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: nrmTokens.space.sm,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: nrmTokens.space.sm,
    justifyContent: 'flex-end',
  },
  btnDelete: {
    paddingVertical: 11,
    paddingHorizontal: 18,
    borderRadius: nrmTokens.radius.pill,
    borderWidth: 1,
    minWidth: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDeleteLabel: {
    fontSize: nrmTokens.font.body,
    fontWeight: '600',
  },
  btnSecondary: {
    paddingVertical: 11,
    paddingHorizontal: 18,
    borderRadius: nrmTokens.radius.pill,
    borderWidth: 1,
  },
  btnPrimary: {
    paddingVertical: 11,
    paddingHorizontal: 22,
    borderRadius: nrmTokens.radius.pill,
    backgroundColor: nrmTokens.color.primary,
  },
  btnDisabled: { opacity: 0.45 },
  pressed: { opacity: 0.92, transform: [{ scale: 0.98 }] },
  btnPrimaryLabel: {
    color: nrmTokens.color.onPrimary,
    fontSize: nrmTokens.font.body,
    fontWeight: '400',
  },
});
