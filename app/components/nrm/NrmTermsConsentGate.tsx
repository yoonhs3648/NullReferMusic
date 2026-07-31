import { useCallback, useState } from 'react';
import {
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { nrmTokens } from '@/constants/nrmTokens';
import { useNrmUiAppearance } from '@/context/NrmUiAppearanceContext';
import { getNrmProductDisplayName } from '@/lib/nrmAppBrand';
import { getNrmRootBackgroundColor } from '@/lib/nrmUiAppearanceColors';

const INNER_SCROLL_HEIGHT = 248;
const SCROLL_BOTTOM_THRESHOLD = 20;

function resolveText(raw: string, appName: string): string {
  return raw.replace(/\[앱명\]/g, appName);
}

const TERMS_RAW = `제1조 (목적)

본 이용약관은 [앱명](이하 "서비스")의 이용과 관련하여 서비스 운영자(이하 "회사")와 이용자 간의 권리, 의무 및 책임사항을 규정함을 목적으로 합니다.

제2조 (약관의 효력)

1. 본 약관은 이용자가 서비스 이용 시 동의함으로써 효력이 발생합니다.
2. 회사는 관련 법령을 위반하지 않는 범위에서 본 약관을 개정할 수 있습니다.
3. 개정된 약관은 서비스 내 공지 또는 기타 적절한 방법으로 고지합니다.

제3조 (서비스 제공)

회사는 다음 각 호의 기능을 제공할 수 있습니다.

1. 음악 정보 조회 및 관리 기능
2. 가사 관련 기능
3. 외부 API 연동 기능
4. 데이터 처리 및 관리 기능
5. 기타 회사가 제공하는 부가 기능

제4조 (서비스 이용)

1. 이용자는 본 약관 및 관련 법령을 준수하여 서비스를 이용하여야 합니다.
2. 이용자는 서비스의 정상적인 운영을 방해하는 행위를 하여서는 안 됩니다.
3. 이용자는 본인의 책임 하에 외부 서비스 연동 기능을 이용합니다.

제5조 (기술정보 수집 및 처리)

1. 회사는 서비스의 제공, 유지보수, 오류 분석, 보안 강화, 품질 개선 및 부정 이용 방지를 위하여 서비스 이용 과정에서 생성되는 기술정보를 수집 및 처리할 수 있습니다.
2. 수집되는 기술정보에는 다음이 포함될 수 있습니다.

 · 앱 버전
 · 운영체제 정보
 · 기기 환경 정보
 · 서비스 이용 기록
 · 기능 사용 기록
 · 오류 및 예외 정보
 · 네트워크 상태 정보
 · 서비스 설정 정보
 · 진단 정보
 · 익명 식별자
 · 기타 서비스 운영에 필요한 정보

3. 회사는 서비스 이용 과정에서 생성되는 로그 및 진단 정보를 원격 서버로 전송받아 분석할 수 있습니다.

제6조 (외부 서비스 연동)

1. 서비스는 제3자가 제공하는 API 또는 온라인 서비스를 연동할 수 있습니다.
2. 이용자가 입력한 API Key, Access Token, Cookie, Session 정보 등 인증정보의 원문은 원칙적으로 회사 서버에 전송되지 않습니다.
3. 다만 서비스 운영, 오류 분석, 중복 사용 확인, 보안 검토 또는 기능 개선을 위하여 인증정보로부터 생성된 해시값, 마스킹값 또는 비식별화된 식별값이 전송될 수 있습니다.
4. 이용자는 본인의 책임 하에 외부 서비스 연동 기능을 이용합니다.

제7조 (서비스 이용 제한)

회사는 다음 각 호의 경우 이용자의 서비스 이용을 제한하거나 중단할 수 있습니다.

1. 본 약관을 위반한 경우
2. 서비스 운영을 방해하는 경우
3. 비정상적인 사용 패턴이 확인되는 경우
4. 보안상 위험이 발생하거나 발생할 우려가 있는 경우
5. 서비스의 안정적인 운영을 위하여 필요한 경우
6. 기타 회사가 합리적으로 이용 제한이 필요하다고 판단한 경우

제8조 (면책)

1. 회사는 천재지변, 통신장애 또는 기타 불가항력으로 인한 서비스 중단에 대하여 책임을 지지 않습니다.
2. 회사는 이용자의 귀책사유로 발생한 손해에 대하여 책임을 지지 않습니다.
3. 회사는 외부 API 또는 제3자 서비스의 장애로 인한 문제에 대하여 책임을 지지 않습니다.

제9조 (준거법)

본 약관은 대한민국 법령에 따라 해석되고 적용됩니다.`;

const PRIVACY_RAW = `개인정보처리방침

[앱명](이하 "서비스")은 이용자의 개인정보 보호를 중요하게 생각하며 관련 법령을 준수합니다.

제1조 (수집하는 정보)

서비스는 다음 정보를 수집할 수 있습니다.

1. 자동 수집 정보

 · 앱 버전
 · 운영체제 버전
 · 기기 모델 정보
 · 앱 실행 및 종료 기록
 · 기능 사용 기록
 · 오류 로그
 · 충돌 로그
 · 진단 정보
 · 네트워크 정보
 · 익명 식별자

2. 이용자가 제공하는 정보

 · 문의 내용
 · 오류 제보 내용
 · 로그 파일
 · 설정 정보

3. 외부 서비스 연동 정보

 · API Key 또는 인증정보 자체가 아닌 해시값
 · 인증정보의 일부 마스킹값
 · 서비스 연동 상태 정보
 · API 요청 결과에 대한 오류 정보

제2조 (수집 목적)

수집된 정보는 다음 목적으로 이용됩니다.

1. 서비스 제공
2. 기능 개선
3. 오류 분석
4. 품질 향상
5. 보안 강화
6. 부정 이용 방지
7. 기술 지원
8. 사용자 문의 대응

제3조 (보유 기간)

1. 수집된 정보는 수집 목적 달성 시까지 보관합니다.
2. 서비스 운영상 필요한 경우 일정 기간 보관할 수 있습니다.
3. 관련 법령에서 보존 의무를 규정하는 경우 해당 기간 동안 보관합니다.

제4조 (제3자 제공)

회사는 법령에 근거가 있는 경우를 제외하고 이용자의 정보를 외부에 제공하지 않습니다.

제5조 (정보의 보호)

회사는 수집된 정보를 보호하기 위하여 합리적인 보안 조치를 적용합니다.

제6조 (이용 제한 관련 처리)

회사는 서비스의 안정성 확보 및 부정 이용 방지를 위하여 수집된 로그 및 식별 정보를 검토할 수 있으며, 필요한 경우 서비스 이용을 제한할 수 있습니다.

제7조 (이용자의 권리)

이용자는 관련 법령이 정하는 범위 내에서 개인정보 처리와 관련된 권리를 행사할 수 있습니다.

제8조 (방침 변경)

본 방침은 변경될 수 있으며, 변경 시 서비스 내 공지사항 등을 통해 안내합니다.

본 약관은 2026.06.24부터 시행합니다.`;

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

type CheckboxRowProps = {
  checked: boolean;
  disabled: boolean;
  label: string;
  onToggle: () => void;
  isDark: boolean;
  small?: boolean;
};

function CheckboxRow({ checked, disabled, label, onToggle, isDark, small }: CheckboxRowProps) {
  const ink = isDark ? nrmTokens.color.bodyOnDark : nrmTokens.color.ink;
  const muted = isDark ? nrmTokens.color.bodyMuted : nrmTokens.color.inkMuted48;
  const checkBorderColor = checked
    ? nrmTokens.color.primary
    : isDark
      ? 'rgba(255,255,255,0.35)'
      : 'rgba(0,0,0,0.28)';

  return (
    <Pressable
      onPress={disabled ? undefined : onToggle}
      style={[styles.checkRow, disabled && { opacity: 0.38 }]}
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}>
      <View
        style={[
          styles.checkBox,
          {
            borderColor: checkBorderColor,
            backgroundColor: checked ? nrmTokens.color.primary : 'transparent',
          },
        ]}>
        {checked && <Text style={styles.checkMark}>✓</Text>}
      </View>
      <Text style={[styles.checkLabel, small && styles.checkLabelSmall, { color: disabled ? muted : ink }]}>
        {label}
      </Text>
    </Pressable>
  );
}

