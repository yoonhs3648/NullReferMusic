import type { ReactNode } from 'react';
import {
  Platform,
  ScrollView,
  type ScrollViewProps,
  StyleSheet,
} from 'react-native';

import { nrmTokens } from '@/constants/nrmTokens';

const WEB_SCROLL_CLASS = 'nrm-scroll-web';

type Props = ScrollViewProps & {
  children: ReactNode;
};

/**
 * 메뉴 드로어 본문 스크롤.
 * - 네이티브: 스크롤 인디케이터 숨김 (손가락 스크롤)
 * - 웹: CSS로 절제된 얇은 스크롤바 (`+html.tsx` 의 `.nrm-scroll-web`)
 */
export function NrmMenuDrawerScroll({
  children,
  style,
  contentContainerStyle,
  ...rest
}: Props) {
  return (
    <ScrollView
      {...rest}
      style={[styles.scroll, style]}
      contentContainerStyle={[styles.content, contentContainerStyle]}
      keyboardShouldPersistTaps="always"
      showsVerticalScrollIndicator={false}
      overScrollMode="never"
      {...(Platform.OS === 'web'
        ? { className: WEB_SCROLL_CLASS }
        : {})}>
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    minHeight: 0,
  },
  content: {
    flexGrow: 1,
    paddingBottom: nrmTokens.space.sm,
  },
});
