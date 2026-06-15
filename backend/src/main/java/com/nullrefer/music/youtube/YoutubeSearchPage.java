package com.nullrefer.music.youtube;

import java.util.List;

public record YoutubeSearchPage(List<YoutubeSearchHit> items, String nextCursor) {}
