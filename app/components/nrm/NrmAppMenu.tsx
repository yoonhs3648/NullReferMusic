import Ionicons from '@expo/vector-icons/Ionicons';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NrmMenuChartPanels } from '@/components/nrm/charts/NrmMenuChartPanels';
import { NrmMenuDrawerScroll } from '@/components/nrm/NrmMenuDrawerScroll';
import { NrmLogo } from '@/components/nrm/NrmLogo';
import { NrmSpotifyApiManagePanel } from '@/components/nrm/settings/NrmSpotifyApiManagePanel';
import {
  isChartMenuPanel,
  type ChartMenuPanel,
} from '@/lib/nrmChartsPlatforms';
import { nrmTokens } from '@/constants/nrmTokens';
import { useNrmUiAppearance } from '@/context/NrmUiAppearanceContext';
import {
  getNrmAppCopyrightNotice,
  getNrmAppVersionLabel,
  NRM_APP_AUTHOR_DISPLAY,
} from '@/lib/nrmAppInfo';
import {
  getReleaseNoteEntries,
  type ReleaseNoteEntry,
} from '@/lib/nrmReleaseNotes';
import {
  getYoutubeSearchSuffixMode,
  listYoutubeSearchSuffixModes,
  NRM_YOUTUBE_SEARCH_SUFFIX_LABELS,
  setYoutubeSearchSuffixMode,
  type NrmYoutubeSearchSuffixMode,
} from '@/lib/nrmYoutubeSearchSettings';

type Props = {
  isDark: boolean;
  paddingHorizontal: number;
};

type Panel =
  | 'root'
  | 'version'
  | 'releases'
  | 'releaseDetail'
  | 'settings'
  | 'appSettings'
  | 'searchSettings'
  | 'screenSettings'
  | 'spotifyApiManage'
  | ChartMenuPanel;

