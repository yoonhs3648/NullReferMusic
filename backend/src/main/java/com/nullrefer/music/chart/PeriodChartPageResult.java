package com.nullrefer.music.chart;

import java.time.Instant;
import java.util.List;

/** 기간별 차트 페이지(오프셋·limit) 응답 */
public record PeriodChartPageResult(
    String platform,
    String chartKey,
    String playlistName,
    String market,
    Instant fetchedAt,
    List<ChartTrackItem> items,
    int offset,
    int limit,
    boolean hasMore) {}
