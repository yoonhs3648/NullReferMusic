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

import { nrmTokens } from '@/constants/nrmTokens';
import {
  loadStoredSafGrant,
  requestNewSafDirUri,
  safUriToDisplayPath,
} from '@/lib/nrmDownloadSafGrant';

const PANEL_INPUT_BORDER = Platform.OS === 'web' ? StyleSheet.hairlineWidth : 1;

type Props = {
  titleColor: string;
  bodyColor: string;
  onBack: () => void;
};

export function NrmDownloadSettingsPanel({
  titleColor,
  bodyColor,
  onBack,
}: Props) {
  const [dirUri, setDirUri] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    loadStoredSafGrant()
      .then((uri) => {
        setDirUri(uri);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  const handlePickFolder = useCallback(async () => {
    setPicking(true);
    try {
      const uri = await requestNewSafDirUri('NullReferenceMusic');
      if (uri) setDirUri(uri);
    } finally {
      setPicking(false);
    }
  }, []);

  const displayPath = dirUri ? safUriToDisplayPath(dirUri) : null;

  return (
    <>
      {/* 뒤로 */}
      <Pressable
        onPress={onBack}
        style={styles.backRow}
        accessibilityRole="button"
        accessibilityLabel="뒤로">
        <Ionicons name="chevron-back" size={22} color={nrmTokens.color.primary} />
        <Text style={styles.backText}>뒤로</Text>
      </Pressable>

      <Text style={[styles.panelTitle, { color: titleColor }]}>다운로드 경로 설정</Text>

      {/* 다운로드 경로 섹션 */}
      <Text style={[styles.sectionLabel, { color: bodyColor }]}>다운로드 경로</Text>

      <View style={[styles.sectionCard, { borderColor: 'rgba(128,128,128,0.28)' }]}>
        {/* 경로 설정 버튼 */}
        <Pressable
          onPress={() => void handlePickFolder()}
          disabled={picking}
          style={({ pressed }) => [
            styles.pickBtn,
            { borderColor: 'rgba(0,102,204,0.35)', backgroundColor: 'rgba(0,102,204,0.06)' },
            picking && styles.pickBtnDisabled,
            pressed && !picking && styles.pickBtnPressed,
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

        {/* 선택된 경로 표시 */}
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
  sectionLabel: {
    fontSize: nrmTokens.font.caption,
    fontWeight: '500',
    marginBottom: nrmTokens.space.xs,
    letterSpacing: 0.2,
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
  pickBtnPressed: {
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
  guideText: {
    fontSize: nrmTokens.font.finePrint ?? nrmTokens.font.caption,
    lineHeight: 18,
    fontWeight: '400',
    opacity: 0.75,
  },
});
