/**
 * AI Lab — 음악 검색 플랫폼 선택 모달.
 * 목록은 전체 표시. 이번 버전은 Melon만 선택 가능(회색=비활성).
 */

import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import { nrmTokens } from '@/constants/nrmTokens';
import {
  getAiLabMusicPlatformLabel,
  listAiLabMusicPlatformRows,  loadAiLabMusicPlatformAvailabilityMap,
  type MusicPlatformId,
} from '@/lib/nrmAiLabMusicPlatform';
import { getNrmModalScrimColor } from '@/lib/nrmUiAppearanceColors';

type Props = {
  visible: boolean;
  isDark: boolean;
  value: MusicPlatformId;
  onChange: (id: MusicPlatformId) => void;
  onClose: () => void;
};

const HEADER_HEIGHT = 52;

export function NrmAiLabMusicPlatformPickerModal({
  visible,
  isDark,
  value,
  onChange,
  onClose,
}: Props) {
  const { height: windowHeight } = useWindowDimensions();
  const [loading, setLoading] = useState(false);
  const [available, setAvailable] = useState<Record<string, boolean>>({});

  const titleColor = isDark ? nrmTokens.color.bodyOnDark : nrmTokens.color.ink;
  const bodyColor = isDark ? nrmTokens.color.textMuted : nrmTokens.color.inkMuted80;
  const hairline = isDark ? nrmTokens.color.borderOnDark : nrmTokens.color.hairline;
  const sheetBg = isDark ? nrmTokens.color.surfaceTile2 : nrmTokens.color.canvas;
  const rowHover = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)';
  const selectedBg = isDark ? 'rgba(0,102,204,0.22)' : 'rgba(0,102,204,0.10)';

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setAvailable(await loadAiLabMusicPlatformAvailabilityMap());
    } catch {
      setAvailable({});
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (visible) void refresh();
  }, [visible, refresh]);

  const rows = listAiLabMusicPlatformRows();
  const sheetMaxH = Math.min(windowHeight * 0.72, 560);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[styles.scrim, { backgroundColor: getNrmModalScrimColor(isDark) }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="닫기" />
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: sheetBg,
              maxHeight: sheetMaxH,
              borderColor: hairline,
            },
          ]}>
          <View style={[styles.header, { borderBottomColor: hairline }]}>
            <Text style={[styles.headerTitle, { color: titleColor }]}>플랫폼 선택</Text>
            <Pressable
              onPress={onClose}
              style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.7 }]}
              accessibilityRole="button"
              accessibilityLabel="닫기">
              <Ionicons name="close" size={22} color={bodyColor} />
            </Pressable>
          </View>

          {loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator color={nrmTokens.color.primary} />
            </View>
          ) : (
            <ScrollView
              style={styles.list}
              contentContainerStyle={styles.listContent}
              keyboardShouldPersistTaps="handled">
              <Text style={[styles.hint, { color: bodyColor }]}>
                곡 검색·다운로드 플랫폼입니다. 이번 버전에서는 Melon만 선택할 수 있습니다.
              </Text>
              {rows.map((row) => {
                const ok = available[row.id] === true;
                const selected = value === row.id;
                return (
                  <Pressable
                    key={row.id}
                    disabled={!ok}
                    onPress={() => {
                      if (!ok) return;
                      onChange(row.id);
                      onClose();
                    }}
                    style={({ pressed }) => [
                      styles.row,
                      { borderColor: hairline },
                      selected && ok && { backgroundColor: selectedBg },
                      !ok && styles.rowDisabled,
                      ok && pressed && { backgroundColor: rowHover },
                    ]}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: !ok, selected: selected && ok }}
                    accessibilityLabel={row.label}>
                    <View style={styles.rowText}>
                      <Text
                        style={[
                          styles.rowLabel,
                          { color: ok ? titleColor : bodyColor },
                          !ok && styles.rowLabelDisabled,
                        ]}>
                        {row.label}
                      </Text>
                      {!ok ? (
                        <Text style={[styles.rowSub, { color: bodyColor }]}>
                          이번 버전 미지원
                        </Text>
                      ) : null}
                    </View>
                    {selected && ok ? (
                      <Ionicons name="checkmark" size={20} color={nrmTokens.color.primary} />
                    ) : ok ? (
                      <Ionicons name="chevron-forward" size={18} color={bodyColor} />
                    ) : (
                      <Ionicons name="lock-closed-outline" size={16} color={bodyColor} />
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

/** 메뉴 행에 표시할 현재 플랫폼 라벨 */
export function aiLabMusicPlatformMenuSubtitle(id: MusicPlatformId): string {
  return getAiLabMusicPlatformLabel(id);
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: nrmTokens.space.lg,
  },
  sheet: {
    borderRadius: nrmTokens.radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.2,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 8 },
      },
      android: { elevation: 8 },
      default: {},
    }),
  },
  header: {
    height: HEADER_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: nrmTokens.space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: {
    fontSize: nrmTokens.font.bodyStrong,
    fontWeight: '700',
  },
  closeBtn: {
    padding: 6,
  },
  loadingBox: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  list: {
    flexGrow: 0,
  },
  listContent: {
    padding: nrmTokens.space.md,
    gap: nrmTokens.space.sm,
    paddingBottom: nrmTokens.space.lg,
  },
  hint: {
    fontSize: nrmTokens.font.caption,
    lineHeight: 18,
    marginBottom: 4,
  },
  row: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: nrmTokens.space.sm,
    paddingHorizontal: nrmTokens.space.md,
    paddingVertical: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: nrmTokens.radius.md,
  },
  rowDisabled: {
    opacity: 0.45,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  rowLabel: {
    fontSize: nrmTokens.font.body,
    fontWeight: '600',
  },
  rowLabelDisabled: {
    fontWeight: '500',
  },
  rowSub: {
    fontSize: 11,
    lineHeight: 14,
  },
});
