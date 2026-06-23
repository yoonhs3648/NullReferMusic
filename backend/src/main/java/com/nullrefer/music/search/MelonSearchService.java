package com.nullrefer.music.search;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.nullrefer.music.search.MelonSearchDtos.MelonAlbumDetailResult;
import com.nullrefer.music.search.MelonSearchDtos.MelonAlbumInfoDto;
import com.nullrefer.music.search.MelonSearchDtos.MelonAlbumSearchHit;
import com.nullrefer.music.search.MelonSearchDtos.MelonAlbumSearchPage;
import com.nullrefer.music.search.MelonSearchDtos.MelonAlbumSearchResult;
import com.nullrefer.music.search.MelonSearchDtos.MelonArtistSearchPage;
import com.nullrefer.music.search.MelonSearchDtos.MelonTrackSearchPage;
import com.nullrefer.music.search.MelonSearchDtos.MelonAlbumTrackDto;
import com.nullrefer.music.search.MelonSearchDtos.MelonArtistDetailResult;
import com.nullrefer.music.search.MelonSearchDtos.MelonArtistInfoDto;
import com.nullrefer.music.search.MelonSearchDtos.MelonArtistSearchHit;
import com.nullrefer.music.search.MelonSearchDtos.MelonArtistSearchResult;
import com.nullrefer.music.search.MelonSearchDtos.MelonDebutSongDto;
import com.nullrefer.music.search.MelonSearchDtos.MelonExternalLinkDto;
import com.nullrefer.music.search.MelonSearchDtos.MelonGroupMemberDto;
import com.nullrefer.music.search.MelonSearchDtos.MelonSnsSubLinkDto;
import com.nullrefer.music.search.MelonSearchDtos.MelonTrackCreditsDto;
import com.nullrefer.music.search.MelonSearchDtos.MelonTrackDetailResult;
import com.nullrefer.music.search.MelonSearchDtos.MelonTrackInfoDto;
import com.nullrefer.music.search.MelonSearchDtos.MelonTrackSearchHit;
import com.nullrefer.music.search.MelonSearchDtos.MelonTrackSearchResult;
import com.nullrefer.music.search.MelonSearchDtos.MelonTrackSummaryDto;
import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

/** 멜론 검색 (HTML 크롤링) */
@Service
public class MelonSearchService {

  private static final Logger log = LoggerFactory.getLogger(MelonSearchService.class);
  private static final String BASE = "https://www.melon.com";
  private static final int ARTIST_SEARCH_PAGE_SIZE = 20;
  private static final int ALBUM_SEARCH_PAGE_SIZE = 21;
  private static final int SONG_SEARCH_PAGE_SIZE = 50;
  private static final int ARTIST_POPULAR_TRACK_LIMIT = 15;
  private static final int ARTIST_POPULAR_ALBUM_LIMIT = 12;
  private static final int BIO_PREVIEW_MAX = 480;
  private static final int ALBUM_DESC_MAX = 360;

  private static final Pattern GO_ARTIST = Pattern.compile("goArtistDetail\\(['\"]?(\\d+)['\"]?\\)");
  private static final Pattern GO_ALBUM = Pattern.compile("goAlbumDetail\\(['\"]?(\\d+)['\"]?\\)");
  private static final Pattern GO_SONG = Pattern.compile("goSongDetail\\(['\"]?(\\d+)['\"]?\\)");
  private static final Pattern IMG_SRC = Pattern.compile("<img[^>]+src=\"([^\"]+)\"", Pattern.CASE_INSENSITIVE);
  private static final Pattern ARTIST_BLOCK = Pattern.compile("<div class=\"wrap_atist12\">", Pattern.CASE_INSENSITIVE);
  private static final Pattern ALBUM_BLOCK = Pattern.compile("<div class=\"wrap_album04\">", Pattern.CASE_INSENSITIVE);
  private static final Pattern SONG_ROW = Pattern.compile("<tr[\\s>]", Pattern.CASE_INSENSITIVE);

  private static final String USER_AGENT =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

  private final ObjectMapper objectMapper;
  private final ThreadLocal<String> melonCookieHeader = new ThreadLocal<>();
  private final RestClient restClient =
      RestClient.builder()
          .defaultHeader(HttpHeaders.USER_AGENT, USER_AGENT)
          .defaultHeader(HttpHeaders.ACCEPT, "text/html,application/xhtml+xml,application/json")
          .defaultHeader(HttpHeaders.ACCEPT_LANGUAGE, "ko-KR,ko;q=0.9")
          .defaultHeader(HttpHeaders.REFERER, BASE + "/")
          .build();

  public MelonSearchService(ObjectMapper objectMapper) {
    this.objectMapper = objectMapper;
  }

  public void setMelonCookieHeader(String cookieHeader) {
    if (cookieHeader == null || cookieHeader.isBlank()) {
      melonCookieHeader.remove();
    } else {
      melonCookieHeader.set(cookieHeader.trim());
    }
  }

  public void clearMelonCookieHeader() {
    melonCookieHeader.remove();
  }

  public MelonArtistSearchResult searchArtists(String query) {
    MelonArtistSearchPage page = searchArtistsPage(query, null);
    return new MelonArtistSearchResult(page.artists());
  }

  public MelonArtistSearchPage searchArtistsPage(String query, String cursor) {
    String q = requireQuery(query);
    int startIndex = parseStartIndex(cursor);
    String referer = artistSearchUrl(q, 1);
    String html = fetchHtml(artistSearchUrl(q, startIndex), referer);
    List<MelonArtistSearchHit> hits = parseArtistSearch(html, ARTIST_SEARCH_PAGE_SIZE);
    return new MelonArtistSearchPage(hits, nextCursor(startIndex, hits.size(), ARTIST_SEARCH_PAGE_SIZE));
  }

  public MelonAlbumSearchResult searchAlbums(String query) {
    MelonAlbumSearchPage page = searchAlbumsPage(query, null);
    return new MelonAlbumSearchResult(page.albums());
  }

  public MelonAlbumSearchPage searchAlbumsPage(String query, String cursor) {
    String q = requireQuery(query);
    int startIndex = parseStartIndex(cursor);
    String referer = albumSearchUrl(q, 1);
    String html = fetchHtml(albumSearchUrl(q, startIndex), referer);
    List<MelonAlbumSearchHit> hits = parseAlbumSearch(html, ALBUM_SEARCH_PAGE_SIZE);
    return new MelonAlbumSearchPage(hits, nextCursor(startIndex, hits.size(), ALBUM_SEARCH_PAGE_SIZE));
  }

  public MelonTrackSearchResult searchTracks(String query) {
    MelonTrackSearchPage page = searchTracksPage(query, null);
    return new MelonTrackSearchResult(page.tracks());
  }

  public MelonTrackSearchPage searchTracksPage(String query, String cursor) {
    String q = requireQuery(query);
    int startIndex = parseStartIndex(cursor);
    String referer = songSearchUrl(q, 1);
    String html = fetchHtml(songSearchUrl(q, startIndex), referer);
    List<MelonTrackSearchHit> hits = parseSongSearch(html, SONG_SEARCH_PAGE_SIZE);
    return new MelonTrackSearchPage(hits, nextCursor(startIndex, hits.size(), SONG_SEARCH_PAGE_SIZE));
  }

