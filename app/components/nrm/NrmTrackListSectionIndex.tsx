import { useMemo, useRef } from 'react';

import { PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';



import { nrmTokens } from '@/constants/nrmTokens';

import {

  TRACK_LIST_INDEX_LABELS,

  type TrackListIndexLabel,

} from '@/lib/nrmTrackListIndex';



type Props = {

  onSelect: (label: TrackListIndexLabel) => void;

  mutedColor: string;

};



export function NrmTrackListSectionIndex({ onSelect, mutedColor }: Props) {

  const labels = TRACK_LIST_INDEX_LABELS;

  const heightRef = useRef(1);



  const pickLabel = (locationY: number): TrackListIndexLabel => {

    const h = heightRef.current;

    const ratio = Math.min(1, Math.max(0, locationY / h));

    const idx = Math.min(labels.length - 1, Math.floor(ratio * labels.length));

    return labels[idx];

  };



  const panResponder = useMemo(

    () =>

      PanResponder.create({

        onStartShouldSetPanResponder: () => true,

        onMoveShouldSetPanResponder: () => true,

        onPanResponderGrant: (evt) => {

          onSelect(pickLabel(evt.nativeEvent.locationY));

        },

        onPanResponderMove: (evt) => {

          onSelect(pickLabel(evt.nativeEvent.locationY));

        },

      }),

    [onSelect],

  );



  return (

    <View

      style={styles.wrap}

      onLayout={(e) => {

        heightRef.current = Math.max(1, e.nativeEvent.layout.height);

      }}

      accessibilityRole="adjustable"

      accessibilityLabel="목록 인덱스"

      {...panResponder.panHandlers}>

      <View style={styles.inner} pointerEvents="box-none">

        {labels.map((label) => (

          <Pressable

            key={label}

            onPress={() => onSelect(label)}

            style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}

            hitSlop={2}

            accessibilityRole="button"

            accessibilityLabel={`${label} 섹션`}>

            <Text style={[styles.label, { color: mutedColor }]}>{label}</Text>

          </Pressable>

        ))}

      </View>

    </View>

  );

}



const styles = StyleSheet.create({

  wrap: {

    position: 'absolute',

    right: 0,

    top: 0,

    bottom: 0,

    width: 18,

    justifyContent: 'center',

    paddingVertical: nrmTokens.space.xs,

  },

  inner: {

    flex: 1,

    justifyContent: 'space-between',

    alignItems: 'center',

  },

  item: {

    flex: 1,

    width: '100%',

    alignItems: 'center',

    justifyContent: 'center',

    minHeight: 10,

  },

  itemPressed: {

    transform: [{ scale: 0.92 }],

  },

  label: {

    fontSize: nrmTokens.font.microLegal,

    fontWeight: '600',

    lineHeight: 12,

    textAlign: 'center',

  },

});

