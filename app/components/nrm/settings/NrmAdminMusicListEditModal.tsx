import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { NrmDiscoverFilterDropdown } from '@/components/nrm/discover/NrmDiscoverFilterDropdown';
import { nrmTokens } from '@/constants/nrmTokens';
import {
  deleteMusicListRowOnGithub,
  updateMusicListRowOnGithub,
} from '@/lib/nrmGithubMusicListAdmin';
import type { NrmMusicListItem } from '@/lib/nrmMusicListTypes';
import { NRM_MUSIC_LIST_GENRE_CUSTOM } from '@/lib/nrmMusicListTypes';
import { getNrmModalScrimColor } from '@/lib/nrmUiAppearanceColors';
import { notifyUserError } from '@/lib/nrmDevLog';
import { notifyUser } from '@/lib/nrmUserNotify';

type Props = {
  visible: boolean;
  item: NrmMusicListItem | null;
  genres: string[];
  titleColor: string;
  bodyColor: string;
  isDark: boolean;
  busy: boolean;
  onBusyChange: (busy: boolean) => void;
  onClose: () => void;
  onSaved: (item: NrmMusicListItem) => void;
  onDeleted: (id: number) => void;
};

function parsePositiveInt(raw: string, fallback: number): number {
  const n = Number.parseInt(raw.trim(), 10);
  return Number.isFinite(n) ? n : fallback;
}

