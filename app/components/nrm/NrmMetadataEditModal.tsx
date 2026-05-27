import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Image,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  ActivityIndicator,
} from 'react-native';

import { nrmTokens } from '@/constants/nrmTokens';
import {
  loadDownloadAudioExtension,
  loadDownloadFileNameFormat,
  type NrmDownloadFileNameFormat,
} from '@/lib/nrmDownloadSettings';
import {
  buildAudioFileName,
  guessInitialDownloadFields,
} from '@/lib/nrmYoutubeDownloadMeta';
import type { YoutubeSearchItem } from '@/lib/youtubeSearchClient';
import type { NrmAudioFileMetadata } from '@/lib/nrmDownloadAudioMetadata';

export type NrmMetadataEditModalProps = {
  visible: boolean;
  item: YoutubeSearchItem | null;
  isDark: boolean;
  metadataSource?: 'chart' | 'main' | 'lastfm' | 'spotify';
  initialArtist?: string;
  initialTitle?: string;
  /**
   * artist/title은 사용자가 편집하므로 여기에는 artist/title 외의 필드만 넘깁니다.
   * coverUrl은 웹 dataURL 또는 APK file:// / content:// uri 모두 허용합니다.
   */
  initialMetadataFields?: Omit<NrmAudioFileMetadata, 'artist' | 'title'>;
  busy?: boolean;
  onClose: () => void;
  onConfirm: (videoId: string, fileName: string, metadata: NrmAudioFileMetadata) => void;
};

function normalizeString(s: string | undefined | null): string {
  return (s ?? '').trim();
}

