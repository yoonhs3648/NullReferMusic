import type { ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { NrmMenuDrawerScroll } from '@/components/nrm/NrmMenuDrawerScroll';
import { nrmTokens } from '@/constants/nrmTokens';

type Props = {
  titleColor: string;
  onDismiss: () => void;
  compactFooter?: boolean;
  footerActionLabel?: string;
  footerActionAccessibilityLabel?: string;
  footerActionDisabled?: boolean;
  onFooterAction?: () => void;
  refreshControl?: React.ComponentProps<typeof NrmMenuDrawerScroll>['refreshControl'];
  children: ReactNode;
};

/** 메뉴·알림 드로어 공통 — 스크롤 본문 + 하단 닫기 */
export function NrmAppDrawerShell({
  titleColor,
  onDismiss,
  compactFooter = false,
  footerActionLabel,
  footerActionAccessibilityLabel,
  footerActionDisabled = false,
  onFooterAction,
  refreshControl,
  children,
}: Props) {
  return (
    <View style={styles.drawerColumn}>
      <NrmMenuDrawerScroll
        style={styles.drawerScroll}
        contentContainerStyle={styles.drawerScrollContent}
        refreshControl={refreshControl}>
        {children}
      </NrmMenuDrawerScroll>
      {footerActionLabel && onFooterAction ? (
        <Pressable
          onPress={onFooterAction}
          disabled={footerActionDisabled}
          style={({ pressed }) => [
            styles.footerClose,
            styles.footerAction,
            compactFooter && styles.footerCloseCompact,
            footerActionDisabled && styles.footerActionDisabled,
            pressed && !footerActionDisabled && styles.footerClosePressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel={
            footerActionAccessibilityLabel ?? footerActionLabel
          }>
          <Text style={[styles.footerCloseLabel, { color: titleColor }]}>
            {footerActionLabel}
          </Text>
        </Pressable>
      ) : null}
      <Pressable
        onPress={onDismiss}
        style={({ pressed }) => [
          styles.footerClose,
          compactFooter && styles.footerCloseCompact,
          pressed && styles.footerClosePressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel="닫기">
        <Text style={[styles.footerCloseLabel, { color: titleColor }]}>닫기</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
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
    marginBottom: nrmTokens.layout.menuDrawerCloseBottomGap,
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
  footerCloseCompact: {
    marginTop: nrmTokens.space.xs,
  },
  footerAction: {
    marginBottom: 0,
  },
  footerActionDisabled: {
    opacity: 0.42,
  },
  footerClosePressed: {
    opacity: 0.92,
  },
  footerCloseLabel: {
    fontSize: nrmTokens.font.body,
    fontWeight: '500',
  },
});
