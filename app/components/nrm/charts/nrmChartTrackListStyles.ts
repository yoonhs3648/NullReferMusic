import { StyleSheet } from 'react-native';

import { nrmTokens } from '@/constants/nrmTokens';

/** 실시간 차트 트랙 행 — 제목(playlistHint) 왼쪽과 순번 정렬 */
export const nrmChartTrackListStyles = StyleSheet.create({
  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: nrmTokens.space.sm,
    paddingVertical: nrmTokens.space.sm,
    paddingHorizontal: 0,
    borderRadius: nrmTokens.radius.sm,
    marginBottom: nrmTokens.space.xxs,
  },
  trackRowPressed: {
    opacity: 0.88,
  },
  rank: {
    width: 22,
    fontSize: nrmTokens.font.caption,
    fontWeight: '600',
    textAlign: 'left',
  },
  art: {
    width: 52,
    height: 52,
    borderRadius: nrmTokens.radius.sm,
  },
  artPlaceholder: {
    backgroundColor: 'rgba(128,128,128,0.2)',
  },
  trackMeta: {
    flex: 1,
    minWidth: 0,
  },
  trackTitle: {
    fontSize: nrmTokens.font.body,
    fontWeight: '500',
  },
  trackSub: {
    marginTop: 2,
    fontSize: nrmTokens.font.caption,
    fontWeight: '400',
  },
  trackAlbum: {
    marginTop: 1,
    fontSize: nrmTokens.font.caption,
    fontWeight: '400',
    opacity: 0.72,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: nrmTokens.space.xs,
    marginTop: 4,
    alignItems: 'center',
  },
  metaChip: {
    fontSize: nrmTokens.font.caption,
    fontWeight: '400',
  },
  metaChipBadge: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: nrmTokens.radius.pill,
    paddingHorizontal: 6,
    paddingVertical: 1,
    opacity: 0.85,
  },
});