export function NrmMetadataEditModal({
  visible,
  item,
  isDark,
  metadataSource = 'main',
  initialArtist,
  initialTitle,
  initialMetadataFields,
  busy = false,
  onClose,
  onConfirm,
}: NrmMetadataEditModalProps) {
  const [artist, setArtist] = useState('');
  const [title, setTitle] = useState('');

  const [album, setAlbum] = useState('');
  const [albumArtist, setAlbumArtist] = useState('');
  const [genre, setGenre] = useState('');
  const [releaseDate, setReleaseDate] = useState('');
  const [trackNumber, setTrackNumber] = useState('');
  const [discNumber, setDiscNumber] = useState('');
  const [composer, setComposer] = useState('');
  const [lyrics, setLyrics] = useState('');
  const [bpm, setBpm] = useState('');
  const [copyright, setCopyright] = useState('');
  const [website, setWebsite] = useState('');
  const [producer, setProducer] = useState('');
  const [remixer, setRemixer] = useState('');
  const [coverUrl, setCoverUrl] = useState('');

  const [extension, setExtension] = useState('.mp3');
  const [fileNameFormat, setFileNameFormat] =
    useState<NrmDownloadFileNameFormat>('artist-title');

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!visible || !item) return;

    if (
      (metadataSource === 'chart' || metadataSource === 'lastfm' || metadataSource === 'spotify') &&
      (initialArtist != null || initialTitle != null)
    ) {
      setArtist((initialArtist ?? '').trim());
      setTitle((initialTitle ?? '').trim());
    } else {
      const fields = guessInitialDownloadFields(item);
      setArtist(fields.artist);
      setTitle(fields.title);
    }

    const m = initialMetadataFields;
    setAlbum(normalizeString(m?.album));
    setAlbumArtist(normalizeString(m?.albumArtist));
    setGenre(normalizeString(m?.genre));
    setReleaseDate(normalizeString(m?.releaseDate));
    setTrackNumber(normalizeString(m?.trackNumber));
    setDiscNumber(normalizeString(m?.discNumber));
    setComposer(normalizeString(m?.composer));
    setLyrics(normalizeString(m?.lyrics));
    setBpm(normalizeString(m?.bpm));
    setCopyright(normalizeString(m?.copyright));
    setWebsite(normalizeString(m?.website));
    setProducer(normalizeString(m?.producer));
    setRemixer(normalizeString(m?.remixer));
    setCoverUrl(normalizeString(m?.coverUrl));
  }, [visible, item, metadataSource, initialArtist, initialTitle, initialMetadataFields]);

  useEffect(() => {
    if (!item || !visible) return;
    void Promise.all([loadDownloadAudioExtension(), loadDownloadFileNameFormat()]).then(
      ([ext, format]) => {
        setExtension(ext);
        setFileNameFormat(format);
      },
    );
  }, [item, visible]);

  const preview = useMemo(() => {
    return buildAudioFileName(artist, title, extension, fileNameFormat);
  }, [artist, title, extension, fileNameFormat]);

  const canSubmit = !!item && artist.trim().length > 0 && title.trim().length > 0 && !busy;

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
    // allow re-picking same file
    e.target.value = '';
  }

  async function pickCoverNative() {
    // expo-image-picker은 native 전용으로 동적 import
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

  const inputColors = {
    backgroundColor: isDark ? nrmTokens.color.surfaceTile2 : nrmTokens.color.canvas,
    color: isDark ? nrmTokens.color.bodyOnDark : nrmTokens.color.ink,
    borderColor: isDark ? nrmTokens.color.borderOnDark : 'rgba(0, 0, 0, 0.08)',
  };

  return (
    <Modal
      visible={visible && !!item}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent>
      <View style={styles.wrap}>
        <Pressable style={[StyleSheet.absoluteFill, styles.dim]} onPress={onClose} />
        <View
          style={[
            styles.card,
            {
              backgroundColor: isDark ? nrmTokens.color.surfaceTile1 : nrmTokens.color.canvas,
              borderColor: isDark ? nrmTokens.color.borderOnDark : nrmTokens.color.hairline,
            },
          ]}>
          <Text
            style={[
              styles.heading,
              { color: isDark ? nrmTokens.color.bodyOnDark : nrmTokens.color.ink },
            ]}>
            메타데이터 편집
          </Text>

          {busy ? (
            <View style={{ paddingVertical: nrmTokens.space.md }}>
              <ActivityIndicator color={nrmTokens.color.primary} />
              <Text style={[styles.hint, { color: isDark ? nrmTokens.color.bodyMuted : nrmTokens.color.inkMuted48 }]}>
                Last.fm/Spotify 메타데이터를 불러오는 중입니다...
              </Text>
            </View>
          ) : null}

          <Text
            style={[
              styles.hint,
              {
                color: isDark ? nrmTokens.color.bodyMuted : nrmTokens.color.inkMuted48,
              },
            ]}>
            {metadataSource === 'chart'
              ? '차트 정보를 기본값으로 넣었습니다. 필요하면 수정하세요.'
              : metadataSource === 'lastfm'
                ? 'Last.fm 정보를 기본값으로 넣었습니다. 필요하면 수정하세요.'
                : '유튜브 검색 결과를 바탕으로 채웠습니다. 필요하면 수정하세요.'}
          </Text>

          <View style={{ flexDirection: 'row', gap: nrmTokens.space.md, marginBottom: nrmTokens.space.md }}>
            <View style={styles.coverPreviewWrap}>
              {coverUrl ? (
                // RN Image는 dataURL/file/content URI도 uri로 처리합니다.
                <Image source={{ uri: coverUrl }} style={styles.coverPreview} resizeMode="cover" />
              ) : (
                <View style={[styles.coverPreview, { justifyContent: 'center', alignItems: 'center' }]}>
                  <Text style={{ color: isDark ? nrmTokens.color.bodyMuted : nrmTokens.color.inkMuted48 }}>커버 없음</Text>
                </View>
              )}
            </View>
            <View style={{ flex: 1, justifyContent: 'flex-end' }}>
              <Pressable
                onPress={pickCover}
                disabled={busy}
                style={({ pressed }) => [
                  styles.btnSecondary,
                  {
                    borderColor: isDark ? nrmTokens.color.borderOnDark : 'rgba(0,0,0,0.12)',
                    opacity: busy ? 0.5 : 1,
                    transform: pressed ? [{ scale: 0.98 }] : undefined,
                  },
                ]}>
                <Text style={{ color: isDark ? nrmTokens.color.bodyOnDark : nrmTokens.color.ink }}>
                  커버 선택
                </Text>
              </Pressable>
              {coverUrl ? (
                <Pressable
                  onPress={() => setCoverUrl('')}
                  disabled={busy}
                  style={({ pressed }) => [
                    styles.btnSecondary,
                    {
                      marginTop: nrmTokens.space.sm,
                      borderColor: isDark ? nrmTokens.color.borderOnDark : 'rgba(0,0,0,0.12)',
                      opacity: busy ? 0.5 : 1,
                      transform: pressed ? [{ scale: 0.98 }] : undefined,
                    },
                  ]}>
                  <Text style={{ color: isDark ? nrmTokens.color.bodyOnDark : nrmTokens.color.ink }}>
                    커버 제거
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </View>

          {Platform.OS === 'web' ? (
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={onCoverFileChosenWeb}
            />
          ) : null}

          <Text style={[styles.label, { color: isDark ? nrmTokens.color.bodyMuted : nrmTokens.color.inkMuted80 }]}>
            가수
          </Text>
          <TextInput
            value={artist}
            onChangeText={setArtist}
            placeholder="가수"
            placeholderTextColor={isDark ? '#6b7288' : '#9ca3af'}
            style={[styles.field, inputColors]}
            editable={!busy}
          />

          <Text style={[styles.label, { color: isDark ? nrmTokens.color.bodyMuted : nrmTokens.color.inkMuted80 }]}>
            곡 제목
          </Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="곡 제목"
            placeholderTextColor={isDark ? '#6b7288' : '#9ca3af'}
            style={[styles.field, inputColors]}
            editable={!busy}
          />

          <Text style={[styles.label, { color: isDark ? nrmTokens.color.bodyMuted : nrmTokens.color.inkMuted80 }]}>
            앨범
          </Text>
          <TextInput
            value={album}
            onChangeText={setAlbum}
            placeholder="앨범"
            placeholderTextColor={isDark ? '#6b7288' : '#9ca3af'}
            style={[styles.field, inputColors]}
            editable={!busy}
          />

          <Text style={[styles.label, { color: isDark ? nrmTokens.color.bodyMuted : nrmTokens.color.inkMuted80 }]}>
            앨범가수
          </Text>
          <TextInput
            value={albumArtist}
            onChangeText={setAlbumArtist}
            placeholder="album_artist"
            placeholderTextColor={isDark ? '#6b7288' : '#9ca3af'}
            style={[styles.field, inputColors]}
            editable={!busy}
          />

          <Text style={[styles.label, { color: isDark ? nrmTokens.color.bodyMuted : nrmTokens.color.inkMuted80 }]}>
            장르
          </Text>
          <TextInput
            value={genre}
            onChangeText={setGenre}
            placeholder="genre"
            placeholderTextColor={isDark ? '#6b7288' : '#9ca3af'}
            style={[styles.field, inputColors]}
            editable={!busy}
          />

          <Text style={[styles.label, { color: isDark ? nrmTokens.color.bodyMuted : nrmTokens.color.inkMuted80 }]}>
            연도
          </Text>
          <TextInput
            value={releaseDate}
            onChangeText={setReleaseDate}
            placeholder="date (yyyy)"
            placeholderTextColor={isDark ? '#6b7288' : '#9ca3af'}
            style={[styles.field, inputColors]}
            editable={!busy}
          />

          <Text style={[styles.label, { color: isDark ? nrmTokens.color.bodyMuted : nrmTokens.color.inkMuted80 }]}>
            트랙번호
          </Text>
          <TextInput
            value={trackNumber}
            onChangeText={setTrackNumber}
            placeholder="track"
            placeholderTextColor={isDark ? '#6b7288' : '#9ca3af'}
            style={[styles.field, inputColors]}
            editable={!busy}
          />

          <Text style={[styles.label, { color: isDark ? nrmTokens.color.bodyMuted : nrmTokens.color.inkMuted80 }]}>
            디스크번호
          </Text>
          <TextInput
            value={discNumber}
            onChangeText={setDiscNumber}
            placeholder="disc"
            placeholderTextColor={isDark ? '#6b7288' : '#9ca3af'}
            style={[styles.field, inputColors]}
            editable={!busy}
          />

          <Text style={[styles.label, { color: isDark ? nrmTokens.color.bodyMuted : nrmTokens.color.inkMuted80 }]}>
            작곡가
          </Text>
          <TextInput
            value={composer}
            onChangeText={setComposer}
            placeholder="composer"
            placeholderTextColor={isDark ? '#6b7288' : '#9ca3af'}
            style={[styles.field, inputColors]}
            editable={!busy}
          />

          <Text style={[styles.label, { color: isDark ? nrmTokens.color.bodyMuted : nrmTokens.color.inkMuted80 }]}>
            가사
          </Text>
          <TextInput
            value={lyrics}
            onChangeText={setLyrics}
            placeholder="lyrics"
            placeholderTextColor={isDark ? '#6b7288' : '#9ca3af'}
            style={[styles.field, inputColors]}
            editable={!busy}
          />

          <Text style={[styles.label, { color: isDark ? nrmTokens.color.bodyMuted : nrmTokens.color.inkMuted80 }]}>
            BPM
          </Text>
          <TextInput
            value={bpm}
            onChangeText={setBpm}
            placeholder="bpm"
            placeholderTextColor={isDark ? '#6b7288' : '#9ca3af'}
            style={[styles.field, inputColors]}
            editable={!busy}
          />

          <Text style={[styles.label, { color: isDark ? nrmTokens.color.bodyMuted : nrmTokens.color.inkMuted80 }]}>
            저작권
          </Text>
          <TextInput
            value={copyright}
            onChangeText={setCopyright}
            placeholder="copyright"
            placeholderTextColor={isDark ? '#6b7288' : '#9ca3af'}
            style={[styles.field, inputColors]}
            editable={!busy}
          />

          <Text style={[styles.label, { color: isDark ? nrmTokens.color.bodyMuted : nrmTokens.color.inkMuted80 }]}>
            URL
          </Text>
          <TextInput
            value={website}
            onChangeText={setWebsite}
            placeholder="website / url"
            placeholderTextColor={isDark ? '#6b7288' : '#9ca3af'}
            style={[styles.field, inputColors]}
            editable={!busy}
          />

          <Text style={[styles.label, { color: isDark ? nrmTokens.color.bodyMuted : nrmTokens.color.inkMuted80 }]}>
            프로듀서
          </Text>
          <TextInput
            value={producer}
            onChangeText={setProducer}
            placeholder="producer"
            placeholderTextColor={isDark ? '#6b7288' : '#9ca3af'}
            style={[styles.field, inputColors]}
            editable={!busy}
          />

          <Text style={[styles.label, { color: isDark ? nrmTokens.color.bodyMuted : nrmTokens.color.inkMuted80 }]}>
            리믹서
          </Text>
          <TextInput
            value={remixer}
            onChangeText={setRemixer}
            placeholder="remixer"
            placeholderTextColor={isDark ? '#6b7288' : '#9ca3af'}
            style={[styles.field, inputColors]}
            editable={!busy}
          />

          <Text
            style={[
              styles.preview,
              {
                color: isDark ? nrmTokens.color.bodyMuted : nrmTokens.color.inkMuted48,
              },
            ]}
            numberOfLines={2}>
            파일명: {preview}
          </Text>

          <View style={styles.actions}>
            <Pressable
              onPress={onClose}
              style={({ pressed }) => [
                styles.btnSecondary,
                {
                  borderColor: isDark ? nrmTokens.color.borderOnDark : nrmTokens.color.hairline,
                  transform: pressed ? [{ scale: 0.98 }] : undefined,
                },
              ]}>
              <Text style={{ color: isDark ? nrmTokens.color.bodyOnDark : nrmTokens.color.ink }}>
                취소
              </Text>
            </Pressable>

            <Pressable
              onPress={() => {
                if (!item || !canSubmit) return;
                const metadata: NrmAudioFileMetadata = {
                  artist: artist.trim(),
                  title: title.trim(),
                  album: album.trim(),
                  genre: genre.trim(),
                  releaseDate: releaseDate.trim(),
                  coverUrl: coverUrl.trim(),
                  albumArtist: albumArtist.trim() || undefined,
                  trackNumber: trackNumber.trim() || undefined,
                  discNumber: discNumber.trim() || undefined,
                  composer: composer.trim() || undefined,
                  lyrics: lyrics.trim() || undefined,
                  bpm: bpm.trim() || undefined,
                  copyright: copyright.trim() || undefined,
                  website: website.trim() || undefined,
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
              }}
              disabled={!canSubmit}
              style={({ pressed }) => [
                styles.btnPrimary,
                !canSubmit && styles.btnDisabled,
                pressed && canSubmit && styles.pressed,
              ]}>
              <Text style={styles.btnPrimaryLabel}>
                {Platform.OS === 'web' ? '저장 확인 후 받기' : '다운로드'}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    justifyContent: 'center',
    padding: nrmTokens.space.lg,
  },
  dim: { backgroundColor: 'rgba(0,0,0,0.45)' },
  card: {
    borderRadius: nrmTokens.radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: nrmTokens.space.lg,
    zIndex: 1,
  },
  heading: { fontSize: nrmTokens.font.tagline, fontWeight: '600', marginBottom: nrmTokens.space.xs },
  hint: { fontSize: nrmTokens.font.caption, marginBottom: nrmTokens.space.md, lineHeight: 20 },
  label: { fontSize: nrmTokens.font.caption, fontWeight: '600', marginBottom: nrmTokens.space.xs },
  field: {
    borderWidth: 1,
    borderRadius: nrmTokens.radius.md,
    paddingHorizontal: nrmTokens.space.md,
    paddingVertical: Platform.OS === 'ios' ? 12 : 10,
    fontSize: nrmTokens.font.body,
    marginBottom: nrmTokens.space.sm,
  },
  preview: { fontSize: nrmTokens.font.caption, marginTop: nrmTokens.space.sm, marginBottom: nrmTokens.space.lg },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: nrmTokens.space.sm, justifyContent: 'flex-end' },
  btnSecondary: {
    paddingVertical: 11,
    paddingHorizontal: 18,
    borderRadius: nrmTokens.radius.pill,
    borderWidth: 1,
  },
  btnPrimary: { paddingVertical: 11, paddingHorizontal: 22, borderRadius: nrmTokens.radius.pill, backgroundColor: nrmTokens.color.primary },
  btnDisabled: { opacity: 0.45 },
  pressed: { opacity: 0.92, transform: [{ scale: 0.98 }] },
  btnPrimaryLabel: { color: nrmTokens.color.onPrimary, fontSize: nrmTokens.font.body, fontWeight: '400' },
  coverPreviewWrap: {
    width: 92,
    height: 92,
    borderRadius: nrmTokens.radius.lg,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: nrmTokens.color.hairline,
  },
  coverPreview: { width: '100%', height: '100%' },
});