export function NrmAdminMusicListEditModal({
  visible,
  item,
  genres,
  titleColor,
  bodyColor,
  isDark,
  busy,
  onBusyChange,
  onClose,
  onSaved,
  onDeleted,
}: Props) {
  const [rankText, setRankText] = useState('');
  const [yearText, setYearText] = useState('');
  const [artist, setArtist] = useState('');
  const [title, setTitle] = useState('');
  const [album, setAlbum] = useState('');
  const [genrePick, setGenrePick] = useState<string>(NRM_MUSIC_LIST_GENRE_CUSTOM);
  const [genreCustom, setGenreCustom] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const hairline = isDark ? nrmTokens.color.borderOnDark : nrmTokens.color.hairline;
  const surfaceBg = isDark ? nrmTokens.color.surfaceTile1 : nrmTokens.color.canvas;
  const modalScrim = getNrmModalScrimColor(isDark);

  const genreOptions = useMemo(
    () => [
      { value: NRM_MUSIC_LIST_GENRE_CUSTOM, label: '직접입력' },
      ...genres.map((g) => ({ value: g, label: g })),
    ],
    [genres],
  );

  useEffect(() => {
    if (!item || !visible) return;
    setRankText(String(item.rank));
    setYearText(String(item.year));
    setArtist(item.artist);
    setTitle(item.title);
    setAlbum(item.album);
    const inList = genres.includes(item.genre);
    setGenrePick(inList ? item.genre : NRM_MUSIC_LIST_GENRE_CUSTOM);
    setGenreCustom(inList ? '' : item.genre);
    setConfirmDelete(false);
  }, [item, visible, genres]);

  const resolvedGenre = genrePick === NRM_MUSIC_LIST_GENRE_CUSTOM ? genreCustom.trim() : genrePick;

  const handleSave = useCallback(async () => {
    if (!item || busy) return;
    if (!artist.trim() || !title.trim() || !resolvedGenre) {
      notifyUser('가수, 트랙, 장르는 필수입니다.');
      return;
    }
    onBusyChange(true);
    try {
      const next: NrmMusicListItem = {
        ...item,
        rank: parsePositiveInt(rankText, item.rank),
        year: parsePositiveInt(yearText, item.year),
        artist: artist.trim(),
        title: title.trim(),
        album: album.trim(),
        genre: resolvedGenre,
        updatedAt: new Date().toISOString(),
      };
      await updateMusicListRowOnGithub(next);
      notifyUser('저장했습니다.');
      onSaved(next);
      onClose();
    } catch (e) {
      notifyUserError('admin.musicList', e, '저장에 실패했습니다.');
    } finally {
      onBusyChange(false);
    }
  }, [
    item,
    busy,
    artist,
    title,
    album,
    resolvedGenre,
    rankText,
    yearText,
    onBusyChange,
    onSaved,
    onClose,
  ]);

  const handleDelete = useCallback(async () => {
    if (!item || busy) return;
    onBusyChange(true);
    try {
      await deleteMusicListRowOnGithub(item);
      notifyUser('삭제했습니다.');
      onDeleted(item.id);
      onClose();
    } catch (e) {
      notifyUserError('admin.musicList', e, '삭제에 실패했습니다.');
    } finally {
      onBusyChange(false);
      setConfirmDelete(false);
    }
  }, [item, busy, onBusyChange, onDeleted, onClose]);

  if (!item) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={[styles.scrim, { backgroundColor: modalScrim }]} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: surfaceBg, borderColor: hairline }]}
          onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <Text style={[styles.sheetTitle, { color: titleColor }]}>음악 수정</Text>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="닫기">
              <Ionicons name="close" size={22} color={bodyColor} />
            </Pressable>
          </View>

          <ScrollView style={styles.formScroll} keyboardShouldPersistTaps="handled">
            <Text style={[styles.fieldLabel, { color: bodyColor }]}>ID</Text>
            <Text style={[styles.readOnly, { color: titleColor }]}>{item.id}</Text>

            {item.updatedAt ? (
              <>
                <Text style={[styles.fieldLabel, { color: bodyColor }]}>수정일</Text>
                <Text style={[styles.readOnly, { color: titleColor }]}>
                  {item.updatedAt.replace('T', ' ').slice(0, 19)}
                </Text>
              </>
            ) : null}

            <Text style={[styles.fieldLabel, { color: bodyColor }]}>순위</Text>
            <TextInput
              value={rankText}
              onChangeText={setRankText}
              keyboardType="number-pad"
              style={[styles.input, { color: titleColor, borderColor: hairline }]}
            />

            <Text style={[styles.fieldLabel, { color: bodyColor }]}>연도</Text>
            <TextInput
              value={yearText}
              onChangeText={setYearText}
              keyboardType="number-pad"
              style={[styles.input, { color: titleColor, borderColor: hairline }]}
            />

            <Text style={[styles.fieldLabel, { color: bodyColor }]}>가수</Text>
            <TextInput
              value={artist}
              onChangeText={setArtist}
              style={[styles.input, { color: titleColor, borderColor: hairline }]}
            />

            <Text style={[styles.fieldLabel, { color: bodyColor }]}>트랙</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              style={[styles.input, { color: titleColor, borderColor: hairline }]}
            />

            <Text style={[styles.fieldLabel, { color: bodyColor }]}>앨범</Text>
            <TextInput
              value={album}
              onChangeText={setAlbum}
              style={[styles.input, { color: titleColor, borderColor: hairline }]}
            />

            <Text style={[styles.fieldLabel, { color: bodyColor }]}>장르</Text>
            <NrmDiscoverFilterDropdown
              label="장르"
              value={genrePick}
              options={genreOptions}
              onChange={setGenrePick}
              isDark={isDark}
              titleColor={titleColor}
              bodyColor={bodyColor}
            />
            {genrePick === NRM_MUSIC_LIST_GENRE_CUSTOM ? (
              <TextInput
                value={genreCustom}
                onChangeText={setGenreCustom}
                placeholder="장르 직접 입력"
                placeholderTextColor={isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)'}
                style={[styles.input, { color: titleColor, borderColor: hairline, marginTop: nrmTokens.space.sm }]}
              />
            ) : null}
          </ScrollView>

          <View style={styles.actions}>
            {confirmDelete ? (
              <View style={styles.deleteConfirmRow}>
                <Text style={[styles.deleteConfirmText, { color: bodyColor }]}>정말 삭제할까요?</Text>
                <Pressable
                  onPress={handleDelete}
                  disabled={busy}
                  style={({ pressed }) => [
                    styles.deleteBtn,
                    pressed && { opacity: 0.85 },
                    busy && styles.btnDisabled,
                  ]}>
                  {busy ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.deleteBtnText}>삭제 확인</Text>
                  )}
                </Pressable>
                <Pressable
                  onPress={() => setConfirmDelete(false)}
                  disabled={busy}
                  style={({ pressed }) => [styles.cancelBtn, { borderColor: hairline }, pressed && { opacity: 0.85 }]}>
                  <Text style={[styles.cancelBtnText, { color: titleColor }]}>취소</Text>
                </Pressable>
              </View>
            ) : (
              <>
                <Pressable
                  onPress={() => setConfirmDelete(true)}
                  disabled={busy}
                  style={({ pressed }) => [
                    styles.deleteOutlineBtn,
                    { borderColor: '#c0392b' },
                    pressed && { opacity: 0.85 },
                    busy && styles.btnDisabled,
                  ]}>
                  <Text style={styles.deleteOutlineText}>삭제</Text>
                </Pressable>
                <Pressable
                  onPress={handleSave}
                  disabled={busy}
                  style={({ pressed }) => [
                    styles.saveBtn,
                    pressed && { opacity: 0.9 },
                    busy && styles.btnDisabled,
                  ]}>
                  {busy ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.saveBtnText}>저장</Text>
                  )}
                </Pressable>
              </>
            )}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: nrmTokens.space.lg,
  },
  sheet: {
    maxHeight: '88%',
    borderRadius: nrmTokens.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: nrmTokens.space.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: nrmTokens.space.sm,
  },
  sheetTitle: {
    fontSize: nrmTokens.font.body,
    fontWeight: '700',
  },
  formScroll: {
    maxHeight: 420,
  },
  fieldLabel: {
    fontSize: nrmTokens.font.caption,
    marginTop: nrmTokens.space.sm,
    marginBottom: 4,
  },
  readOnly: {
    fontSize: nrmTokens.font.body,
    paddingVertical: 4,
  },
  input: {
    fontSize: nrmTokens.font.body,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: nrmTokens.radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 40,
  },
  actions: {
    marginTop: nrmTokens.space.md,
    gap: nrmTokens.space.sm,
  },
  saveBtn: {
    backgroundColor: nrmTokens.color.primary,
    borderRadius: nrmTokens.radius.md,
    paddingVertical: 12,
    alignItems: 'center',
  },
  saveBtnText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: nrmTokens.font.body,
  },
  deleteOutlineBtn: {
    borderRadius: nrmTokens.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 11,
    alignItems: 'center',
  },
  deleteOutlineText: {
    color: '#c0392b',
    fontWeight: '600',
    fontSize: nrmTokens.font.body,
  },
  deleteConfirmRow: {
    gap: nrmTokens.space.sm,
  },
  deleteConfirmText: {
    textAlign: 'center',
    fontSize: nrmTokens.font.body,
  },
  deleteBtn: {
    backgroundColor: '#c0392b',
    borderRadius: nrmTokens.radius.md,
    paddingVertical: 12,
    alignItems: 'center',
  },
  deleteBtnText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: nrmTokens.font.body,
  },
  cancelBtn: {
    borderRadius: nrmTokens.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 11,
    alignItems: 'center',
  },
  cancelBtnText: {
    fontWeight: '500',
    fontSize: nrmTokens.font.body,
  },
  btnDisabled: { opacity: 0.55 },
});