type ConsentSectionProps = {
  sectionTitle: string;
  content: string;
  expanded: boolean;
  onToggle: () => void;
  scrolledToBottom: boolean;
  onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
  onContentFits: () => void;
  checked: boolean;
  onCheck: () => void;
  isDark: boolean;
};

function ConsentSection({
  sectionTitle,
  content,
  expanded,
  onToggle,
  scrolledToBottom,
  onScroll,
  onContentFits,
  checked,
  onCheck,
  isDark,
}: ConsentSectionProps) {
  const ink = isDark ? nrmTokens.color.bodyOnDark : nrmTokens.color.ink;
  const muted = isDark ? nrmTokens.color.bodyMuted : nrmTokens.color.inkMuted48;
  const cardBg = isDark ? nrmTokens.color.surfaceTile2 : nrmTokens.color.cardLightBg;
  const border = isDark ? nrmTokens.color.borderOnDark : nrmTokens.color.cardLightBorder;
  const divider = isDark ? 'rgba(255,255,255,0.08)' : nrmTokens.color.hairline;

  return (
    <View style={[styles.card, { backgroundColor: cardBg, borderColor: border }]}>
      <Pressable
        onPress={onToggle}
        style={({ pressed }) => [styles.accordionHeader, pressed && { opacity: 0.7 }]}
        accessibilityRole="button"
        accessibilityState={{ expanded }}>
        <Text style={[styles.sectionTitle, { color: ink }]}>{sectionTitle} 보기</Text>
        <Text style={[styles.accordionArrow, { color: muted }]}>{expanded ? '▾' : '▸'}</Text>
      </Pressable>

      {expanded && (
        <>
          <View style={[styles.hairline, { backgroundColor: divider }]} />
          <ScrollView
            style={[styles.innerScroll, { borderColor: divider }]}
            contentContainerStyle={styles.innerScrollContent}
            nestedScrollEnabled
            showsVerticalScrollIndicator
            scrollEventThrottle={16}
            onScroll={onScroll}
            onContentSizeChange={(_, contentH) => {
              if (contentH <= INNER_SCROLL_HEIGHT) {
                onContentFits();
              }
            }}>
            <Text style={[styles.contentText, { color: muted }]}>{content}</Text>
          </ScrollView>
          <View style={[styles.hairline, { backgroundColor: divider }]} />
        </>
      )}

      <CheckboxRow
        checked={checked}
        disabled={!scrolledToBottom}
        label={`${sectionTitle}을 읽고 동의합니다.`}
        onToggle={onCheck}
        isDark={isDark}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

type Props = {
  onAgreed: () => void;
};

export function NrmTermsConsentGate({ onAgreed }: Props) {
  const appName = getNrmProductDisplayName();
  const { isDark } = useNrmUiAppearance();
  const insets = useSafeAreaInsets();

  const bg = getNrmRootBackgroundColor(isDark);
  const ink = isDark ? nrmTokens.color.bodyOnDark : nrmTokens.color.ink;
  const muted = isDark ? nrmTokens.color.bodyMuted : nrmTokens.color.inkMuted48;
  const cardBg = isDark ? nrmTokens.color.surfaceTile2 : nrmTokens.color.cardLightBg;
  const border = isDark ? nrmTokens.color.borderOnDark : nrmTokens.color.cardLightBorder;

  const [termsExpanded, setTermsExpanded] = useState(true);
  const [privacyExpanded, setPrivacyExpanded] = useState(true);
  const [termsBottom, setTermsBottom] = useState(false);
  const [privacyBottom, setPrivacyBottom] = useState(false);
  const [termsChecked, setTermsChecked] = useState(false);
  const [privacyChecked, setPrivacyChecked] = useState(false);
  const [dataChecked, setDataChecked] = useState(false);

  const dataEnabled = termsChecked && privacyChecked;
  const allChecked = dataEnabled && dataChecked;

  const handleTermsScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
    if (contentOffset.y + layoutMeasurement.height >= contentSize.height - SCROLL_BOTTOM_THRESHOLD) {
      setTermsBottom(true);
    }
  }, []);

  const handlePrivacyScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
    if (contentOffset.y + layoutMeasurement.height >= contentSize.height - SCROLL_BOTTOM_THRESHOLD) {
      setPrivacyBottom(true);
    }
  }, []);

  const topPad = Math.max(insets.top, 24) + 24;

  return (
    <View style={[styles.root, { backgroundColor: bg, paddingTop: topPad }]}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: Math.max(insets.bottom, 16) + 32 }]}
        showsVerticalScrollIndicator={false}>

        {/* 페이지 헤더 */}
        <Text style={[styles.pageTitle, { color: ink }]}>서비스 이용 동의</Text>
        <Text style={[styles.pageLead, { color: muted }]}>
          계속하려면 아래 내용을 확인하고 동의해 주세요.
        </Text>

        {/* 이용약관 */}
        <ConsentSection
          sectionTitle="이용약관"
          content={resolveText(TERMS_RAW, appName)}
          expanded={termsExpanded}
          onToggle={() => setTermsExpanded((v) => !v)}
          scrolledToBottom={termsBottom}
          onScroll={handleTermsScroll}
          onContentFits={() => setTermsBottom(true)}
          checked={termsChecked}
          onCheck={() => { if (termsBottom) setTermsChecked((v) => !v); }}
          isDark={isDark}
        />

        {/* 개인정보처리방침 */}
        <ConsentSection
          sectionTitle="개인정보처리방침"
          content={resolveText(PRIVACY_RAW, appName)}
          expanded={privacyExpanded}
          onToggle={() => setPrivacyExpanded((v) => !v)}
          scrolledToBottom={privacyBottom}
          onScroll={handlePrivacyScroll}
          onContentFits={() => setPrivacyBottom(true)}
          checked={privacyChecked}
          onCheck={() => { if (privacyBottom) setPrivacyChecked((v) => !v); }}
          isDark={isDark}
        />

        {/* 데이터 전송 확인 */}
        <View style={[styles.card, { backgroundColor: cardBg, borderColor: border }]}>
          <CheckboxRow
            checked={dataChecked}
            disabled={!dataEnabled}
            label="서비스 이용 과정에서 이용기록, 오류로그, 진단정보 및 비식별화된 식별정보가 서버로 전송될 수 있음을 확인하였습니다."
            onToggle={() => { if (dataEnabled) setDataChecked((v) => !v); }}
            isDark={isDark}
            small
          />
        </View>

        {/* CTA 버튼 */}
        <Pressable
          accessibilityRole="button"
          disabled={!allChecked}
          onPress={onAgreed}
          style={({ pressed }) => [
            styles.primaryBtn,
            {
              backgroundColor: allChecked
                ? nrmTokens.color.primary
                : isDark
                  ? 'rgba(255,255,255,0.08)'
                  : nrmTokens.color.dividerSoft,
              opacity: pressed ? 0.9 : 1,
              transform: [{ scale: pressed && allChecked ? 0.97 : 1 }],
            },
          ]}>
          <Text
            style={[
              styles.primaryBtnText,
              { color: allChecked ? nrmTokens.color.onPrimary : muted },
            ]}>
            동의하고 시작하기
          </Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  scroll: {
    paddingHorizontal: nrmTokens.space.lg,
    gap: nrmTokens.space.sm,
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: '600',
    lineHeight: 34,
    marginBottom: nrmTokens.space.xs,
  },
  pageLead: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: nrmTokens.space.xs,
  },

  // section card
  card: {
    borderRadius: nrmTokens.radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  accordionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: nrmTokens.space.md,
    paddingVertical: 14,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  accordionArrow: {
    fontSize: 16,
    lineHeight: 20,
  },
  hairline: {
    height: StyleSheet.hairlineWidth,
  },
  innerScroll: {
    height: INNER_SCROLL_HEIGHT,
  },
  innerScrollContent: {
    padding: nrmTokens.space.md,
  },
  contentText: {
    fontSize: 13,
    lineHeight: 20,
  },

  // checkbox row
  checkRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: nrmTokens.space.sm,
    paddingHorizontal: nrmTokens.space.md,
    paddingVertical: 14,
  },
  checkBox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 1,
  },
  checkMark: {
    color: nrmTokens.color.onPrimary,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 16,
  },
  checkLabel: {
    flex: 1,
    fontSize: 15,
    lineHeight: 22,
  },
  checkLabelSmall: {
    fontSize: 14,
    lineHeight: 21,
  },

  // CTA button
  primaryBtn: {
    borderRadius: nrmTokens.radius.pill,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: nrmTokens.space.lg,
    marginTop: nrmTokens.space.xs,
  },
  primaryBtnText: {
    fontSize: 17,
    fontWeight: '600',
  },
});