  public MelonArtistDetailResult fetchArtistDetail(String artistId, String artistName) {
    String id = requireId(artistId, "artistId");
    String detailUrl = BASE + "/artist/detail.htm?artistId=" + id;
    String html = fetchHtml(detailUrl);
    MelonArtistInfoDto info = parseArtistDetail(html, id);
    long fanCount = fetchFanCount(id, detailUrl);
    if (info.fanCount() == 0 && fanCount > 0) {
      info =
          new MelonArtistInfoDto(
              info.artistId(),
              info.name(),
              info.imageUrl(),
              info.bioSummary(),
              info.genre(),
              fanCount,
              info.debutDate(),
              info.artistType(),
              info.activeEra(),
              info.agency(),
              info.nationality(),
              info.debutSong(),
              info.groupMembers(),
              info.links(),
              info.url());
    }
    String songPagingUrl =
        BASE
            + "/artist/songPaging.htm?listType=A&orderBy=POPULAR_SONG_LIST&artistId="
            + id
            + "&startIndex=1";
    String albumPagingUrl =
        BASE
            + "/artist/albumPaging.htm?listType=0&orderBy=POPULAR_ALBUM_LIST&artistId="
            + id
            + "&startIndex=1";
    List<MelonTrackSummaryDto> popularTracks = parseArtistPopularSongs(fetchHtml(songPagingUrl));
    List<MelonAlbumSearchHit> popularAlbums = parseArtistPopularAlbums(fetchHtml(albumPagingUrl));
    return new MelonArtistDetailResult(info, popularTracks, popularAlbums);
  }

  public MelonAlbumDetailResult fetchAlbumDetail(String albumId) {
    String id = requireId(albumId, "albumId");
    String url = BASE + "/album/detail.htm?albumId=" + id;
    return parseAlbumDetail(fetchHtml(url), id);
  }

  public MelonTrackDetailResult fetchTrackDetail(String songId) {
    String id = requireId(songId, "songId");
    String url = BASE + "/song/detail.htm?songId=" + id;
    MelonTrackDetailResult parsed = parseSongDetail(fetchHtml(url), id);
    MelonAlbumDetailResult albumDetail = null;
    String albumId = parsed.info().albumId();
    if (albumId != null && !albumId.isBlank()) {
      albumDetail = parseAlbumDetail(fetchHtml(BASE + "/album/detail.htm?albumId=" + albumId), albumId);
    }
    return new MelonTrackDetailResult(parsed.info(), parsed.similarTracks(), albumDetail);
  }

  private String fetchHtml(String url) {
    return fetchHtml(url, BASE + "/");
  }

  private String fetchHtml(String url, String referer) {
    try {
      var request =
          restClient
              .get()
              .uri(URI.create(url))
              .header(HttpHeaders.REFERER, referer);
      String cookie = melonCookieHeader.get();
      if (cookie != null && !cookie.isBlank()) {
        request = request.header(HttpHeaders.COOKIE, cookie);
      }
      return request.retrieve().body(String.class);
    } catch (RestClientResponseException e) {
      log.warn("Melon search fetch failed {} status={}", url, e.getStatusCode().value());
      throw new IllegalStateException("melon_fetch_failed");
    } catch (Exception e) {
      log.warn("Melon search fetch error {}: {}", url, e.toString());
      throw new IllegalStateException("melon_fetch_failed");
    }
  }

  private static int parseStartIndex(String cursor) {
    if (cursor == null || cursor.isBlank()) {
      return 1;
    }
    try {
      int n = Integer.parseInt(cursor.trim());
      return n > 0 ? n : 1;
    } catch (NumberFormatException e) {
      return 1;
    }
  }

  private static String nextCursor(int startIndex, int itemCount, int pageSize) {
    return itemCount >= pageSize ? String.valueOf(startIndex + pageSize) : null;
  }

  private static String artistSearchUrl(String query, int startIndex) {
    String q = encode(query);
    if (startIndex <= 1) {
      return BASE + "/search/artist/index.htm?q=" + q;
    }
    return BASE + "/search/artist/listArtists.htm?q=" + q + "&startIndex=" + startIndex;
  }

  private static String albumSearchUrl(String query, int startIndex) {
    String q = encode(query);
    String base = BASE + "/search/album/index.htm?q=" + q;
    return startIndex <= 1 ? base : base + "&startIndex=" + startIndex;
  }

  private static String songSearchUrl(String query, int startIndex) {
    String q = encode(query);
    String base = BASE + "/search/song/index.htm?q=" + q;
    return startIndex <= 1 ? base : base + "&startIndex=" + startIndex;
  }

  private long fetchFanCount(String artistId, String referer) {
    try {
      String json =
          restClient
              .get()
              .uri(URI.create(BASE + "/artist/getArtistFanNTemper.json?artistId=" + artistId))
              .header(HttpHeaders.REFERER, referer)
              .retrieve()
              .body(String.class);
      JsonNode root = objectMapper.readTree(json);
      return Math.max(0, root.path("fanInfo").path("SUMMCNT").asLong(0));
    } catch (Exception e) {
      return 0;
    }
  }

  private List<MelonArtistSearchHit> parseArtistSearch(String html) {
    return parseArtistSearch(html, ARTIST_SEARCH_PAGE_SIZE);
  }

  private List<MelonArtistSearchHit> parseArtistSearch(String html, int limit) {
    List<MelonArtistSearchHit> hits = new ArrayList<>();
    if (html == null || html.isBlank()) {
      return hits;
    }
    java.util.Set<String> seen = new java.util.HashSet<>();
    String[] parts = ARTIST_BLOCK.split(html);
    for (int i = 1; i < parts.length && hits.size() < limit; i++) {
      String chunk = parts[i];
      String artistId =
          firstMatch(chunk, Pattern.compile("name=\"artistId\"\\s+value=\"(\\d+)\""));
      if (artistId == null) {
        artistId = firstMatch(chunk, GO_ARTIST);
      }
      if (artistId == null || seen.contains(artistId)) {
        continue;
      }
      seen.add(artistId);
      String name = parseArtistSearchName(chunk);
      if (name.isBlank()) {
        continue;
      }
      String genre = parseArtistSearchGenre(chunk);
      String profile = parseArtistSearchProfile(chunk);
      long fanCount = parseCount(firstMatchGroup(chunk, Pattern.compile("d_fan_cnt_" + artistId + "[^>]*>([^<]*)", Pattern.CASE_INSENSITIVE)));
      String imageUrl = parseThumbImage(chunk, "thumb");
      hits.add(
          new MelonArtistSearchHit(
              artistId,
              name,
              imageUrl,
              genre,
              profile,
              fanCount,
              BASE + "/artist/detail.htm?artistId=" + artistId));
    }
    return hits;
  }

