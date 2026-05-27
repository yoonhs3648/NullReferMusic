package com.nullrefer.music.search;

import java.util.List;

public final class LastfmSearchDtos {

  private LastfmSearchDtos() {}

  public record LastfmImageDto(String url, String size) {}

  public record LastfmTagDto(String name, String url) {}

  public record LastfmArtistSearchHit(
      String name, String mbid, String url, String imageUrl, long listeners) {}

  public record LastfmArtistSearchResult(List<LastfmArtistSearchHit> artists) {}

  public record LastfmArtistInfoDto(
      String name,
      String mbid,
      String url,
      String imageUrl,
      String bioSummary,
      long listeners,
      long playcount,
      boolean onTour) {}

  public record LastfmSimilarArtistDto(String name, String url, String imageUrl) {}

  public record LastfmTrackSummaryDto(
      String name,
      String artist,
      String mbid,
      String url,
      String imageUrl,
      int rank,
      long playcount) {}

  public record LastfmAlbumSummaryDto(
      String name, String artist, String url, String imageUrl, long playcount) {}

  public record LastfmArtistDetailResult(
      LastfmArtistInfoDto info,
      List<LastfmSimilarArtistDto> similarArtists,
      List<LastfmTrackSummaryDto> topTracks,
      List<LastfmAlbumSummaryDto> topAlbums,
      List<LastfmTagDto> tags) {}

  public record LastfmAlbumSearchHit(
      String name, String artist, String mbid, String url, String imageUrl) {}

  public record LastfmAlbumSearchResult(List<LastfmAlbumSearchHit> albums) {}

  public record LastfmAlbumTrackDto(String name, String mbid, int rank, int durationSec) {}

  public record LastfmAlbumInfoDto(
      String name,
      String artist,
      String mbid,
      String url,
      String imageUrl,
      long listeners,
      long playcount,
      String published,
      String wikiSummary,
      List<LastfmAlbumTrackDto> tracks) {}

  public record LastfmAlbumDetailResult(LastfmAlbumInfoDto info, List<LastfmTagDto> tags) {}

  public record LastfmTrackSearchHit(
      String name, String artist, String mbid, String url, String imageUrl) {}

  public record LastfmTrackSearchResult(List<LastfmTrackSearchHit> tracks) {}

  public record LastfmTrackInfoDto(
      String name,
      String artist,
      String mbid,
      String album,
      String albumMbid,
      String artistMbid,
      String url,
      String imageUrl,
      int durationSec,
      long playcount,
      long listeners,
      String albumTrackPosition) {}

  public record LastfmTrackDetailResult(
      LastfmTrackInfoDto info,
      List<LastfmTrackSummaryDto> similarTracks,
      List<LastfmTagDto> tags) {}
}
