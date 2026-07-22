import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { nrmTokens } from '@/constants/nrmTokens';
import {
  nrmFormatTargetMonthLabel,
  nrmIsFutureTargetMonth,
  nrmShiftTargetMonth,
} from '@/lib/nrmLlmUsageMonth';

type Props = {
  targetMonth: string;
  onChange: (nextTargetMonth: string) => void;
  titleColor: string;
  bodyColor: string;
  /** 미래월 이동을 막을지 (기본 true). */
  disableFuture?: boolean;
};

/** 관리자 AI토큰 화면 공통 - 월(YYYYMM) 이전/다음 이동 컨트롤. */
export function NrmAdminMonthNavRow({
  targetMonth,
  onChange,
  titleColor,
  bodyColor,
  disableFuture = true,
}: Props) {
  const isFuture = disableFuture && nrmIsFutureTargetMonth(nrmShiftTargetMonth(targetMonth, 1));

  return (
    <View style={styles.monthNav}>
      <Pressable
        onPress={() => onChange(nrmShiftTargetMonth(targetMonth, -1))}
        hitSlop={10}
        style={({ pressed }) => [styles.monthNavBtn, pressed && { opacity: 0.7 }]}
        accessibilityRole="button"
        accessibilityLabel="이전 달">
        <Ionicons name="chevron-back" size={20} color={titleColor} />
      </Pressable>
      <Text style={[styles.monthLabel, { color: titleColor }]}>
        {nrmFormatTargetMonthLabel(targetMonth)}
      </Text>
      <Pressable
        onPress={() => !isFuture && onChange(nrmShiftTargetMonth(targetMonth, 1))}
        disabled={isFuture}
        hitSlop={10}
        style={({ pressed }) => [
          styles.monthNavBtn,
          pressed && !isFuture && { opacity: 0.7 },
          isFuture && styles.monthNavBtnDisabled,
        ]}
        accessibilityRole="button"
        accessibilityLabel="다음 달">
        <Ionicons name="chevron-forward" size={20} color={isFuture ? bodyColor : titleColor} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: nrmTokens.space.md,
  },
  monthNavBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: nrmTokens.radius.pill,
  },
  monthNavBtnDisabled: {
    opacity: 0.35,
  },
  monthLabel: {
    fontSize: nrmTokens.font.body,
    fontWeight: '700',
    minWidth: 110,
    textAlign: 'center',
  },
});
