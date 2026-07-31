package com.nullrefer.music.chart;

import java.time.Instant;
import java.util.List;

/** Melon 일간 차트 응답 (+ 게시일 dateLabel) */
public record MelonDailyChartResult(
    String platform,
    String playlistId,
    String playlistName,
    String market,
    Instant fetchedAt,
    List<ChartTrackItem> items,
    String dateLabel) {}
