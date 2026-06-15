package com.nullrefer.music.search;

import java.util.List;

public final class SpotifySearchDtos {

  private SpotifySearchDtos() {}

  public record SpotifyArtistSearchHit(
      String id, String name, String imageUrl, String spotifyUrl, long followers) {}

  public record SpotifyArtistSearchResult(List<SpotifyArtistSearchHit> artists) {}

  public record SpotifyArtistSearchPage(List<SpotifyArtistSearchHit> artists, String nextCursor) {}

  public record SpotifyAlbumSearchPage(List<SpotifyAlbumSearchHit> albums, String nextCursor) {}

  public record SpotifyTrackSearchPage(List<SpotifyTrackSearchHit> tracks, String nextCursor) {}

  public record SpotifyArtistInfo(
      String id,
      String name,
      String imageUrl,
      String spotifyUrl,
      long followers,
      int popularity,
      List<String> genres) {}

  public record SpotifyTrackSummary(
      String id,
      String name,
      String artists,
      String imageUrl,
      String spotifyUrl,
      int durationMs,
      int popularity) {}

  public record SpotifyAlbumSummary(
      String id, String name, String artists, String imageUrl, String spotifyUrl, String releaseDate) {}

  public record SpotifyArtistDetail(
      SpotifyArtistInfo info,
      List<SpotifyTrackSummary> topTracks,
      List<SpotifyAlbumSummary> albums) {}

  public record SpotifyAlbumSearchHit(
      String id, String name, String artists, String imageUrl, String spotifyUrl, String releaseDate) {}

  public record SpotifyAlbumSearchResult(List<SpotifyAlbumSearchHit> albums) {}

  public record SpotifyAlbumTrack(String id, String name, int trackNumber, int durationMs) {}

  public record SpotifyAlbumInfo(
      String id,
      String name,
      String artists,
      String imageUrl,
      String spotifyUrl,
      String releaseDate,
      int totalTracks,
      String label) {}

  public record SpotifyAlbumDetail(SpotifyAlbumInfo info, List<SpotifyAlbumTrack> tracks) {}

  public record SpotifyTrackSearchHit(
      String id,
      String name,
      String artists,
      String imageUrl,
      String spotifyUrl,
      String albumName,
      int durationMs) {}

  public record SpotifyTrackSearchResult(List<SpotifyTrackSearchHit> tracks) {}

  public record SpotifyTrackInfo(
      String id,
      String name,
      String artists,
      String albumName,
      String imageUrl,
      String spotifyUrl,
      int durationMs,
      int popularity,
      String previewUrl) {}

  public record SpotifyTrackDetail(SpotifyTrackInfo info) {}
}
