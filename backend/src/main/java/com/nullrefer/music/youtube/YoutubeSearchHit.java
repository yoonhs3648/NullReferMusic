package com.nullrefer.music.youtube;

public record YoutubeSearchHit(
    String videoId,
    String title,
    String channelTitle,
    String thumbnailUrl) {}
