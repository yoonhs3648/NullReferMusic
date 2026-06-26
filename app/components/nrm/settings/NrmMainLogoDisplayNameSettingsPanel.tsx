import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { nrmTokens } from '@/constants/nrmTokens';
import {
  NRM_API_SETTINGS_SAVED_MESSAGE,
  NRM_API_SETTINGS_UNSAVED_CONFIRM,
  NRM_API_SETTINGS_UNSAVED_CONFIRM_MESSAGE,
} from '@/lib/nrmApiSettingsUi';
import { notifyUserError } from '@/lib/nrmDevLog';
import {
  getNrmMainLogoDefaultDisplayName,
  loadMainLogoDisplayNameOverride,
  saveMainLogoDisplayNameOverride,
  validateMainLogoDisplayNameInput,
} from '@/lib/nrmMainLogoDisplayNameSettings';
import { confirmUser, notifyUser } from '@/lib/nrmUserNotify';

const PANEL_INPUT_BORDER = Platform.OS === 'web' ? StyleSheet.hairlineWidth : 1;

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

function effectiveNameFromOverride(override: string | null): string {
  return override ?? getNrmMainLogoDefaultDisplayName();
}

export function NrmMainLogoDisplayNameSettingsPanel({
  titleColor,
  bodyColor,
  rowHover,
  onBack,
  onCloseDrawer,
  registerBackHandler,
  registerDrawerDismiss,
}: Props) {
  const defaultName = getNrmMainLogoDefaultDisplayName();
  const [draft, setDraft] = useState(defaultName);
  const [savedOverride, setSavedOverride] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const savedEffective = useMemo(
    () => effectiveNameFromOverride(savedOverride),
    [savedOverride],
  );

  const isDirty = useMemo(() => draft.trim() !== savedEffective, [draft, savedEffective]);

  const validationHint = useMemo(() => validateMainLogoDisplayNameInput(draft), [draft]);

  const canSave = isDirty && !validationHint && !saving;

  useEffect(() => {
    let cancelled = false;
    void loadMainLogoDisplayNameOverride().then((override) => {
      if (cancelled) return;
      setSavedOverride(override);
      setDraft(effectiveNameFromOverride(override));
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const restoreDraft = useCallback(() => {
    setDraft(savedEffective);
  }, [savedEffective]);

  const persistDraft = useCallback(async (): Promise<boolean> => {
    const validationError = validateMainLogoDisplayNameInput(draft);
    if (validationError) {
      notifyUser(validationError);
      return false;
    }
    const trimmed = draft.trim();
    const override = trimmed === defaultName ? null : trimmed;
    await saveMainLogoDisplayNameOverride(override);
    setSavedOverride(override);
    setDraft(effectiveNameFromOverride(override));
    return true;
  }, [defaultName, draft]);

  const handleSave = useCallback(async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const saved = await persistDraft();
      if (saved) void notifyUser(NRM_API_SETTINGS_SAVED_MESSAGE);
    } catch (e) {
      notifyUserError('settings.mainLogoDisplayNameSave', e, '저장하지 못했습니다.');
    } finally {
      setSaving(false);
    }
  }, [canSave, persistDraft]);

  const handleReset = useCallback(async () => {
    setSaving(true);
    try {
      await saveMainLogoDisplayNameOverride(null);
      setSavedOverride(null);
      setDraft(defaultName);
    } catch (e) {
      notifyUserError('settings.mainLogoDisplayNameReset', e, '초기화하지 못했습니다.');
    } finally {
      setSaving(false);
    }
  }, [defaultName]);

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
          const saved = await persistDraft();
          if (!saved) return;
          void notifyUser(NRM_API_SETTINGS_SAVED_MESSAGE);
        } catch (e) {
          notifyUserError('settings.mainLogoDisplayNameSave', e, '저장하지 못했습니다.');
          return;
        } finally {
          setSaving(false);
        }
      } else {
        restoreDraft();
      }
      if (target === 'settings') onBack();
      else onCloseDrawer?.();
    },
    [isDirty, onBack, onCloseDrawer, persistDraft, restoreDraft],
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

  const inputBg = 'rgba(128,128,128,0.08)';
  const inputBorder = 'rgba(128,128,128,0.4)';

  if (loading) {
    return (
      <View style={styles.root}>
        <MenuBackRow onPress={() => void handleLeave('settings')} />
        <Text style={[styles.fieldTitle, { color: titleColor }]}>앱 이름</Text>
        <ActivityIndicator color={nrmTokens.color.primary} style={styles.loader} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <MenuBackRow onPress={() => void handleLeave('settings')} />
      <Text style={[styles.fieldTitle, { color: titleColor }]}>앱 이름</Text>
      <TextInput
        value={draft}
        onChangeText={setDraft}
        placeholder={defaultName}
        placeholderTextColor={bodyColor}
        style={[
          styles.input,
          {
            color: titleColor,
            borderColor: inputBorder,
            backgroundColor: inputBg,
          },
        ]}
        autoCapitalize="words"
        autoCorrect={false}
        editable={!saving}
      />

      {validationHint === '앱이름이 너무 길어요' ? (
        <Text style={styles.validationHint}>{validationHint}</Text>
      ) : null}

      <View style={styles.footer}>
        <Pressable
          onPress={() => void handleReset()}
          disabled={saving}
          style={({ pressed }) => [
            styles.resetBtn,
            saving && styles.resetBtnDisabled,
            pressed && !saving && { backgroundColor: rowHover },
          ]}
          accessibilityRole="button"
          accessibilityLabel="초기화">
          <Text style={[styles.resetBtnLabel, { color: nrmTokens.color.primary }]}>초기화</Text>
        </Pressable>
        <Pressable
          onPress={() => void handleSave()}
          disabled={!canSave}
          style={({ pressed }) => [
            styles.saveBtn,
            !canSave && styles.saveBtnDisabled,
            pressed && canSave && styles.saveBtnPressed,
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
  fieldTitle: {
    fontSize: nrmTokens.font.lead,
    fontWeight: '600',
    marginBottom: nrmTokens.space.sm,
    letterSpacing: -0.4,
  },
  input: {
    borderWidth: PANEL_INPUT_BORDER,
    borderRadius: nrmTokens.radius.lg,
    paddingHorizontal: nrmTokens.space.md,
    paddingVertical: Platform.OS === 'ios' ? 12 : 10,
    fontSize: nrmTokens.font.body,
    minHeight: nrmTokens.layout.touchMin,
  },
  loader: { marginVertical: nrmTokens.space.lg },
  validationHint: {
    color: '#c62828',
    fontSize: nrmTokens.font.caption,
    marginTop: nrmTokens.space.sm,
  },
  footer: {
    marginTop: nrmTokens.space.lg,
    paddingBottom: nrmTokens.space.xs,
    gap: nrmTokens.space.sm,
  },
  resetBtn: {
    borderRadius: nrmTokens.radius.md,
    borderWidth: PANEL_INPUT_BORDER,
    borderColor: 'rgba(128,128,128,0.35)',
    paddingVertical: nrmTokens.space.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resetBtnDisabled: { opacity: 0.45 },
  resetBtnLabel: {
    fontSize: nrmTokens.font.body,
    fontWeight: '600',
  },
  saveBtn: {
    backgroundColor: nrmTokens.color.primary,
    borderRadius: nrmTokens.radius.md,
    paddingVertical: nrmTokens.space.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnDisabled: { opacity: 0.45 },
  saveBtnPressed: { opacity: 0.92 },
  saveBtnLabel: {
    color: nrmTokens.color.onPrimary,
    fontSize: nrmTokens.font.body,
    fontWeight: '600',
  },
});