export function NrmAppMenu({ isDark, paddingHorizontal }: Props) {
  const { setAppearanceMode } = useNrmUiAppearance();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const drawerW = Math.min(380, windowWidth * 0.88);
  const translateX = useRef(new Animated.Value(0)).current;

  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<Panel>('root');
  const [detailEntry, setDetailEntry] = useState<ReleaseNoteEntry | null>(
    null,
  );
  const [suffixMode, setSuffixMode] =
    useState<NrmYoutubeSearchSuffixMode>('default');

  useEffect(() => {
    if (panel !== 'searchSettings') return;
    let cancelled = false;
    void getYoutubeSearchSuffixMode().then((m) => {
      if (!cancelled) setSuffixMode(m);
    });
    return () => {
      cancelled = true;
    };
  }, [panel]);

  const openMenu = useCallback(() => {
    setPanel('root');
    setDetailEntry(null);
    setOpen(true);
  }, []);

  const dismissDrawer = useCallback(() => {
    Animated.timing(translateX, {
      toValue: -drawerW,
      duration: 220,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setOpen(false);
        setPanel('root');
        setDetailEntry(null);
      }
    });
  }, [drawerW, translateX]);

  /** Android 하드웨어 뒤로: 하위 패널이면 한 단계 위로, 루트면 드로어 닫기 */
  const goBackInMenu = useCallback(() => {
    switch (panel) {
      case 'releaseDetail':
        setDetailEntry(null);
        setPanel('releases');
        break;
      case 'spotifyApiManage':
        setPanel('appSettings');
        break;
      case 'appSettings':
      case 'searchSettings':
      case 'screenSettings':
        setPanel('settings');
        break;
      case 'chartSpotify':
      case 'chartBillboard':
      case 'chartYoutubeMusic':
      case 'chartMelon':
      case 'chartGenie':
        setPanel('charts');
        break;
      case 'charts':
        setPanel('root');
        break;
      case 'version':
      case 'releases':
      case 'settings':
        setPanel('root');
        break;
      case 'root':
      default:
        dismissDrawer();
        break;
    }
  }, [panel, dismissDrawer]);

  useEffect(() => {
    if (!open) return;
    translateX.setValue(-drawerW);
    Animated.timing(translateX, {
      toValue: 0,
      duration: 260,
      useNativeDriver: true,
    }).start();
  }, [open, drawerW, translateX]);

  const cardBg = isDark ? nrmTokens.color.surfaceTile1 : nrmTokens.color.canvas;
  const cardBorder = isDark ? nrmTokens.color.borderOnDark : nrmTokens.color.hairline;
  const titleColor = isDark ? nrmTokens.color.bodyOnDark : nrmTokens.color.ink;
  const bodyColor = isDark ? nrmTokens.color.textMuted : nrmTokens.color.inkMuted80;
  const rowHover = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)';

  const entries = getReleaseNoteEntries();

  /** 네이티브: 본문과 동일하던 좌측 패딩의 절반 + safe area. 상단도 동일 여백 */
  const nativeHalfPad = paddingHorizontal / 2;
  /** 웹: 뷰포트 모서리에서 햄버거 버튼이 너무 붙지 않게 고정 여백 */
  const webMenuInset = Math.round(
    (nrmTokens.space.lg + nrmTokens.space.xs) / 2,
  );
  const menuLeft =
    Platform.OS === 'web'
      ? webMenuInset
      : insets.left + nativeHalfPad;
  const menuTop =
    Platform.OS === 'web'
      ? Math.max(insets.top, nrmTokens.space.sm) + webMenuInset
      : insets.top + nativeHalfPad;

  return (
    <>
      <Pressable
        onPress={openMenu}
        style={({ pressed }) => [
          styles.menuFab,
          {
            left: menuLeft,
            top: menuTop,
            backgroundColor: pressed
              ? isDark
                ? 'rgba(255,255,255,0.12)'
                : 'rgba(0,0,0,0.06)'
              : isDark
                ? 'rgba(255,255,255,0.08)'
                : 'rgba(0,0,0,0.04)',
          },
        ]}
        accessibilityRole="button"
        accessibilityLabel="메뉴">
        <Ionicons
          name="menu"
          size={26}
          color={isDark ? nrmTokens.color.bodyOnDark : nrmTokens.color.ink}
        />
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="none"
        onRequestClose={goBackInMenu}
        statusBarTranslucent>
        <View style={styles.modalWrap}>
          <Pressable
            style={[StyleSheet.absoluteFill, styles.dim]}
            onPress={dismissDrawer}
            accessibilityLabel="닫기"
          />
          <Animated.View
            style={[
              styles.drawer,
              {
                width: drawerW,
                backgroundColor: cardBg,
                borderColor: cardBorder,
                paddingTop: insets.top + nrmTokens.space.lg,
                paddingBottom: insets.bottom + 10,
                transform: [{ translateX }],
              },
            ]}
            accessibilityViewIsModal>
            {panel === 'root' ? (
              <DrawerShell titleColor={titleColor} onDismiss={dismissDrawer}>
                <View style={styles.menuLogoGap}>
                  <NrmLogo compact tone={isDark ? 'dark' : 'light'} />
                </View>
                <Pressable
                  onPress={() => setPanel('charts')}
                  style={({ pressed }) => [
                    styles.row,
                    pressed && { backgroundColor: rowHover },
                  ]}>
                  <Text style={[styles.rowLabel, { color: titleColor }]}>
                    실시간 차트
                  </Text>
                  <Ionicons
                    name="chevron-forward"
                    size={20}
                    color={bodyColor}
                  />
                </Pressable>
                <Pressable
                  onPress={() => setPanel('settings')}
                  style={({ pressed }) => [
                    styles.row,
                    pressed && { backgroundColor: rowHover },
                  ]}>
                  <Text style={[styles.rowLabel, { color: titleColor }]}>
                    설정
                  </Text>
                  <Ionicons
                    name="chevron-forward"
                    size={20}
                    color={bodyColor}
                  />
                </Pressable>
                <Pressable
                  onPress={() => setPanel('releases')}
                  style={({ pressed }) => [
                    styles.row,
                    pressed && { backgroundColor: rowHover },
                  ]}>
                  <Text style={[styles.rowLabel, { color: titleColor }]}>
                    릴리즈 노트
                  </Text>
                  <Ionicons
                    name="chevron-forward"
                    size={20}
                    color={bodyColor}
                  />
                </Pressable>
                <Pressable
                  onPress={() => setPanel('version')}
                  style={({ pressed }) => [
                    styles.row,
                    pressed && { backgroundColor: rowHover },
                  ]}>
                  <Text style={[styles.rowLabel, { color: titleColor }]}>
                    버전 정보
                  </Text>
                  <Ionicons
                    name="chevron-forward"
                    size={20}
                    color={bodyColor}
                  />
                </Pressable>
              </DrawerShell>
            ) : null}

            {panel === 'version' ? (
              <DrawerShell titleColor={titleColor} onDismiss={dismissDrawer}>
                <Pressable
                  onPress={() => setPanel('root')}
                  style={styles.backRow}
                  accessibilityRole="button"
                  accessibilityLabel="뒤로">
                  <Ionicons
                    name="chevron-back"
                    size={22}
                    color={nrmTokens.color.primary}
                  />
                  <Text style={styles.backText}>뒤로</Text>
                </Pressable>
                <Text style={[styles.panelTitle, { color: titleColor }]}>
                  버전 정보
                </Text>
                <Text style={[styles.versionLine, { color: bodyColor }]}>
                  {getNrmAppVersionLabel()}
                </Text>
                <View style={styles.versionMetaBlock}>
                  <Text
                    style={[styles.versionMetaText, { color: bodyColor }]}>
                    {getNrmAppCopyrightNotice()}
                  </Text>
                  <Text
                    style={[styles.versionMetaText, { color: bodyColor }]}>
                    제작 · {NRM_APP_AUTHOR_DISPLAY}
                  </Text>
                </View>
              </DrawerShell>
            ) : null}

            {panel === 'releases' ? (
              <DrawerShell titleColor={titleColor} onDismiss={dismissDrawer}>
                <Pressable
                  onPress={() => setPanel('root')}
                  style={styles.backRow}
                  accessibilityRole="button"
                  accessibilityLabel="뒤로">
                  <Ionicons
                    name="chevron-back"
                    size={22}
                    color={nrmTokens.color.primary}
                  />
                  <Text style={styles.backText}>뒤로</Text>
                </Pressable>
                <Text style={[styles.panelTitle, { color: titleColor }]}>
                  릴리즈 노트
                </Text>
                {entries.map((e) => (
                  <Pressable
                    key={e.version}
                    onPress={() => {
                      setDetailEntry(e);
                      setPanel('releaseDetail');
                    }}
                    style={({ pressed }) => [
                      styles.versionRow,
                      pressed && { backgroundColor: rowHover },
                    ]}>
                    <Text style={[styles.versionBadge, { color: titleColor }]}>
                      v{e.version}
                    </Text>
                    <Ionicons
                      name="chevron-forward"
                      size={18}
                      color={bodyColor}
                    />
                  </Pressable>
                ))}
              </DrawerShell>
            ) : null}

            {panel === 'releaseDetail' && detailEntry ? (
              <DrawerShell titleColor={titleColor} onDismiss={dismissDrawer}>
                <Pressable
                  onPress={() => {
                    setDetailEntry(null);
                    setPanel('releases');
                  }}
                  style={styles.backRow}
                  accessibilityRole="button"
                  accessibilityLabel="뒤로">
                  <Ionicons
                    name="chevron-back"
                    size={22}
                    color={nrmTokens.color.primary}
                  />
                  <Text style={styles.backText}>뒤로</Text>
                </Pressable>
                <Text style={[styles.panelTitle, { color: titleColor }]}>
                  v{detailEntry.version}
                </Text>
                {detailEntry.lines.map((line, i) => (
                  <Text
                    key={`${detailEntry.version}-${i}`}
                    style={[styles.bulletLine, { color: bodyColor }]}>
                    · {line}
                  </Text>
                ))}
              </DrawerShell>
            ) : null}

            {panel === 'settings' ? (
              <DrawerShell titleColor={titleColor} onDismiss={dismissDrawer}>
                <Pressable
                  onPress={() => setPanel('root')}
                  style={styles.backRow}
                  accessibilityRole="button"
                  accessibilityLabel="뒤로">
                  <Ionicons
                    name="chevron-back"
                    size={22}
                    color={nrmTokens.color.primary}
                  />
                  <Text style={styles.backText}>뒤로</Text>
                </Pressable>
                <Text style={[styles.panelTitle, { color: titleColor }]}>
                  설정
                </Text>
                <Pressable
                  onPress={() => setPanel('appSettings')}
                  style={({ pressed }) => [
                    styles.row,
                    pressed && { backgroundColor: rowHover },
                  ]}>
                  <Text style={[styles.rowLabel, { color: titleColor }]}>
                    앱 설정
                  </Text>
                  <Ionicons
                    name="chevron-forward"
                    size={20}
                    color={bodyColor}
                  />
                </Pressable>
                <Pressable
                  onPress={() => setPanel('searchSettings')}
                  style={({ pressed }) => [
                    styles.row,
                    pressed && { backgroundColor: rowHover },
                  ]}>
                  <Text style={[styles.rowLabel, { color: titleColor }]}>
                    검색 설정
                  </Text>
                  <Ionicons
                    name="chevron-forward"
                    size={20}
                    color={bodyColor}
                  />
                </Pressable>
                <Pressable
                  onPress={() => setPanel('screenSettings')}
                  style={({ pressed }) => [
                    styles.row,
                    pressed && { backgroundColor: rowHover },
                  ]}>
                  <Text style={[styles.rowLabel, { color: titleColor }]}>
                    화면 설정
                  </Text>
                  <Ionicons
                    name="chevron-forward"
                    size={20}
                    color={bodyColor}
                  />
                </Pressable>
              </DrawerShell>
            ) : null}

            {panel === 'appSettings' ? (
              <DrawerShell titleColor={titleColor} onDismiss={dismissDrawer}>
                <Pressable
                  onPress={() => setPanel('settings')}
                  style={styles.backRow}
                  accessibilityRole="button"
                  accessibilityLabel="뒤로">
                  <Ionicons
                    name="chevron-back"
                    size={22}
                    color={nrmTokens.color.primary}
                  />
                  <Text style={styles.backText}>뒤로</Text>
                </Pressable>
                <Text style={[styles.panelTitle, { color: titleColor }]}>
                  앱 설정
                </Text>
                <Pressable
                  onPress={() => setPanel('spotifyApiManage')}
                  style={({ pressed }) => [
                    styles.row,
                    pressed && { backgroundColor: rowHover },
                  ]}>
                  <Text style={[styles.rowLabel, { color: titleColor }]}>
                    Spotify API 토큰 관리
                  </Text>
                  <Ionicons
                    name="chevron-forward"
                    size={20}
                    color={bodyColor}
                  />
                </Pressable>
              </DrawerShell>
            ) : null}

            {panel === 'spotifyApiManage' ? (
              <DrawerShell titleColor={titleColor} onDismiss={dismissDrawer}>
                <NrmSpotifyApiManagePanel
                  titleColor={titleColor}
                  bodyColor={bodyColor}
                  rowHover={rowHover}
                  onBack={() => setPanel('appSettings')}
                />
              </DrawerShell>
            ) : null}

            {isChartMenuPanel(panel) ? (
              <DrawerShell titleColor={titleColor} onDismiss={dismissDrawer}>
                <NrmMenuChartPanels
                  panel={panel}
                  titleColor={titleColor}
                  bodyColor={bodyColor}
                  rowHover={rowHover}
                  onBackToRoot={() => setPanel('root')}
                  onBackToCharts={() => setPanel('charts')}
                  onOpenPlatform={(p) => setPanel(p)}
                />
              </DrawerShell>
            ) : null}

            {panel === 'searchSettings' ? (
              <DrawerShell titleColor={titleColor} onDismiss={dismissDrawer}>
                <Pressable
                  onPress={() => setPanel('settings')}
                  style={styles.backRow}
                  accessibilityRole="button"
                  accessibilityLabel="뒤로">
                  <Ionicons
                    name="chevron-back"
                    size={22}
                    color={nrmTokens.color.primary}
                  />
                  <Text style={styles.backText}>뒤로</Text>
                </Pressable>
                <Text style={[styles.panelTitle, { color: titleColor }]}>
                  검색 설정
                </Text>
                {listYoutubeSearchSuffixModes().map((mode) => {
                  const selected = suffixMode === mode;
                  return (
                    <Pressable
                      key={mode}
                      onPress={() => {
                        void setYoutubeSearchSuffixMode(mode).then(() => {
                          setSuffixMode(mode);
                        });
                      }}
                      style={({ pressed }) => [
                        styles.optionRow,
                        selected && styles.optionRowSelected,
                        pressed && { backgroundColor: rowHover },
                      ]}>
                      <Text
                        style={[styles.optionLabel, { color: titleColor }]}>
                        {NRM_YOUTUBE_SEARCH_SUFFIX_LABELS[mode]}
                      </Text>
                      <Ionicons
                        name={selected ? 'checkmark-circle' : 'ellipse-outline'}
                        size={22}
                        color={
                          selected ? nrmTokens.color.primary : bodyColor
                        }
                      />
                    </Pressable>
                  );
                })}
              </DrawerShell>
            ) : null}

            {panel === 'screenSettings' ? (
              <DrawerShell titleColor={titleColor} onDismiss={dismissDrawer}>
                <Pressable
                  onPress={() => setPanel('settings')}
                  style={styles.backRow}
                  accessibilityRole="button"
                  accessibilityLabel="뒤로">
                  <Ionicons
                    name="chevron-back"
                    size={22}
                    color={nrmTokens.color.primary}
                  />
                  <Text style={styles.backText}>뒤로</Text>
                </Pressable>
                <Text style={[styles.panelTitle, { color: titleColor }]}>
                  화면 설정
                </Text>
                <Pressable
                  onPress={() => {
                    void setAppearanceMode('light');
                  }}
                  style={({ pressed }) => [
                    styles.optionRow,
                    !isDark && styles.optionRowSelected,
                    pressed && { backgroundColor: rowHover },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="라이트 모드">
                  <Text style={[styles.optionLabel, { color: titleColor }]}>
                    라이트 모드
                  </Text>
                  <Ionicons
                    name={!isDark ? 'checkmark-circle' : 'ellipse-outline'}
                    size={22}
                    color={
                      !isDark ? nrmTokens.color.primary : bodyColor
                    }
                  />
                </Pressable>
                <Pressable
                  onPress={() => {
                    void setAppearanceMode('dark');
                  }}
                  style={({ pressed }) => [
                    styles.optionRow,
                    isDark && styles.optionRowSelected,
                    pressed && { backgroundColor: rowHover },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="다크 모드">
                  <Text style={[styles.optionLabel, { color: titleColor }]}>
                    다크 모드
                  </Text>
                  <Ionicons
                    name={isDark ? 'checkmark-circle' : 'ellipse-outline'}
                    size={22}
                    color={
                      isDark ? nrmTokens.color.primary : bodyColor
                    }
                  />
                </Pressable>
              </DrawerShell>
            ) : null}
          </Animated.View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  menuFab: {
    position: 'absolute',
    zIndex: 50,
    width: 44,
    height: 44,
    borderRadius: nrmTokens.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalWrap: {
    flex: 1,
  },
  dim: {
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  drawer: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    height: '100%',
    maxHeight: '100%',
    flexDirection: 'column',
    borderTopRightRadius: nrmTokens.radius.lg,
    borderBottomRightRadius: nrmTokens.radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderLeftWidth: 0,
    paddingHorizontal: nrmTokens.space.lg,
    zIndex: 1,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 4, height: 0 },
        shadowOpacity: 0.18,
        shadowRadius: 12,
      },
      android: {
        elevation: 16,
      },
      web: {
        boxShadow: '4px 0 24px rgba(0,0,0,0.18)',
      },
    }),
  },
  menuLogoGap: {
    marginTop: nrmTokens.space.xs,
    marginBottom: nrmTokens.space.xl,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: nrmTokens.space.md,
    paddingHorizontal: nrmTokens.space.xs,
    borderRadius: nrmTokens.radius.sm,
    marginBottom: nrmTokens.space.xs,
  },
  rowLabel: {
    fontSize: nrmTokens.font.body,
    fontWeight: '500',
  },
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
  versionLine: {
    fontSize: nrmTokens.font.body,
    lineHeight: 24,
    marginBottom: nrmTokens.space.md,
  },
  versionMetaBlock: {
    marginTop: nrmTokens.space.sm,
    gap: nrmTokens.space.xs,
  },
  versionMetaText: {
    fontSize: nrmTokens.font.finePrint,
    lineHeight: 18,
    fontWeight: '400',
  },
  drawerColumn: {
    flex: 1,
    minHeight: 0,
    width: '100%',
    flexDirection: 'column',
  },
  drawerScroll: {
    flex: 1,
    minHeight: 0,
  },
  drawerScrollContent: {
    flexGrow: 1,
    paddingBottom: nrmTokens.space.sm,
    ...Platform.select({
      web: {},
      default: {
        paddingRight: nrmTokens.space.xxs,
      },
    }),
  },
  footerClose: {
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    marginTop: nrmTokens.space.sm,
    borderRadius: nrmTokens.radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(128,128,128,0.35)',
    ...Platform.select({
      web: {},
      default: {
        marginRight: nrmTokens.space.xxs,
      },
    }),
  },
  footerClosePressed: {
    opacity: 0.92,
  },
  footerCloseLabel: {
    fontSize: nrmTokens.font.body,
    fontWeight: '500',
  },
  versionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: nrmTokens.space.md,
    paddingHorizontal: nrmTokens.space.sm,
    borderRadius: nrmTokens.radius.sm,
    marginBottom: nrmTokens.space.xxs,
  },
  versionBadge: {
    fontSize: nrmTokens.font.body,
    fontWeight: '600',
  },
  bulletLine: {
    fontSize: nrmTokens.font.body,
    lineHeight: 24,
    marginBottom: nrmTokens.space.sm,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: nrmTokens.space.md,
    paddingHorizontal: nrmTokens.space.sm,
    borderRadius: nrmTokens.radius.sm,
    marginBottom: nrmTokens.space.xs,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
  },
  optionRowSelected: {
    borderColor: 'rgba(0, 102, 204, 0.35)',
    backgroundColor: 'rgba(0, 102, 204, 0.06)',
  },
  optionLabel: {
    fontSize: nrmTokens.font.body,
    fontWeight: '500',
    flex: 1,
    paddingRight: nrmTokens.space.sm,
  },
});

function DrawerShell({
  titleColor,
  onDismiss,
  children,
}: {
  titleColor: string;
  onDismiss: () => void;
  children: ReactNode;
}) {
  return (
    <View style={styles.drawerColumn}>
      <NrmMenuDrawerScroll
        style={styles.drawerScroll}
        contentContainerStyle={styles.drawerScrollContent}>
        {children}
      </NrmMenuDrawerScroll>
      <Pressable
        onPress={onDismiss}
        style={({ pressed }) => [
          styles.footerClose,
          pressed && styles.footerClosePressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel="닫기">
        <Text style={[styles.footerCloseLabel, { color: titleColor }]}>
          닫기
        </Text>
      </Pressable>
    </View>
  );
}
