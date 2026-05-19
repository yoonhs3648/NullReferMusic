import { useEffect, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { nrmTokens } from '@/constants/nrmTokens';
import {
  buildAudioFileName,
  buildMp3FileName,
  guessInitialDownloadFields,
} from '@/lib/nrmYoutubeDownloadMeta';
import type { YoutubeSearchItem } from '@/lib/youtubeSearchClient';

type Props = {
  visible: boolean;
  item: YoutubeSearchItem | null;
  isDark: boolean;
  onClose: () => void;
  onConfirm: (videoId: string, fileName: string) => void;
};

export function NrmDownloadModal({
  visible,
  item,
  isDark,
  onClose,
  onConfirm,
}: Props) {
  const [artist, setArtist] = useState('');
  const [title, setTitle] = useState('');

  useEffect(() => {
    if (item && visible) {
      const fields = guessInitialDownloadFields(item);
      setArtist(fields.artist);
      setTitle(fields.title);
    }
  }, [item, visible]);

  const preview = buildMp3FileName(artist, title);

  const inputColors = {
    backgroundColor: isDark ? nrmTokens.color.surfaceTile2 : nrmTokens.color.canvas,
    color: isDark ? nrmTokens.color.bodyOnDark : nrmTokens.color.ink,
    borderColor: isDark ? nrmTokens.color.borderOnDark : 'rgba(0, 0, 0, 0.08)',
  };

  const canSubmit = !!item && artist.trim().length > 0 && title.trim().length > 0;

  const confirmDownload = () => {
    if (!item || !canSubmit) return;
    onConfirm(
      item.videoId,
      Platform.OS === 'web'
        ? buildMp3FileName(artist, title)
        : buildAudioFileName(artist, title, '.m4a'),
    );
  };

  return (
    <Modal
      visible={visible && !!item}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent>
      <View style={styles.wrap}>
        <Pressable
          style={[StyleSheet.absoluteFill, styles.dim]}
          onPress={onClose}
          accessibilityLabel="닫기"
        />
        <View
          style={[
            styles.card,
            {
              backgroundColor: isDark
                ? nrmTokens.color.surfaceTile1
                : nrmTokens.color.canvas,
              borderColor: isDark
                ? nrmTokens.color.borderOnDark
                : nrmTokens.color.hairline,
            },
          ]}>
          <Text
            style={[
              styles.heading,
              { color: isDark ? nrmTokens.color.bodyOnDark : nrmTokens.color.ink },
            ]}>
            {Platform.OS === 'web' ? 'MP3 저장 이름' : '오디오 저장 이름'}
          </Text>
          <Text
            style={[
              styles.hint,
              {
                color: isDark
                  ? nrmTokens.color.bodyMuted
                  : nrmTokens.color.inkMuted48,
              },
            ]}>
            유튜브 정보를 바탕으로 채웠습니다. 필요하면 수정하세요.
          </Text>

          <Text
            style={[
              styles.label,
              {
                color: isDark
                  ? nrmTokens.color.bodyMuted
                  : nrmTokens.color.inkMuted80,
              },
            ]}>
            가수
          </Text>
          <TextInput
            value={artist}
            onChangeText={setArtist}
            placeholder="가수"
            placeholderTextColor={isDark ? '#6b7288' : '#9ca3af'}
            style={[styles.field, inputColors]}
          />

          <Text
            style={[
              styles.label,
              {
                color: isDark
                  ? nrmTokens.color.bodyMuted
                  : nrmTokens.color.inkMuted80,
              },
            ]}>
            곡 제목
          </Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="곡 제목"
            placeholderTextColor={isDark ? '#6b7288' : '#9ca3af'}
            style={[styles.field, inputColors]}
          />

          <Text
            style={[
              styles.preview,
              {
                color: isDark
                  ? nrmTokens.color.bodyMuted
                  : nrmTokens.color.inkMuted48,
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
                  borderColor: isDark
                    ? nrmTokens.color.borderOnDark
                    : nrmTokens.color.hairline,
                },
                pressed && styles.pressed,
              ]}>
              <Text
                style={{
                  color: isDark ? nrmTokens.color.bodyOnDark : nrmTokens.color.ink,
                }}>
                취소
              </Text>
            </Pressable>
            <Pressable
              onPress={confirmDownload}
              disabled={!canSubmit}
              style={({ pressed }) => [
                styles.btnPrimary,
                !canSubmit && styles.btnDisabled,
                pressed && canSubmit && styles.pressed,
              ]}>
              <Text style={styles.btnPrimaryLabel}>
                {Platform.OS === 'web' ? '저장 위치 선택 후 받기' : '다운로드'}
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
  dim: {
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  card: {
    borderRadius: nrmTokens.radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: nrmTokens.space.lg,
    zIndex: 1,
  },
  heading: {
    fontSize: nrmTokens.font.tagline,
    fontWeight: '600',
    marginBottom: nrmTokens.space.xs,
  },
  hint: {
    fontSize: nrmTokens.font.caption,
    marginBottom: nrmTokens.space.md,
    lineHeight: 20,
  },
  label: {
    fontSize: nrmTokens.font.caption,
    fontWeight: '600',
    marginBottom: nrmTokens.space.xs,
  },
  field: {
    borderWidth: 1,
    borderRadius: nrmTokens.radius.md,
    paddingHorizontal: nrmTokens.space.md,
    paddingVertical: Platform.OS === 'ios' ? 12 : 10,
    fontSize: nrmTokens.font.body,
    marginBottom: nrmTokens.space.sm,
  },
  preview: {
    fontSize: nrmTokens.font.caption,
    marginTop: nrmTokens.space.sm,
    marginBottom: nrmTokens.space.lg,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: nrmTokens.space.sm,
    justifyContent: 'flex-end',
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
  btnDisabled: {
    opacity: 0.45,
  },
  pressed: {
    opacity: 0.92,
    transform: [{ scale: 0.98 }],
  },
  btnPrimaryLabel: {
    color: nrmTokens.color.onPrimary,
    fontSize: nrmTokens.font.body,
    fontWeight: '400',
  },
});