  private static String parseArtistSearchName(String chunk) {
    String dtBlock =
        firstMatchGroup(chunk, Pattern.compile("<dt>[\\s\\S]*?</dt>", Pattern.CASE_INSENSITIVE));
    if (!dtBlock.isBlank()) {
      Matcher anchor =
          Pattern.compile(
                  "<a[^>]*class=\"ellipsis\"[^>]*>([\\s\\S]*?)</a>",
                  Pattern.CASE_INSENSITIVE)
              .matcher(dtBlock);
      if (anchor.find()) {
        String anchorTag = anchor.group(0);
        String inner = anchor.group(1);
        Matcher title = Pattern.compile("title=\"([^\"]*)\"", Pattern.CASE_INSENSITIVE).matcher(anchorTag);
        if (title.find()) {
          String fromTitle = stripMelonPageMoveSuffix(cleanText(title.group(1)));
          if (!fromTitle.isBlank()) {
            return fromTitle;
          }
        }
        String fromInner = cleanText(inner.replaceAll("<[^>]+>", ""));
        if (!fromInner.isBlank()) {
          return fromInner;
        }
      }
    }
    return cleanText(
        firstMatchGroup(
            chunk,
            Pattern.compile(
                "class=\"ellipsis\"[^>]*>([\\s\\S]*?)</a>\\s*</dt>", Pattern.CASE_INSENSITIVE)));
  }

  private static String parseArtistSearchGenre(String chunk) {
    String block =
        firstMatchGroup(
            chunk,
            Pattern.compile("class=\"genre-info\"[^>]*>([\\s\\S]*?)</div>", Pattern.CASE_INSENSITIVE));
    Matcher span = Pattern.compile("<span>([^<]*)</span>", Pattern.CASE_INSENSITIVE).matcher(block);
    List<String> parts = new ArrayList<>();
    while (span.find()) {
      String text = cleanText(span.group(1));
      if (!text.isBlank()) {
        parts.add(text);
      }
    }
    return String.join(", ", parts);
  }

  private static String parseArtistSearchProfile(String chunk) {
    return cleanText(firstMatchGroup(chunk, Pattern.compile("<dd class=\"gubun\">\\s*([^<]+)", Pattern.CASE_INSENSITIVE)));
  }

  private static String parseThumbImage(String chunk, String className) {
    Pattern[] patterns = {
      Pattern.compile("class=\"" + className + "\"[^>]*>[\\s\\S]*?<img[^>]+src=\"([^\"]+)\"", Pattern.CASE_INSENSITIVE),
      Pattern.compile("class=\"" + className + "\"[\\s\\S]*?<img[^>]+src=\"([^\"]+)\"", Pattern.CASE_INSENSITIVE),
    };
    for (Pattern pattern : patterns) {
      String src = firstMatch(chunk, pattern);
      String out = normalizeImg(src);
      if (out != null && !out.isBlank()) {
        return out;
      }
    }
    return "";
  }

  private static String parseAlbumCoverFromDetailHtml(String html) {
    Pattern[] patterns = {
      Pattern.compile("id=\"d_album_org\"[\\s\\S]*?<img[^>]+src=\"([^\"]+)\"", Pattern.CASE_INSENSITIVE),
      Pattern.compile("class=\"wrap_thumb\"[\\s\\S]*?<img[^>]+src=\"([^\"]+)\"", Pattern.CASE_INSENSITIVE),
      Pattern.compile("class=\"section_info\"[\\s\\S]*?class=\"thumb\"[\\s\\S]*?<img[^>]+src=\"([^\"]+)\"", Pattern.CASE_INSENSITIVE),
      Pattern.compile("property=\"og:image\"\\s+content=\"([^\"]+)\"", Pattern.CASE_INSENSITIVE),
    };
    for (Pattern pattern : patterns) {
      String src = firstMatchGroup(html, pattern);
      String out = normalizeImg(src);
      if (out != null && !out.isBlank()) {
        return out;
      }
    }
    return "";
  }

  private List<MelonAlbumSearchHit> parseAlbumSearch(String html) {
    return parseAlbumSearch(html, ALBUM_SEARCH_PAGE_SIZE);
  }

  private List<MelonAlbumSearchHit> parseAlbumSearch(String html, int limit) {
    List<MelonAlbumSearchHit> hits = new ArrayList<>();
    if (html == null || html.isBlank()) {
      return hits;
    }
    String[] parts = ALBUM_BLOCK.split(html);
    for (int i = 1; i < parts.length && hits.size() < limit; i++) {
      String chunk = parts[i];
      String albumId = firstMatch(chunk, GO_ALBUM);
      if (albumId == null) {
        continue;
      }
      Matcher nameM =
          Pattern.compile(
                  "<dt>[\\s\\S]*?<a[^>]*class=\"ellipsis\"[^>]*title=\"([^\"]+?)\\s*-\\s*페이지 이동\"[^>]*>([\\s\\S]*?)</a>",
                  Pattern.CASE_INSENSITIVE)
              .matcher(chunk);
      String name = "";
      if (nameM.find()) {
        name = stripMelonPageMoveSuffix(cleanText(nameM.group(1).isBlank() ? nameM.group(2) : nameM.group(1)));
      } else {
        Matcher nameFallback =
            Pattern.compile(
                    "<dt>[\\s\\S]*?<a[^>]*class=\"ellipsis\"[^>]*title=\"([^\"]+)[^\"]*\"[^>]*>([\\s\\S]*?)</a>",
                    Pattern.CASE_INSENSITIVE)
                .matcher(chunk);
        if (nameFallback.find()) {
          name =
              stripMelonPageMoveSuffix(
                  cleanText(nameFallback.group(1).isBlank() ? nameFallback.group(2) : nameFallback.group(1)));
        }
      }
      if (name.isBlank()) {
        continue;
      }
      Matcher artistM =
          Pattern.compile(
                  "class=\"atistname\"[\\s\\S]*?goArtistDetail\\(['\"]?(\\d+)['\"]?\\)[^>]*title=\"([^\"]+?)(?:\\s*-\\s*페이지 이동)?\"[^>]*>([^<]*)</a>",
                  Pattern.CASE_INSENSITIVE)
              .matcher(chunk);
      String artist = "";
      String artistId = safe(firstMatch(chunk, GO_ARTIST));
      if (artistM.find()) {
        artistId = artistM.group(1);
        artist = stripMelonPageMoveSuffix(cleanText(artistM.group(2).isBlank() ? artistM.group(3) : artistM.group(2)));
      }
      String releaseDate = cleanText(firstMatchGroup(chunk, Pattern.compile("class=\"cnt_view\">([^<]+)<")));
      String albumKind =
          normalizeMelonAlbumKind(cleanText(firstMatchGroup(chunk, Pattern.compile("class=\"vdo_name\">([^<]+)<"))));
      int trackCount = parseInt(firstMatchGroup(chunk, Pattern.compile("class=\"tot_song\">(\\d+)곡<")), 0);
      hits.add(
          new MelonAlbumSearchHit(
              albumId,
              name,
              artist,
              artistId,
              parseThumbImage(chunk, "thumb"),
              releaseDate,
              albumKind,
              trackCount,
              BASE + "/album/detail.htm?albumId=" + albumId));
    }
    return hits;
  }

  private List<MelonTrackSearchHit> parseSongSearch(String html) {
    return parseSongSearch(html, SONG_SEARCH_PAGE_SIZE);
  }

