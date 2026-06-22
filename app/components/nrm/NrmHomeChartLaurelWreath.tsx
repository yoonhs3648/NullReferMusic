import { Image, StyleSheet, View } from 'react-native';

import {
  HOME_CHART_LAUREL_ASPECT,
  HOME_CHART_LAUREL_SOURCES,
} from '@/constants/nrmHomeChartPodiumAssets';
import { nrmTokens } from '@/constants/nrmTokens';
import { homeChartPodiumTier, type HomeChartPodiumTier } from '@/components/nrm/NrmHomeChartRankCrown';

const TITLE_LINE_HEIGHT = 36;
const TITLE_MAX_LINES = 2;
/** PNG U형 opening 중심 (이미지 높이 대비) */
const LAUREL_OPENING_CENTER_FRAC = 0.36;
/** 제목이 U opening 안에 앉는 Y (첫 줄 기준) */
const LAUREL_TITLE_ANCHOR_FRAC = 0.52;

/** 제목·월계수 블록 — cover 폭 기준 반응형 배치 (제목을 U형으로 감쌈) */
export function homeChartLaurelLayoutMetrics(coverWidth: number) {
  const wreathW = Math.round(coverWidth * 1.08);
  const wreathH = Math.round(wreathW / HOME_CHART_LAUREL_ASPECT);
  const titleBlockHeight = TITLE_LINE_HEIGHT * TITLE_MAX_LINES;
  const titleAnchorY = Math.round(TITLE_LINE_HEIGHT * LAUREL_TITLE_ANCHOR_FRAC);
  const laurelTop = Math.round(titleAnchorY - wreathH * LAUREL_OPENING_CENTER_FRAC);
  const wrapMinHeight = Math.max(
    titleBlockHeight + nrmTokens.space.xxs,
    laurelTop + Math.round(wreathH * 0.9) + nrmTokens.space.xxs,
  );
  return { wreathW, wreathH, laurelTop, wrapMinHeight };
}


type Props = {

  rank: number;

  /** 앨범 커버와 동일한 폭 기준 */

  width: number;

};



/** TOP 1·2·3 — 노래 제목을 U형으로 감싸는 월계수 (투명 PNG) */

export function NrmHomeChartLaurelWreath({ rank, width }: Props) {

  const tier = homeChartPodiumTier(rank);

  if (!tier) return null;



  const wreathW = Math.round(width * 1.08);

  const wreathH = Math.round(wreathW / HOME_CHART_LAUREL_ASPECT);



  return (

    <View

      style={[styles.wrap, { width: wreathW, height: wreathH }]}

      pointerEvents="none"

      accessibilityElementsHidden

      importantForAccessibility="no-hide-descendants">

      <Image

        source={HOME_CHART_LAUREL_SOURCES[tier as HomeChartPodiumTier]}

        style={{ width: wreathW, height: wreathH, backgroundColor: 'transparent' }}

        resizeMode="contain"

        accessibilityIgnoresInvertColors

      />

    </View>

  );

}



const styles = StyleSheet.create({

  wrap: {

    alignItems: 'center',

    justifyContent: 'center',

    backgroundColor: 'transparent',

  },

});


