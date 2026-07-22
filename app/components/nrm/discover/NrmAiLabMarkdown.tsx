import { useMemo } from 'react';
import { Linking, Platform, StyleSheet, type TextStyle, type ViewStyle } from 'react-native';
import Markdown from 'react-native-markdown-display';

import { nrmTokens } from '@/constants/nrmTokens';

type Props = {
  content: string;
  color: string;
  isDark: boolean;
};

type MdStyles = Record<string, TextStyle | ViewStyle>;

const MONO_FONT = Platform.select({
  ios: 'Menlo',
  android: 'monospace',
  default: 'monospace',
});

function buildMarkdownStyles(color: string, isDark: boolean): MdStyles {
  const muted = isDark ? nrmTokens.color.textMuted : nrmTokens.color.inkMuted80;
  const codeBg = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
  const quoteBorder = isDark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.16)';
  const fenceBg = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)';
  const link = isDark ? nrmTokens.color.primaryOnDark : nrmTokens.color.primary;
  const body: TextStyle = {
    color,
    fontSize: nrmTokens.font.body,
    lineHeight: 24,
    fontWeight: '400',
  };

  return {
    body,
    text: body,
    paragraph: {
      ...body,
      marginTop: 0,
      marginBottom: 8,
    },
    heading1: {
      color,
      fontSize: 22,
      lineHeight: 28,
      fontWeight: '700',
      marginTop: 4,
      marginBottom: 8,
    },
    heading2: {
      color,
      fontSize: 19,
      lineHeight: 26,
      fontWeight: '700',
      marginTop: 4,
      marginBottom: 6,
    },
    heading3: {
      color,
      fontSize: 17,
      lineHeight: 24,
      fontWeight: '600',
      marginTop: 2,
      marginBottom: 6,
    },
    heading4: {
      color,
      fontSize: nrmTokens.font.body,
      lineHeight: 22,
      fontWeight: '600',
      marginBottom: 4,
    },
    heading5: {
      color,
      fontSize: nrmTokens.font.caption,
      lineHeight: 20,
      fontWeight: '600',
      marginBottom: 4,
    },
    heading6: {
      color: muted,
      fontSize: nrmTokens.font.caption,
      lineHeight: 18,
      fontWeight: '600',
      marginBottom: 4,
    },
    strong: {
      fontWeight: '700',
      color,
    },
    em: {
      fontStyle: 'italic',
      color,
    },
    s: {
      textDecorationLine: 'line-through',
      color,
    },
    link: {
      color: link,
      textDecorationLine: 'underline',
    },
    blockquote: {
      backgroundColor: codeBg,
      borderColor: quoteBorder,
      borderLeftWidth: 3,
      marginTop: 4,
      marginBottom: 8,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    code_inline: {
      backgroundColor: codeBg,
      color,
      fontFamily: MONO_FONT,
      fontSize: 13,
      borderRadius: 4,
      paddingHorizontal: 4,
      paddingVertical: 1,
    },
    code_block: {
      backgroundColor: fenceBg,
      color,
      fontFamily: MONO_FONT,
      fontSize: 13,
      lineHeight: 20,
      borderRadius: nrmTokens.radius.md,
      padding: 10,
      marginVertical: 6,
    },
    fence: {
      backgroundColor: fenceBg,
      color,
      fontFamily: MONO_FONT,
      fontSize: 13,
      lineHeight: 20,
      borderRadius: nrmTokens.radius.md,
      padding: 10,
      marginVertical: 6,
    },
    bullet_list: {
      marginBottom: 6,
    },
    ordered_list: {
      marginBottom: 6,
    },
    list_item: {
      ...body,
      marginBottom: 2,
    },
    bullet_list_icon: {
      color,
      fontSize: 18,
      lineHeight: 24,
      marginLeft: 0,
      marginRight: 8,
    },
    ordered_list_icon: {
      color,
      fontSize: nrmTokens.font.body,
      lineHeight: 24,
      marginLeft: 0,
      marginRight: 8,
    },
    hr: {
      backgroundColor: quoteBorder,
      height: StyleSheet.hairlineWidth,
      marginVertical: 10,
    },
    table: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: quoteBorder,
      marginVertical: 8,
    },
    th: {
      color,
      fontWeight: '600',
      padding: 6,
      borderColor: quoteBorder,
    },
    td: {
      color,
      padding: 6,
      borderColor: quoteBorder,
    },
    tr: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: quoteBorder,
    },
  };
}

function onLinkPress(url: string): boolean {
  void Linking.openURL(url).catch(() => undefined);
  return false;
}

/** AI Lab 어시스턴트 답변 — Markdown 문법을 UI 스타일로 렌더. */
export function NrmAiLabMarkdown({ content, color, isDark }: Props) {
  const mdStyles = useMemo(() => buildMarkdownStyles(color, isDark), [color, isDark]);

  return (
    <Markdown style={mdStyles} mergeStyle onLinkPress={onLinkPress}>
      {content}
    </Markdown>
  );
}