  private List<MelonTrackSearchHit> parseSongSearch(String html, int limit) {
    List<MelonTrackSearchHit> hits = new ArrayList<>();
    if (html == null || html.isBlank()) {
      return hits;
    }
    String[] parts = SONG_ROW.split(html);
    for (int i = 1; i < parts.length && hits.size() < limit; i++) {
      String chunk = "<tr" + parts[i];
      if (!chunk.contains("input_check")) {
        continue;
      }
      String songId = firstMatch(chunk, Pattern.compile("name=\"input_check\"\\s+value=\"(\\d+)\""));
      if (songId == null) {
        songId = firstMatch(chunk, GO_SONG);
      }
      if (songId == null) {
        continue;
      }
      String title = cleanText(firstMatchGroup(chunk, Pattern.compile("class=\"fc_gray\"\\s+title=\"([^\"]+)\"", Pattern.CASE_INSENSITIVE)));
      if (title.isBlank()) {
        title = cleanText(firstMatchGroup(chunk, Pattern.compile("title=\"([^\"]+) 재생\"", Pattern.CASE_INSENSITIVE)));
      }
      if (title.isBlank()) {
        continue;
      }
      Matcher artistM =
          Pattern.compile(
                  "goArtistDetail\\(['\"]?(\\d+)['\"]?\\)[^>]*title=\"([^\"]+)[^\"]*\"[^>]*>([^<]*)</a>",
                  Pattern.CASE_INSENSITIVE)
              .matcher(chunk);
      String artistId = "";
      String artist = "";
      if (artistM.find()) {
        artistId = artistM.group(1);
        artist = stripMelonPageMoveSuffix(cleanText(artistM.group(2).isBlank() ? artistM.group(3) : artistM.group(2)));
      }
      Matcher albumM =
          Pattern.compile(
                  "goAlbumDetail\\(['\"]?(\\d+)['\"]?\\)[^>]*title=\"([^\"]+)[^\"]*\"[^>]*>([^<]*)</a>",
                  Pattern.CASE_INSENSITIVE)
              .matcher(chunk);
      String albumId = "";
      String album = "";
      if (albumM.find()) {
        albumId = albumM.group(1);
        album = stripMelonPageMoveSuffix(cleanText(albumM.group(2).isBlank() ? albumM.group(3) : albumM.group(2)));
      }
      hits.add(
          new MelonTrackSearchHit(
              songId,
              title,
              artist,
              artistId,
              album,
              albumId,
              normalizeImg(firstMatch(chunk, IMG_SRC)),
              BASE + "/song/detail.htm?songId=" + songId));
    }
    return hits;
  }

  private MelonArtistInfoDto parseArtistDetail(String html, String artistId) {
    String name = cleanText(firstMatchGroup(html, Pattern.compile("class=\"title_atist\"[^>]*>(?:<strong[^>]*>[^<]*</strong>)?([^<]+)<")));
    String imageUrl = normalizeImg(firstMatchGroup(html, Pattern.compile("id=\"artistImgArea\"[\\s\\S]*?<img[^>]+src=\"([^\"]+)\"", Pattern.CASE_INSENSITIVE)));
    String bioRaw = firstMatchGroup(html, Pattern.compile("id=\"d_artist_intro\"[^>]*>([\\s\\S]*?)</div>\\s*<div class=\"wrap_btn\">", Pattern.CASE_INSENSITIVE));
    String bioSummary = truncateText(cleanText(bioRaw), BIO_PREVIEW_MAX);

    Map<String, String> activity = parseDefineBlock(html, "section_atistinfo03");
    Map<String, String> personal = parseDefineBlock(html, "section_atistinfo04");

    return new MelonArtistInfoDto(
        artistId,
        name,
        imageUrl,
        bioSummary,
        activity.getOrDefault("장르", ""),
        0,
        activity.getOrDefault("데뷔", ""),
        activity.getOrDefault("유형", ""),
        activity.getOrDefault("활동년대", ""),
        activity.getOrDefault("소속사명", ""),
        personal.getOrDefault("국적", ""),
        parseDebutSong(html),
        parseGroupMembers(html),
        parseArtistLinks(html),
        BASE + "/artist/detail.htm?artistId=" + artistId);
  }

  private Map<String, String> parseDefineBlock(String html, String sectionMarker) {
    Map<String, String> out = new HashMap<>();
    String block =
        firstMatchGroup(
            html,
            Pattern.compile(
                sectionMarker + "[\\s\\S]*?<dl class=\"list_define[^\"]*\">([\\s\\S]*?)</dl>",
                Pattern.CASE_INSENSITIVE));
    Matcher m = Pattern.compile("<dt>([^<]+)</dt>\\s*<dd>([\\s\\S]*?)</dd>", Pattern.CASE_INSENSITIVE).matcher(block);
    while (m.find()) {
      out.put(cleanText(m.group(1)), cleanText(m.group(2)));
    }
    return out;
  }

  private MelonDebutSongDto parseDebutSong(String html) {
    String block = firstMatchGroup(html, Pattern.compile("class=\"debutsong_info\"[\\s\\S]*?</div>\\s*</div>", Pattern.CASE_INSENSITIVE));
    if (block.isBlank()) {
      return null;
    }
    String songId = firstMatch(block, GO_SONG);
    if (songId == null) {
      return null;
    }
    String name =
        cleanText(firstMatchGroup(block, Pattern.compile("title=\"([^\"]+)\"\\s+class=\"ellipsis\"", Pattern.CASE_INSENSITIVE)));
    if (name.isBlank()) {
      name = cleanText(firstMatchGroup(block, Pattern.compile("title=\"([^\"]+)\"\\s+class=\"thumb\"", Pattern.CASE_INSENSITIVE)));
    }
    if (name.isBlank()) {
      return null;
    }
    return new MelonDebutSongDto(songId, name, normalizeImg(firstMatch(block, IMG_SRC)));
  }

  private List<MelonGroupMemberDto> parseGroupMembers(String html) {
    List<MelonGroupMemberDto> out = new ArrayList<>();
    String block =
        firstMatchGroup(
            html,
            Pattern.compile(
                "class=\"wrap_gmem\"[\\s\\S]*?<ul class=\"list_atist13[^\"]*\">([\\s\\S]*?)</ul>",
                Pattern.CASE_INSENSITIVE));
    if (block.isBlank()) {
      return out;
    }
    String[] parts = block.split("<li>");
    for (int i = 1; i < parts.length; i++) {
      String chunk = parts[i];
      String artistId = firstMatch(chunk, GO_ARTIST);
      if (artistId == null) {
        continue;
      }
      String name =
          cleanText(firstMatchGroup(chunk, Pattern.compile("title=\"([^\"]+)\"\\s+class=\"ellipsis\"", Pattern.CASE_INSENSITIVE)));
      if (name.isBlank()) {
        name = cleanText(firstMatchGroup(chunk, Pattern.compile("title=\"([^\"]+)\"\\s+class=\"thumb\"", Pattern.CASE_INSENSITIVE)));
      }
      if (name.isBlank()) {
        continue;
      }
      String profile = cleanText(firstMatchGroup(chunk, Pattern.compile("<dd class=\"gubun\">([\\s\\S]*?)</dd>", Pattern.CASE_INSENSITIVE)));
      out.add(new MelonGroupMemberDto(artistId, name, normalizeImg(firstMatch(chunk, IMG_SRC)), profile));
    }
    return out;
  }

