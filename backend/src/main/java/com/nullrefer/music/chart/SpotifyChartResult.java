package com.nullrefer.music.chart;

import java.time.Instant;
import java.util.List;

public record SpotifyChartResult(
    String platform,
    String playlistId,
    String playlistName,
    String market,
    Instant fetchedAt,
    List<ChartTrackItem> items) {}
