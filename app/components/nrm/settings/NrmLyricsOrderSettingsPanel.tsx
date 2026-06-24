import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { nrmTokens } from '@/constants/nrmTokens';
import {
  NRM_API_SETTINGS_SAVED_MESSAGE,
  NRM_API_SETTINGS_UNSAVED_CONFIRM,
  NRM_API_SETTINGS_UNSAVED_CONFIRM_MESSAGE,
} from '@/lib/nrmApiSettingsUi';
import {
  DEFAULT_NRM_LYRICS_MODE_ORDER,
  loadLyricsModeOrder,
  lyricsModeOrdersEqual,
  NRM_LYRICS_MODE_LABELS,
  saveLyricsModeOrder,
  type NrmLyricsModeOrderId,
} from '@/lib/nrmLyricsOrderSettings';
import { notifyUserError } from '@/lib/nrmDevLog';
import { confirmUser, notifyUser } from '@/lib/nrmUserNotify';

const PANEL_INPUT_BORDER = Platform.OS === 'web' ? StyleSheet.hairlineWidth : 1;
const ROW_HEIGHT = 56;

type Props = {
  titleColor: string;
  bodyColor: string;
  rowHover: string;
  onBack: () => void;
  onCloseDrawer?: () => void;
  registerBackHandler?: (handler: (() => boolean) | null) => void;
  registerDrawerDismiss?: (handler: (() => void) | null) => void;
};

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

function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) {
    return [...list];
  }
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}

