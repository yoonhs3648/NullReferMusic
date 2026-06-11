package com.nullrefer.music.search;

import java.util.List;

public final class MelonSearchDtos {

  private MelonSearchDtos() {}

  public record MelonArtistSearchHit(
      String artistId,
      String name,
      String imageUrl,
      String genre,
      String profile,
      long fanCount,
      String url) {}

  public record MelonArtistSearchResult(List<MelonArtistSearchHit> artists) {}

  public record MelonAlbumSearchHit(
      String albumId,
      String name,
      String artist,
      String artistId,
      String imageUrl,
      String releaseDate,
      String albumKind,
      int trackCount,
      String url) {}

  public record MelonAlbumSearchResult(List<MelonAlbumSearchHit> albums) {}

  public record MelonTrackSearchHit(
      String songId,
      String name,
      String artist,
      String artistId,
      String album,
      String albumId,
      String imageUrl,
      String url) {}

  public record MelonTrackSearchResult(List<MelonTrackSearchHit> tracks) {}

  public record MelonDebutSongDto(String songId, String name, String imageUrl) {}

  public record MelonGroupMemberDto(
      String artistId, String name, String imageUrl, String profile) {}

  public record MelonSnsSubLinkDto(String label, String url) {}

  public record MelonExternalLinkDto(
      String label, String value, String url, List<MelonSnsSubLinkDto> snsItems) {}

  public record MelonTrackCreditsDto(String lyricists, String composers, String arrangers) {}

  public record MelonArtistInfoDto(
      String artistId,
      String name,
      String imageUrl,
      String bioSummary,
      String genre,
      long fanCount,
      String debutDate,
      String artistType,
      String activeEra,
      String agency,
      String nationality,
      MelonDebutSongDto debutSong,
      List<MelonGroupMemberDto> groupMembers,
      List<MelonExternalLinkDto> links,
      String url) {}

  public record MelonArtistDetailResult(
      MelonArtistInfoDto info,
      List<MelonTrackSummaryDto> popularTracks,
      List<MelonAlbumSearchHit> popularAlbums) {}

  public record MelonAlbumTrackDto(String songId, String name, int rank, String artist) {}

  public record MelonAlbumInfoDto(
      String albumId,
      String name,
      String artist,
      String artistId,
      String imageUrl,
      String releaseDate,
      String genre,
      String albumKind,
      long likeCount,
      int trackCount,
      String label,
      String agency,
      String description,
      String url,
      List<MelonAlbumTrackDto> tracks) {}

  public record MelonAlbumDetailResult(MelonAlbumInfoDto info) {}

  public record MelonTrackSummaryDto(
      String songId,
      String name,
      String artist,
      String artistId,
      String album,
      String albumId,
      String imageUrl,
      int rank,
      long likeCount) {}

  public record MelonTrackInfoDto(
      String songId,
      String name,
      String artist,
      String artistId,
      String album,
      String albumId,
      String imageUrl,
      String releaseDate,
      String genre,
      long likeCount,
      String url,
      String lyrics,
      MelonTrackCreditsDto credits) {}

  public record MelonTrackDetailResult(
      MelonTrackInfoDto info,
      List<MelonTrackSummaryDto> similarTracks,
      MelonAlbumDetailResult albumDetail) {}
}