  private List<MelonExternalLinkDto> parseArtistLinks(String html) {
    List<MelonExternalLinkDto> links = new ArrayList<>();
    List<MelonSnsSubLinkDto> snsItems = new ArrayList<>();
    String snsBlock = firstMatchGroup(html, Pattern.compile("id=\"artist_sns_list\"[\\s\\S]*?</dl>", Pattern.CASE_INSENSITIVE));
    Matcher snsM = Pattern.compile("onclick=\"window\\.open\\('([^']+)'", Pattern.CASE_INSENSITIVE).matcher(snsBlock);
    while (snsM.find()) {
      String url = snsM.group(1);
      if (url.contains("facebook")) {
        snsItems.add(new MelonSnsSubLinkDto("Facebook", url));
      } else if (url.contains("twitter") || url.contains("x.com")) {
        snsItems.add(new MelonSnsSubLinkDto("X", url));
      }
    }
    String infoBlock =
        firstMatchGroup(
            html,
            Pattern.compile(
                "class=\"section_atistinfo05\"[\\s\\S]*?</div>\\s*<!-- \\/\\/연관정보 -->",
                Pattern.CASE_INSENSITIVE));
    Matcher rowM = Pattern.compile("<dt>([^<]+)</dt>\\s*<dd>([\\s\\S]*?)</dd>", Pattern.CASE_INSENSITIVE).matcher(infoBlock);
    while (rowM.find()) {
      String label = cleanText(rowM.group(1));
      if ("Facebook".equals(label) || "X".equals(label) || "SNS".equals(label)) {
        continue;
      }
      String raw = rowM.group(2);
      String url = firstMatch(raw, Pattern.compile("href=\"([^\"]+)\"", Pattern.CASE_INSENSITIVE));
      String value = cleanText(raw.replaceAll("<[^>]+>", " ").replaceAll("\\s*\\|\\s*", " · "));
      if (!label.isBlank() && !value.isBlank()) {
        links.add(new MelonExternalLinkDto(label, value, safe(url), List.of()));
      }
    }
    if (!snsItems.isEmpty()) {
      String snsValue = snsItems.stream().map(MelonSnsSubLinkDto::label).reduce((a, b) -> a + ", " + b).orElse("");
      links.add(new MelonExternalLinkDto("SNS", snsValue, "", snsItems));
    }
    return links;
  }

  private MelonAlbumDetailResult parseAlbumDetail(String html, String albumId) {
    // [^<]* → [\\s\\S]*? : <strong><span class="none">앨범명</span></strong> 구조 대응
    String name = cleanText(firstMatchGroup(html, Pattern.compile("class=\"song_name\"[\\s\\S]*?<strong[^>]*>[\\s\\S]*?</strong>\\s*([^<\\r\\n]+)", Pattern.CASE_INSENSITIVE)));
    if (name.isEmpty()) {
      name = cleanText(firstMatchGroup(html, Pattern.compile("property=\"og:title\"\\s+content=\"([^\"]+)\"", Pattern.CASE_INSENSITIVE)));
    }
    String imageUrl = parseAlbumCoverFromDetailHtml(html);
    Matcher artistM =
        Pattern.compile(
                "class=\"artist\"[\\s\\S]*?goArtistDetail\\(['\"]?(\\d+)['\"]?\\)[^>]*title=\"([^\"]+)\"[^>]*>([^<]*)<",
                Pattern.CASE_INSENSITIVE)
            .matcher(html);
    String artistId = "";
    String artist = "";
    if (artistM.find()) {
      artistId = artistM.group(1);
      artist = cleanText(artistM.group(2).isBlank() ? artistM.group(3) : artistM.group(2));
    }
    String albumKind =
        normalizeMelonAlbumKind(
            cleanText(firstMatchGroup(html, Pattern.compile("class=\"gubun\"[\\s\\S]*?\\[([^[\\]]+)\\]")))
                .isBlank()
                ? cleanText(firstMatchGroup(html, Pattern.compile("class=\"vdo_name\">([^<]+)<")))
                : cleanText(firstMatchGroup(html, Pattern.compile("class=\"gubun\"[\\s\\S]*?\\[([^[\\]]+)\\]"))));
    String metaBlock = firstMatchGroup(html, Pattern.compile("class=\"meta\"[\\s\\S]*?<dl class=\"list\">([\\s\\S]*?)</dl>", Pattern.CASE_INSENSITIVE));
    String releaseDate = "";
    String genre = "";
    String label = "";
    String agency = "";
    Matcher metaM = Pattern.compile("<dt>([^<]+)</dt>\\s*<dd>([\\s\\S]*?)</dd>", Pattern.CASE_INSENSITIVE).matcher(metaBlock);
    while (metaM.find()) {
      String key = cleanText(metaM.group(1));
      String val = cleanText(metaM.group(2));
      switch (key) {
        case "발매일" -> releaseDate = val;
        case "장르" -> genre = val;
        case "발매사" -> label = val;
        case "기획사" -> agency = val;
        default -> {}
      }
    }
    long likeCount = parseCount(firstMatchGroup(html, Pattern.compile("id=\"d_like_count\"[^>]*>\\s*<span class=\"none\">[^<]*</span>\\s*([^<]+)", Pattern.CASE_INSENSITIVE)));
    int trackCount = parseInt(firstMatchGroup(html, Pattern.compile("수록곡\\s*<span class=\"sum\">\\((\\d+)\\)</span>", Pattern.CASE_INSENSITIVE)), 0);
    String descRaw =
        firstMatchGroup(
            html,
            Pattern.compile(
                "id=\"d_video_summary\"[^>]*>([\\s\\S]*?)</div>\\s*<!-- \\/\\/앨범소개글 -->",
                Pattern.CASE_INSENSITIVE));
    String description = truncateText(cleanText(descRaw), ALBUM_DESC_MAX);
    List<MelonAlbumTrackDto> tracks = parseAlbumTracks(html);
    MelonAlbumInfoDto info =
        new MelonAlbumInfoDto(
            albumId,
            name,
            artist,
            artistId,
            imageUrl,
            releaseDate,
            genre,
            albumKind,
            likeCount,
            trackCount > 0 ? trackCount : tracks.size(),
            label,
            agency,
            description,
            BASE + "/album/detail.htm?albumId=" + albumId,
            tracks);
    return new MelonAlbumDetailResult(info);
  }