export function NrmLyricsOrderSettingsPanel({
  titleColor,
  bodyColor,
  rowHover,
  onBack,
  onCloseDrawer,
  registerBackHandler,
  registerDrawerDismiss,
}: Props) {
  const [order, setOrder] = useState<NrmLyricsModeOrderId[]>([...DEFAULT_NRM_LYRICS_MODE_ORDER]);
  const [savedOrder, setSavedOrder] = useState<NrmLyricsModeOrderId[]>([
    ...DEFAULT_NRM_LYRICS_MODE_ORDER,
  ]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const isDirty = useMemo(
    () => !lyricsModeOrdersEqual(order, savedOrder),
    [order, savedOrder],
  );

  useEffect(() => {
    let cancelled = false;
    void loadLyricsModeOrder().then((next) => {
      if (cancelled) return;
      setOrder(next);
      setSavedOrder(next);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const restoreOrder = useCallback(() => {
    setOrder([...savedOrder]);
  }, [savedOrder]);

  const handleSave = useCallback(async () => {
    if (!isDirty) return;
    setSaving(true);
    try {
      await saveLyricsModeOrder(order);
      setSavedOrder([...order]);
      void notifyUser(NRM_API_SETTINGS_SAVED_MESSAGE);
    } catch (e) {
      notifyUserError('settings.lyricsOrderSave', e, '저장하지 못했습니다.');
    } finally {
      setSaving(false);
    }
  }, [isDirty, order]);

  const handleLeave = useCallback(
    async (target: 'settings' | 'closeDrawer') => {
      if (!isDirty) {
        if (target === 'settings') onBack();
        else onCloseDrawer?.();
        return;
      }
      const save = await confirmUser(
        NRM_API_SETTINGS_UNSAVED_CONFIRM_MESSAGE,
        NRM_API_SETTINGS_UNSAVED_CONFIRM,
      );
      if (save) {
        setSaving(true);
        try {
          await saveLyricsModeOrder(order);
          setSavedOrder([...order]);
          void notifyUser(NRM_API_SETTINGS_SAVED_MESSAGE);
        } catch (e) {
          notifyUserError('settings.lyricsOrderSave', e, '저장하지 못했습니다.');
          return;
        } finally {
          setSaving(false);
        }
      } else {
        restoreOrder();
      }
      if (target === 'settings') onBack();
      else onCloseDrawer?.();
    },
    [isDirty, onBack, onCloseDrawer, order, restoreOrder],
  );

  useEffect(() => {
    registerBackHandler?.(() => {
      if (isDirty) {
        void handleLeave('settings');
        return true;
      }
      return false;
    });
    return () => registerBackHandler?.(null);
  }, [handleLeave, isDirty, registerBackHandler]);

  useEffect(() => {
    registerDrawerDismiss?.(() => {
      void handleLeave('closeDrawer');
    });
    return () => registerDrawerDismiss?.(null);
  }, [handleLeave, registerDrawerDismiss]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (isDirty) {
        void handleLeave('settings');
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [handleLeave, isDirty]);

  const moveByIndex = useCallback((from: number, to: number) => {
    setOrder((prev) => moveItem(prev, from, to));
  }, []);

  if (loading) {
    return (
      <View style={styles.root}>
        <MenuBackRow onPress={() => void handleLeave('settings')} />
        <Text style={[styles.panelTitle, { color: titleColor }]}>가사 설정</Text>
        <ActivityIndicator color={nrmTokens.color.primary} style={styles.loader} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <MenuBackRow onPress={() => void handleLeave('settings')} />
      <Text style={[styles.panelTitle, { color: titleColor }]}>가사 설정</Text>
      <View style={styles.list}>
        {order.map((id, index) => {
          const isDefault = index === 0;
          return (
            <View
              key={id}
              style={[
                styles.row,
                {
                  borderColor: 'rgba(128,128,128,0.28)',
                  backgroundColor:
                    Platform.OS === 'web' ? 'rgba(255,255,255,0.02)' : 'transparent',
                },
              ]}>
              <View style={styles.labelBlock}>
                <Text style={[styles.rowLabel, { color: titleColor }]}>
                  {NRM_LYRICS_MODE_LABELS[id]}
                </Text>
                {isDefault ? (
                  <Text style={[styles.defaultBadge, { color: nrmTokens.color.primary }]}>
                    기본값
                  </Text>
                ) : null}
              </View>
              <View style={styles.moveBtns}>
                <Pressable
                  onPress={() => moveByIndex(index, index - 1)}
                  disabled={index === 0 || saving}
                  style={({ pressed }) => [
                    styles.moveBtn,
                    (index === 0 || saving) && styles.moveBtnDisabled,
                    pressed && index > 0 && !saving && { backgroundColor: rowHover },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="위로">
                  <Ionicons
                    name="chevron-up"
                    size={18}
                    color={index === 0 ? 'rgba(128,128,128,0.35)' : titleColor}
                  />
                </Pressable>
                <Pressable
                  onPress={() => moveByIndex(index, index + 1)}
                  disabled={index === order.length - 1 || saving}
                  style={({ pressed }) => [
                    styles.moveBtn,
                    (index === order.length - 1 || saving) && styles.moveBtnDisabled,
                    pressed && index < order.length - 1 && !saving && { backgroundColor: rowHover },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="아래로">
                  <Ionicons
                    name="chevron-down"
                    size={18}
                    color={
                      index === order.length - 1 ? 'rgba(128,128,128,0.35)' : titleColor
                    }
                  />
                </Pressable>
              </View>
            </View>
          );
        })}
      </View>
      <View style={styles.footer}>
        <Pressable
          onPress={() => void handleSave()}
          disabled={!isDirty || saving}
          style={({ pressed }) => [
            styles.saveBtn,
            (!isDirty || saving) && styles.saveBtnDisabled,
            pressed && isDirty && !saving && styles.saveBtnPressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel="저장">
          {saving ? (
            <ActivityIndicator color={nrmTokens.color.onPrimary} />
          ) : (
            <Text style={styles.saveBtnLabel}>저장</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: 0 },
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
  loader: { marginVertical: nrmTokens.space.lg },
  list: { gap: nrmTokens.space.sm, paddingBottom: nrmTokens.space.md },
  row: {
    minHeight: ROW_HEIGHT,
    borderRadius: nrmTokens.radius.lg,
    borderWidth: PANEL_INPUT_BORDER,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: nrmTokens.space.sm,
    gap: nrmTokens.space.sm,
  },
  labelBlock: { flex: 1, gap: 2 },
  rowLabel: { fontSize: nrmTokens.font.body, fontWeight: '600' },
  defaultBadge: { fontSize: nrmTokens.font.caption, fontWeight: '600' },
  moveBtns: { flexDirection: 'row', gap: 4 },
  moveBtn: {
    width: 34,
    height: 34,
    borderRadius: nrmTokens.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(128,128,128,0.35)',
  },
  moveBtnDisabled: { opacity: 0.45 },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(128,128,128,0.25)',
    paddingTop: nrmTokens.space.md,
    paddingBottom: nrmTokens.space.xs,
    marginTop: 'auto',
  },
  saveBtn: {
    backgroundColor: nrmTokens.color.primary,
    borderRadius: nrmTokens.radius.md,
    paddingVertical: nrmTokens.space.md,
    alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.45 },
  saveBtnPressed: { opacity: 0.92 },
  saveBtnLabel: {
    color: nrmTokens.color.onPrimary,
    fontSize: nrmTokens.font.body,
    fontWeight: '600',
  },
});
