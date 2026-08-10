import { useMemo, type ReactNode } from 'react';
import { Linking, Platform, StyleSheet, Text, type TextStyle, type ViewStyle } from 'react-native';
import Markdown, { MarkdownIt } from 'react-native-markdown-display';

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

const markdownIt = MarkdownIt({ typographer: true, linkify: true });

/**
 * CommonMark 강조(flanking) 규칙 때문에 파싱이 실패하는 패턴을 완화.
 * 예: `**CORTIS (코르티스)**의`, `**〈REDRED〉**입니다`, `**foo,**입니다`
 */
function fixEmphasisBeforeCjk(text: string): string {
  const cjkFollow = /(?=[\p{Script=Hangul}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}])/u;
  const boldAfterPunct = /([)〉])\*\*/gu;
  const boldAfterAsciiPunct = /([,)!?:])\*\*/gu;
  const strikeAfterPunct = /([)〉])~~/gu;
  const strikeAfterAsciiPunct = /([,)!?:])~~/gu;
  return text
    .replace(new RegExp(`${boldAfterPunct.source}${cjkFollow.source}`, 'gu'), '$1\u200B**')
    .replace(new RegExp(`${boldAfterAsciiPunct.source}${cjkFollow.source}`, 'gu'), '$1\u200B**')
    .replace(new RegExp(`${strikeAfterPunct.source}${cjkFollow.source}`, 'gu'), '$1\u200B~~')
    .replace(new RegExp(`${strikeAfterAsciiPunct.source}${cjkFollow.source}`, 'gu'), '$1\u200B~~');
}

/**
 * 모델이 자주 내는 MD 변형을 파서가 인식하도록 정규화.
 * - 전각 ＊～ → ASCII
 * - `** 텍스트 **` / `~~ 텍스트 ~~` 처럼 안쪽 공백이 있으면 strong/s 로 안 잡혀 마커가 그대로 보임
 * - `**제목:**` 뒤 본문처럼 `:**` 로 닫히는 bold 는 spaced-bold 정규식에서 제외
 * - 괄호·각괄호·구두점 뒤 `**`/`~~` + 한글이면 zero-width space 로 flanking 완화
 */
export function normalizeAiLabMarkdown(content: string): string {
  let t = content ?? '';
  if (!t) return '';
  t = t.replace(/\uFF0A/g, '*'); // ＊
  t = t.replace(/\uFF5E/g, '~'); // ～
  // ** spaced ** / __ spaced __ — `**제목:** REDRED` 의 닫는 ** 를 여는 ** 로 오인하지 않게
  t = t.replace(/(?<![:\w])\*\*\s+([^*]+?)\s+\*\*/g, '**$1**');
  t = t.replace(/(?<![:\w])__\s+([^_]+?)\s+__/g, '**$1**');
  // ~~ spaced ~~
  t = t.replace(/~~\s+([^~]+?)\s+~~/g, '~~$1~~');
  // * spaced * (단일 이탤릭) — 목록(*)과 충돌하지 않게 줄 중간만
  t = t.replace(/(^|[^\n*])\*\s+([^*\n]+?)\s+\*(?=[^\n*]|$)/g, '$1*$2*');
  t = fixEmphasisBeforeCjk(t);
  return t;
}

function buildMarkdownStyles(color: string, isDark: boolean): MdStyles {
  const muted = isDark ? nrmTokens.color.textMuted : nrmTokens.color.inkMuted80;
  const codeBg = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
  const quoteBorder = isDark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.16)';
  const fenceBg = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)';
  const link = isDark ? nrmTokens.color.primaryOnDark : nrmTokens.color.primary;
  // fontWeight를 body/text에 두면 Android에서 nested strong 이 무시되는 경우가 많다.
  const body: TextStyle = {
    color,
    fontSize: nrmTokens.font.body,
    lineHeight: 24,
  };

  return {
    body,
    text: body,
    textgroup: {
      color,
      fontSize: nrmTokens.font.body,
      lineHeight: 24,
    },
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
  const normalized = useMemo(() => normalizeAiLabMarkdown(content), [content]);

  const rules = useMemo(
    () => ({
      // Android nested Text + fontWeight 이슈: strong/em/s 에 스타일을 직접 고정
      strong: (node: { key: string }, children: ReactNode) => (
        <Text key={node.key} style={mdStyles.strong as TextStyle}>
          {children}
        </Text>
      ),
      em: (node: { key: string }, children: ReactNode) => (
        <Text key={node.key} style={mdStyles.em as TextStyle}>
          {children}
        </Text>
      ),
      s: (node: { key: string }, children: ReactNode) => (
        <Text key={node.key} style={mdStyles.s as TextStyle}>
          {children}
        </Text>
      ),
    }),
    [mdStyles],
  );

  return (
    <Markdown
      style={mdStyles}
      rules={rules}
      mergeStyle
      markdownit={markdownIt}
      onLinkPress={onLinkPress}>
      {normalized}
    </Markdown>
  );
}