  private List<MelonAlbumTrackDto> parseAlbumTracks(String html) {
    List<MelonAlbumTrackDto> tracks = new ArrayList<>();
    String tbody = firstMatchGroup(html, Pattern.compile("class=\"service_list_song[^\"]*d_song_list\"[\\s\\S]*?<tbody>([\\s\\S]*?)</tbody>", Pattern.CASE_INSENSITIVE));
    String[] rows = tbody.split("<tr");
    for (int i = 1; i < rows.length; i++) {
      String chunk = "<tr" + rows[i];
      String songId = firstMatch(chunk, Pattern.compile("name=\"input_check\"\\s+value=\"(\\d+)\""));
      if (songId == null) {
        songId = firstMatch(chunk, GO_SONG);
      }
      if (songId == null) {
        continue;
      }
      int rank = parseInt(firstMatchGroup(chunk, Pattern.compile("class=\"rank\\s*\">(\\d+)<")), tracks.size() + 1);
      String title = cleanText(firstMatchGroup(chunk, Pattern.compile("goSongDetail\\([^)]+\\)[^>]*title=\"([^\"]+)\\s*곡정보\"", Pattern.CASE_INSENSITIVE)));
      if (title.isBlank()) {
        Matcher playM = Pattern.compile("title=\"([^\"]+) 재생\">([^<]*)<", Pattern.CASE_INSENSITIVE).matcher(chunk);
        if (playM.find()) {
          title = cleanText(playM.group(1).isBlank() ? playM.group(2) : playM.group(1));
        }
      }
      String trackArtist = cleanText(firstMatchGroup(chunk, Pattern.compile("rank02[\\s\\S]*?<a[^>]*>([^<]+)</a>", Pattern.CASE_INSENSITIVE)));
      if (title.isBlank()) {
        continue;
      }
      tracks.add(new MelonAlbumTrackDto(songId, title, rank, trackArtist));
    }
    return tracks;
  }

  private MelonTrackDetailResult parseSongDetail(String html, String songId) {
    // [^<]* → [\\s\\S]*? : <strong><span class="none">곡명</span></strong> 구조 대응
    String name = cleanText(firstMatchGroup(html, Pattern.compile("class=\"song_name\"[\\s\\S]*?<strong[^>]*>[\\s\\S]*?</strong>\\s*([^<\\r\\n]+)", Pattern.CASE_INSENSITIVE)));
    if (name.isEmpty()) {
      name = cleanText(firstMatchGroup(html, Pattern.compile("property=\"og:title\"\\s+content=\"([^\"]+)\"", Pattern.CASE_INSENSITIVE)));
    }
    String imageUrl = normalizeImg(firstMatchGroup(html, Pattern.compile("id=\"d_song_org\"[\\s\\S]*?<img[^>]+src=\"([^\"]+)\"", Pattern.CASE_INSENSITIVE)));
    Matcher artistM =
        Pattern.compile(
                "class=\"artist\"[\\s\\S]*?goArtistDetail\\(['\"]?(\\d+)['\"]?\\)[^>]*title=\"([^\"]+)\"[^>]*>([^<]*)<",
                Pattern.CASE_INSENSITIVE)
            .matcher(html);
    String artistId = "";
    String artist = "";
    if (artistM.find()) {
      artistId = artistM.group(1);
      artist = cleanText(artistM.group(2).isBlank() ? artistM.group(3) : artistM.group(2));
    }
    String metaBlock = firstMatchGroup(html, Pattern.compile("class=\"meta\"[\\s\\S]*?<dl class=\"list\">([\\s\\S]*?)</dl>", Pattern.CASE_INSENSITIVE));
    String album = "";
    String albumId = "";
    String releaseDate = "";
    String genre = "";
    Matcher metaM = Pattern.compile("<dt>([^<]+)</dt>\\s*<dd>([\\s\\S]*?)</dd>", Pattern.CASE_INSENSITIVE).matcher(metaBlock);
    while (metaM.find()) {
      String key = cleanText(metaM.group(1));
      String valRaw = metaM.group(2);
      if ("앨범".equals(key)) {
        albumId = safe(firstMatch(valRaw, GO_ALBUM));
        album = cleanText(valRaw.replaceAll("<[^>]+>", ""));
      } else if ("발매일".equals(key)) {
        releaseDate = cleanText(valRaw);
      } else if ("장르".equals(key)) {
        genre = cleanText(valRaw);
      }
    }
    long likeCount = parseCount(firstMatchGroup(html, Pattern.compile("id=\"d_like_count\"[^>]*>\\s*<span class=\"none\">[^<]*</span>\\s*([^<]+)", Pattern.CASE_INSENSITIVE)));
    String similarTbody =
        firstMatchGroup(
            html,
            Pattern.compile(
                "스타일이 유사한 인기곡[\\s\\S]*?class=\"service_list_song[^\"]*d_song_list\"[\\s\\S]*?<tbody>([\\s\\S]*?)</tbody>",
                Pattern.CASE_INSENSITIVE));
    List<MelonTrackSummaryDto> similar = parseSimilarTracks(similarTbody);
    String lyrics = parseSongLyrics(html);
    boolean lyricsAdultAuthRequired = isMelonLyricsSectionAdultAuthRequired(html) && lyrics.isBlank();
    MelonTrackInfoDto info =
        new MelonTrackInfoDto(
            songId,
            name,
            artist,
            artistId,
            album,
            albumId,
            imageUrl,
            releaseDate,
            genre,
            likeCount,
            BASE + "/song/detail.htm?songId=" + songId,
            lyrics,
            lyricsAdultAuthRequired,
            parseSongCredits(html));
    return new MelonTrackDetailResult(info, similar, null);
  }

  private static boolean isMelonLyricsSectionAdultAuthRequired(String html) {
    String block =
        firstMatchGroup(
            html,
            Pattern.compile("<!--\\s*가사\\s*-->[\\s\\S]*?<!--\\s*//가사\\s*-->", Pattern.CASE_INSENSITIVE));
    if (block.isBlank()) {
      return false;
    }
    if (Pattern.compile("adultcheck|goAdult|btn_adult|needAdult|성인\\s*인증\\s*후", Pattern.CASE_INSENSITIVE)
        .matcher(block)
        .find()) {
      return true;
    }
    String raw =
        firstMatchGroup(
            block,
            Pattern.compile(
                "class=\"lyric\"[^>]*id=\"d_video_summary\"[^>]*>([\\s\\S]*?)</div>",
                Pattern.CASE_INSENSITIVE));
    if (raw.isBlank()) {
      raw =
          firstMatchGroup(
              block,
              Pattern.compile("id=\"d_video_summary\"[^>]*>([\\s\\S]*?)</div>", Pattern.CASE_INSENSITIVE));
    }
    return isMelonAdultAuthBlockedLyrics(cleanMultilineText(raw));
  }

  private static String parseSongLyrics(String html) {
    String block =
        firstMatchGroup(
            html,
            Pattern.compile("<!--\\s*가사\\s*-->[\\s\\S]*?<!--\\s*//가사\\s*-->", Pattern.CASE_INSENSITIVE));
    String raw =
        firstMatchGroup(
            block,
            Pattern.compile(
                "class=\"lyric\"[^>]*id=\"d_video_summary\"[^>]*>([\\s\\S]*?)</div>",
                Pattern.CASE_INSENSITIVE));
    if (raw.isBlank()) {
      raw =
          firstMatchGroup(
              block,
              Pattern.compile("id=\"d_video_summary\"[^>]*>([\\s\\S]*?)</div>", Pattern.CASE_INSENSITIVE));
    }
    String text = cleanMultilineText(raw);
    if (isMelonAdultAuthBlockedLyrics(text)) {
      return "";
    }
    return text;
  }

