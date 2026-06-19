import { StyleSheet, View } from 'react-native';

type Props = {
  color: string;
  size?: number;
};

/** 배경 없는 3줄 햄버거 아이콘 */
export function NrmHamburgerIcon({ color, size = 22 }: Props) {
  const lineH = Math.max(2, Math.round(size * 0.09));
  const gap = Math.round(size * 0.22);
  const lineW = size;

  return (
    <View style={[styles.wrap, { width: lineW, height: size }]} accessibilityElementsHidden>
      {[0, 1, 2].map((i) => (
        <View
          key={`line-${i}`}
          style={{
            width: lineW,
            height: lineH,
            borderRadius: lineH,
            backgroundColor: color,
            marginTop: i > 0 ? gap : 0,
          }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    justifyContent: 'center',
  },
});
