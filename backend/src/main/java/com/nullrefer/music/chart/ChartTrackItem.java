package com.nullrefer.music.chart;

/** 단일 차트 순위 항목 (플랫폼 공통 JSON 형태). */
public record ChartTrackItem(
    int rank,
    String trackId,
    String title,
    String artists,
    String album,
    String imageUrl,
    String externalUrl,
    long durationMs) {}