  private static boolean isMelonAdultAuthBlockedLyrics(String text) {
    String t = text == null ? "" : text.trim();
    if (t.isBlank() || t.length() > 200) {
      return false;
    }
    return t.contains("성인") && t.contains("인증")
        || t.contains("19") && t.contains("세")
        || t.contains("본인") && t.contains("인증")
        || t.contains("청소년") && t.contains("유해");
  }

  private static MelonTrackCreditsDto parseSongCredits(String html) {
    String block =
        firstMatchGroup(
            html, Pattern.compile("class=\"section_prdcr\"[\\s\\S]*?<!--\\s*//작사", Pattern.CASE_INSENSITIVE));
    List<String> lyricists = new ArrayList<>();
    List<String> composers = new ArrayList<>();
    List<String> arrangers = new ArrayList<>();
    Matcher liM = Pattern.compile("<li>[\\s\\S]*?</li>", Pattern.CASE_INSENSITIVE).matcher(block);
    while (liM.find()) {
      String li = liM.group();
      String name = cleanText(firstMatchGroup(li, Pattern.compile("class=\"artist_name\"[^>]*>([^<]*)<", Pattern.CASE_INSENSITIVE)));
      String type = cleanText(firstMatchGroup(li, Pattern.compile("class=\"type\">([^<]*)<", Pattern.CASE_INSENSITIVE)));
      if (name.isBlank()) {
        continue;
      }
      if (type.contains("작사")) {
        lyricists.add(name);
      } else if (type.contains("작곡")) {
        composers.add(name);
      } else if (type.contains("편곡")) {
        arrangers.add(name);
      }
    }
    return new MelonTrackCreditsDto(String.join(", ", lyricists), String.join(", ", composers), String.join(", ", arrangers));
  }

  private List<MelonTrackSummaryDto> parseArtistPopularSongs(String html) {
    List<MelonTrackSummaryDto> out = new ArrayList<>();
    if (html == null || html.isBlank()) {
      return out;
    }
    String tbody =
        firstMatchGroup(html, Pattern.compile("<tbody>([\\s\\S]*?)</tbody>", Pattern.CASE_INSENSITIVE));
    if (tbody.isBlank()) {
      tbody = html;
    }
    String[] rows = tbody.split("<tr");
    for (int i = 1; i < rows.length && out.size() < ARTIST_POPULAR_TRACK_LIMIT; i++) {
      MelonTrackSummaryDto row = parseArtistSongRow("<tr" + rows[i], out.size() + 1);
      if (row != null) {
        out.add(row);
      }
    }
    return out;
  }

  private MelonTrackSummaryDto parseArtistSongRow(String chunk, int rankFallback) {
    String songId = firstMatch(chunk, Pattern.compile("name=\"input_check\"\\s+value=\"(\\d+)\""));
    if (songId == null) {
      songId = firstMatch(chunk, GO_SONG);
    }
    if (songId == null) {
      return null;
    }
    int rank =
        parseInt(
            firstMatchGroup(
                chunk,
                Pattern.compile("class=\"no\"[^>]*>[\\s\\S]*?>(\\d+)<", Pattern.CASE_INSENSITIVE)),
            rankFallback);
    String title =
        cleanText(
            firstMatchGroup(
                chunk,
                Pattern.compile(
                    "goSongDetail\\([^)]+\\)[^>]*title=\"([^\"]+?)\\s*곡정보\"",
                    Pattern.CASE_INSENSITIVE)));
    if (title.isBlank()) {
      title =
          cleanText(
              firstMatchGroup(
                  chunk,
                  Pattern.compile(
                      "btn_icon_detail[^>]*><span class=\"odd_span\">([^<]+)",
                      Pattern.CASE_INSENSITIVE)));
    }
    if (title.isBlank()) {
      return null;
    }
    String artistBlock =
        firstMatchGroup(
            chunk, Pattern.compile("wrapArtistName[\\s\\S]*?</td>", Pattern.CASE_INSENSITIVE));
    if (artistBlock.isBlank()) {
      artistBlock = chunk;
    }
    Matcher artistM =
        Pattern.compile(
                "goArtistDetail\\(['\"]?(\\d+)['\"]?\\)[^>]*title=\"([^\"]+)[^\"]*\"[^>]*>([^<]*)</a>",
                Pattern.CASE_INSENSITIVE)
            .matcher(artistBlock);
    String artistId = "";
    String artist = "";
    if (artistM.find()) {
      artistId = artistM.group(1);
      artist = stripMelonPageMoveSuffix(cleanText(artistM.group(2).isBlank() ? artistM.group(3) : artistM.group(2)));
    }
    Matcher albumM =
        Pattern.compile(
                "goAlbumDetail\\(['\"]?(\\d+)['\"]?\\)[^>]*title=\"([^\"]+)[^\"]*\"[^>]*>([^<]*)</a>",
                Pattern.CASE_INSENSITIVE)
            .matcher(chunk);
    String albumId = "";
    String album = "";
    if (albumM.find()) {
      albumId = albumM.group(1);
      album = stripMelonPageMoveSuffix(cleanText(albumM.group(2).isBlank() ? albumM.group(3) : albumM.group(2)));
    }
    long likeCount =
        parseCount(
            firstMatchGroup(
                chunk,
                Pattern.compile("class=\"cnt\"[^>]*>[\\s\\S]*?>([^<]+)<", Pattern.CASE_INSENSITIVE)));
    return new MelonTrackSummaryDto(
        songId, title, artist, artistId, album, albumId, "", rank, likeCount);
  }

  private List<MelonAlbumSearchHit> parseArtistPopularAlbums(String html) {
    List<MelonAlbumSearchHit> hits = new ArrayList<>();
    if (html == null || html.isBlank()) {
      return hits;
    }
    String[] parts = ALBUM_BLOCK.split(html);
    for (int i = 1; i < parts.length && hits.size() < ARTIST_POPULAR_ALBUM_LIMIT; i++) {
      MelonAlbumSearchHit hit = parseAlbumBlockChunk(parts[i]);
      if (hit != null) {
        hits.add(hit);
      }
    }
    return hits;
  }

