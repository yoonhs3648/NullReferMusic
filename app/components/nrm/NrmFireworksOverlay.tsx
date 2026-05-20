import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View, useWindowDimensions } from 'react-native';

/** TEMP: logo-tap test effect — delete before release */
const COLORS = ['#ff5c5c', '#ffd166', '#6ee7b7', '#60a5fa', '#f472b6', '#fef08a'];

type ParticleSpec = {
  id: string;
  color: string;
  dx: number;
  dy: number;
  size: number;
};

type Props = {
  burstId: number;
  originX?: number;
  originY?: number;
};

function makeBurst(burstId: number, wave: number): ParticleSpec[] {
  const count = 36;
  return Array.from({ length: count }, (_, i) => {
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.35;
    const dist = 70 + Math.random() * 140;
    return {
      id: `${burstId}-${wave}-${i}`,
      color: COLORS[(i + wave) % COLORS.length]!,
      dx: Math.cos(angle) * dist,
      dy: Math.sin(angle) * dist,
      size: 4 + Math.random() * 5,
    };
  });
}

function FireworkParticle({
  originX,
  originY,
  spec,
  onEnd,
}: {
  originX: number;
  originY: number;
  spec: ParticleSpec;
  onEnd: () => void;
}) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration: 850 + Math.random() * 350,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) onEnd();
    });
  }, [onEnd, progress]);

  const translateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, spec.dx],
  });
  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, spec.dy + 28],
  });
  const opacity = progress.interpolate({
    inputRange: [0, 0.65, 1],
    outputRange: [1, 1, 0],
  });
  const scale = progress.interpolate({
    inputRange: [0, 0.15, 1],
    outputRange: [0.15, 1.15, 0.5],
  });

  return (
    <Animated.View
      style={[
        styles.particle,
        {
          left: originX - spec.size / 2,
          top: originY - spec.size / 2,
          width: spec.size,
          height: spec.size,
          borderRadius: spec.size / 2,
          backgroundColor: spec.color,
          opacity,
          transform: [{ translateX }, { translateY }, { scale }],
        },
      ]}
    />
  );
}

export function NrmFireworksOverlay({ burstId, originX, originY }: Props) {
  const { width, height } = useWindowDimensions();
  const ox = originX ?? width / 2;
  const oy = originY ?? height * 0.14;
  const [specs, setSpecs] = useState<ParticleSpec[]>([]);
  const endedRef = useRef(0);
  const totalRef = useRef(0);

  useEffect(() => {
    if (burstId === 0) return;
    const next = [...makeBurst(burstId, 0), ...makeBurst(burstId, 1)];
    endedRef.current = 0;
    totalRef.current = next.length;
    setSpecs(next);
  }, [burstId]);

  const handleEnd = () => {
    endedRef.current += 1;
    if (endedRef.current >= totalRef.current) {
      setSpecs([]);
    }
  };

  if (specs.length === 0) return null;

  return (
    <View style={styles.layer} pointerEvents="none">
      {specs.map((spec) => (
        <FireworkParticle
          key={spec.id}
          originX={ox}
          originY={oy}
          spec={spec}
          onEnd={handleEnd}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    elevation: 9999,
  },
  particle: {
    position: 'absolute',
  },
});