  private MelonAlbumSearchHit parseAlbumBlockChunk(String chunk) {
    String albumId = firstMatch(chunk, GO_ALBUM);
    if (albumId == null) {
      return null;
    }
    Matcher nameM =
        Pattern.compile(
                "<dt>[\\s\\S]*?<a[^>]*class=\"ellipsis\"[^>]*title=\"([^\"]+?)\\s*-\\s*페이지 이동\"[^>]*>([\\s\\S]*?)</a>",
                Pattern.CASE_INSENSITIVE)
            .matcher(chunk);
    String name = "";
    if (nameM.find()) {
      name = stripMelonPageMoveSuffix(cleanText(nameM.group(1).isBlank() ? nameM.group(2).replaceAll("<[^>]+>", "") : nameM.group(1)));
    } else {
      Matcher nameFallback =
          Pattern.compile(
                  "<dt>[\\s\\S]*?<a[^>]*class=\"ellipsis\"[^>]*title=\"([^\"]+)[^\"]*\"[^>]*>([\\s\\S]*?)</a>",
                  Pattern.CASE_INSENSITIVE)
              .matcher(chunk);
      if (nameFallback.find()) {
        name =
            stripMelonPageMoveSuffix(
                cleanText(nameFallback.group(1).isBlank() ? nameFallback.group(2).replaceAll("<[^>]+>", "") : nameFallback.group(1)));
      }
    }
    if (name.isBlank()) {
      return null;
    }
    Matcher artistM =
        Pattern.compile(
                "class=\"atistname\"[\\s\\S]*?goArtistDetail\\(['\"]?(\\d+)['\"]?\\)[^>]*title=\"([^\"]+?)(?:\\s*-\\s*페이지 이동)?\"[^>]*>([^<]*)</a>",
                Pattern.CASE_INSENSITIVE)
            .matcher(chunk);
    String artistId = "";
    String artist = "";
    if (artistM.find()) {
      artistId = artistM.group(1);
      artist = stripMelonPageMoveSuffix(cleanText(artistM.group(2).isBlank() ? artistM.group(3) : artistM.group(2)));
    }
    String releaseDate = cleanText(firstMatchGroup(chunk, Pattern.compile("class=\"cnt_view\">([^<]+)<")));
    String albumKind =
        normalizeMelonAlbumKind(cleanText(firstMatchGroup(chunk, Pattern.compile("class=\"vdo_name\">([^<]+)<"))));
    int trackCount =
        parseInt(firstMatchGroup(chunk, Pattern.compile("class=\"tot_song\">(\\d+)곡<")), 0);
    return new MelonAlbumSearchHit(
        albumId,
        name,
        artist,
        artistId,
        parseThumbImage(chunk, "thumb"),
        releaseDate,
        albumKind,
        trackCount,
        BASE + "/album/detail.htm?albumId=" + albumId);
  }

  private List<MelonTrackSummaryDto> parseSimilarTracks(String tbody) {
    List<MelonTrackSummaryDto> out = new ArrayList<>();
    if (tbody == null || tbody.isBlank()) {
      return out;
    }
    String[] rows = tbody.split("<tr");
    for (int i = 1; i < rows.length && out.size() < 12; i++) {
      String chunk = "<tr" + rows[i];
      String songId = firstMatch(chunk, Pattern.compile("name=\"input_check\"\\s+value=\"(\\d+)\""));
      if (songId == null) {
        songId = firstMatch(chunk, GO_SONG);
      }
      if (songId == null) {
        continue;
      }
      int rank = parseInt(firstMatchGroup(chunk, Pattern.compile("class=\"rank\\s*\">(\\d+)<")), out.size() + 1);
      String title = cleanText(firstMatchGroup(chunk, Pattern.compile("goSongDetail\\([^)]+\\)[^>]*title=\"([^\"]+)\\s*곡정보\"", Pattern.CASE_INSENSITIVE)));
      if (title.isBlank()) {
        Matcher playM = Pattern.compile("title=\"([^\"]+) 재생\">([^<]*)<", Pattern.CASE_INSENSITIVE).matcher(chunk);
        if (playM.find()) {
          title = cleanText(playM.group(1).isBlank() ? playM.group(2) : playM.group(1));
        }
      }
      if (title.isBlank()) {
        continue;
      }
      out.add(
          new MelonTrackSummaryDto(
              songId,
              title,
              cleanText(firstMatchGroup(chunk, Pattern.compile("rank02[\\s\\S]*?<a[^>]*>([^<]+)</a>", Pattern.CASE_INSENSITIVE))),
              safe(firstMatch(chunk, GO_ARTIST)),
              cleanText(firstMatchGroup(chunk, Pattern.compile("rank03[\\s\\S]*?<a[^>]*>([^<]+)</a>", Pattern.CASE_INSENSITIVE))),
              safe(firstMatch(chunk, GO_ALBUM)),
              normalizeImg(firstMatch(chunk, IMG_SRC)),
              rank,
              0));
    }
    return out;
  }

  private static String truncateText(String text, int max) {
    if (text == null || text.length() <= max) {
      return text == null ? "" : text.trim();
    }
    return text.substring(0, max).trim() + "…";
  }

  private static String requireQuery(String query) {
    String q = query == null ? "" : query.trim();
    if (q.isEmpty()) {
      throw new IllegalArgumentException("melon_search_query_required");
    }
    return q;
  }

  private static String requireId(String id, String label) {
    String v = id == null ? "" : id.trim();
    if (v.isEmpty()) {
      throw new IllegalArgumentException("melon_search_id_required:" + label);
    }
    return v;
  }

  private static String encode(String q) {
    return URLEncoder.encode(q, StandardCharsets.UTF_8);
  }

  private static String firstMatch(String text, Pattern pattern) {
    if (text == null) {
      return null;
    }
    Matcher m = pattern.matcher(text);
    if (!m.find()) {
      return null;
    }
    return m.groupCount() >= 1 ? m.group(1) : m.group(0);
  }

  private static String firstMatchGroup(String text, Pattern pattern) {
    String v = firstMatch(text, pattern);
    return v == null ? "" : v;
  }

  private static String stripMelonPageMoveSuffix(String name) {
    return cleanText(name.replaceAll("\\s*-\\s*페이지\\s*이동\\s*$", ""));
  }

  private static String normalizeMelonAlbumKind(String raw) {
    String t = cleanText(raw);
    Matcher m = Pattern.compile("^\\[(.+)\\]$").matcher(t);
    return m.matches() ? cleanText(m.group(1)) : t;
  }

  private static String cleanMultilineText(String raw) {
    if (raw == null || raw.isBlank()) {
      return "";
    }
    return raw
        .replace("&nbsp;", " ")
        .replace("&amp;", "&")
        .replaceAll("(?i)<br\\s*/?>", "\n")
        .replaceAll("<[^>]+>", "")
        .replaceAll("\\r\\n", "\n")
        .replaceAll("\\n{3,}", "\n\n")
        .trim();
  }

  private static String cleanText(String raw) {
    if (raw == null) {
      return "";
    }
    return raw
        .replace("&nbsp;", " ")
        .replace("&amp;", "&")
        .replaceAll("(?i)</?b>", "")
        .replaceAll("<[^>]+>", "")
        .replaceAll("\\s+", " ")
        .trim();
  }

  private static String normalizeImg(String src) {
    if (src == null || src.isBlank()) {
      return "";
    }
    String url = src.trim();
    if (url.startsWith("//")) {
      url = "https:" + url;
    }
    if (url.contains("/default/noAlbum")
        || url.contains("/default/noArtist")
        || url.contains("/default/noMovie")) {
      return "";
    }
    return url.replace("/melon/resize/240", "/melon/resize/500")
        .replace("/melon/resize/260", "/melon/resize/500");
  }

  private static long parseCount(String raw) {
    if (raw == null || raw.isBlank() || "0".equals(raw.trim())) {
      return 0;
    }
    if (raw.contains("+")) {
      return 99999;
    }
    try {
      return Long.parseLong(raw.replace(",", "").trim());
    } catch (NumberFormatException e) {
      return 0;
    }
  }

  private static int parseInt(String raw, int fallback) {
    if (raw == null || raw.isBlank()) {
      return fallback;
    }
    try {
      return Integer.parseInt(raw.trim());
    } catch (NumberFormatException e) {
      return fallback;
    }
  }

  private static String safe(String v) {
    return v == null ? "" : v;
  }
}
