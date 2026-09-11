import {
  assertAllowedLastfmUrl,
  artistMethodToTrackMethod,
  buildLastfmArtistTopTagsUrl,
  buildLastfmTopArtistsUrl,
  buildLastfmTopTracksUrl,
  buildLastfmTrackTopTagsUrl,
  decideLastfmCatalogTrack,
  lastfmCatalogRequiresHipHop,
  lastfmCatalogSourceIsHipHop,
  lastfmCheapKoreanVerdict,
  parseLastfmTopArtists,
  parseLastfmTopTracks,
  selectLastfmVectorTags,
  uniqueArtistsFromTopTracks,
} from "./lastfm.ts";
import {
  parseArtistSearch,
  parseRecordingSearch,
  selectArtistSearchMatch,
  selectRecordingSearchMatch,
} from "./musicbrainz.ts";

Deno.test("parse Last.fm geo top artists", () => {
  const page = parseLastfmTopArtists(
    {
      topartists: {
        artist: [
          { name: "IU", mbid: "b450ba80-9c89-4e40-a11a-ec7d3c5399c9", playcount: "10", "@attr": { rank: "1" } },
          { name: "NoMbid", mbid: "", listeners: "3", "@attr": { rank: "2" } },
        ],
      },
    },
    "geo.getTopArtists",
    "South Korea",
    100,
  );
  if (page.artists.length !== 2) throw new Error("expected 2 artists");
  if (page.artists[0].mbid !== "b450ba80-9c89-4e40-a11a-ec7d3c5399c9") {
    throw new Error("mbid normalize failed");
  }
  if (page.artists[1].mbid !== null) throw new Error("blank mbid must be null");
});

Deno.test("build Last.fm URLs", () => {
  const geo = buildLastfmTopArtistsUrl("0123456789abcdef", "geo.getTopArtists", "South Korea", 100);
  if (!geo.href.includes("method=geo.getTopArtists")) throw new Error("geo method");
  if (!geo.href.includes("country=Korea%2C%20Republic%20of")) {
    throw new Error(`country must use %20 like the app chart client (got ${geo.href})`);
  }
  const geoCountry = geo.searchParams.get("country");
  if (geoCountry !== "Korea, Republic of") {
    throw new Error(`South Korea must normalize to Korea, Republic of (got ${geoCountry})`);
  }
  const chart = buildLastfmTopArtistsUrl("0123456789abcdef", "chart.getTopArtists", null, 100);
  if (!chart.href.includes("method=chart.getTopArtists")) throw new Error("chart method");
  const tag = buildLastfmTopArtistsUrl("0123456789abcdef", "tag.getTopArtists", "hip-hop", 100);
  if (!tag.href.includes("tag=hip-hop")) throw new Error("tag param");
  assertAllowedLastfmUrl(geo.href);
});

Deno.test("Last.fm 0-based rank falls back to page position", () => {
  const page = parseLastfmTopTracks(
    {
      toptracks: {
        track: [
          {
            name: "Zero",
            artist: { name: "IU" },
            "@attr": { rank: "0" },
          },
        ],
      },
    },
    "geo.getTopTracks",
    "Korea, Republic of",
    1,
    50,
  );
  if (page.tracks[0]?.rank !== 1) throw new Error("rank 0 must become 1");
});

Deno.test("parse Last.fm geo top tracks from app-shaped tracks container", () => {
  const page = parseLastfmTopTracks(
    {
      tracks: {
        track: [
          {
            name: "Good Day",
            artist: { name: "IU", mbid: "b450ba80-9c89-4e40-a11a-ec7d3c5399c9" },
            "@attr": { rank: "1" },
          },
        ],
      },
    },
    "geo.getTopTracks",
    "Korea, Republic of",
    1,
    50,
  );
  if (page.tracks[0]?.artistName !== "IU") throw new Error("tracks container must parse");
});

Deno.test("parse Last.fm geo top tracks", () => {
  const page = parseLastfmTopTracks(
    {
      toptracks: {
        track: [
          {
            name: "Good Day",
            artist: { name: "IU", mbid: "b450ba80-9c89-4e40-a11a-ec7d3c5399c9" },
            mbid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            "@attr": { rank: "1" },
          },
        ],
        "@attr": { page: "1", perPage: "50", totalPages: "3", total: "120" },
      },
    },
    "geo.getTopTracks",
    "Korea, Republic of",
    1,
    50,
  );
  if (page.tracks.length !== 1) throw new Error("expected 1 track");
  if (page.tracks[0].artistName !== "IU") throw new Error("artist name");
  if (page.totalPages !== 3) throw new Error("totalPages");
});

Deno.test("build Last.fm track URLs", () => {
  const geo = buildLastfmTopTracksUrl("0123456789abcdef", "geo.getTopTracks", "South Korea", 2, 50);
  if (geo.searchParams.get("method") !== "geo.getTopTracks") throw new Error("geo tracks method");
  if (geo.searchParams.get("page") !== "2") throw new Error("page");
  const tags = buildLastfmTrackTopTagsUrl("0123456789abcdef", {
    mbid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  });
  if (tags.searchParams.get("method") !== "track.getTopTags") throw new Error("top tags method");
});

Deno.test("artist pool uses the same Top Tracks methods as the app charts", () => {
  if (artistMethodToTrackMethod("geo.getTopArtists") !== "geo.getTopTracks") {
    throw new Error("korea artist pool must use geo.getTopTracks");
  }
  if (artistMethodToTrackMethod("chart.getTopArtists") !== "chart.getTopTracks") {
    throw new Error("global artist pool must use chart.getTopTracks");
  }
  const artists = uniqueArtistsFromTopTracks(
    [
      { rank: 1, title: "A", artistName: "IU", mbid: null, artistMbid: "b450ba80-9c89-4e40-a11a-ec7d3c5399c9", playcount: 1, listeners: 1 },
      { rank: 2, title: "B", artistName: "IU", mbid: null, artistMbid: "b450ba80-9c89-4e40-a11a-ec7d3c5399c9", playcount: 1, listeners: 1 },
      { rank: 3, title: "C", artistName: "NewJeans", mbid: null, artistMbid: null, playcount: 2, listeners: 2 },
    ],
    100,
  );
  if (artists.length !== 2 || artists[0].name !== "IU" || artists[1].name !== "NewJeans") {
    throw new Error("unique artists from tracks");
  }
});

Deno.test("Last.fm tag noise filter keeps genre tags", () => {
  const selected = selectLastfmVectorTags([
    { name: "k-pop", count: 80 },
    { name: "seen live", count: 90 },
    { name: "synthpop", count: 40 },
    { name: "love", count: 70 },
    { name: "dance", count: 20 },
  ]);
  if (selected.length !== 3) throw new Error(`expected 3 tags, got ${selected.length}`);
  if (selected[0].canonicalName !== "k-pop") throw new Error("rank 1");
  if (selected.some((tag) => tag.normalizedName === "seen live")) throw new Error("noise leaked");
});

Deno.test("MusicBrainz artist search match prefers exact name", () => {
  const hits = parseArtistSearch({
    artists: [
      { id: "11111111-1111-4111-8111-111111111111", name: "Other", score: 99 },
      { id: "22222222-2222-4222-8222-222222222222", name: "IU", score: 80 },
    ],
  });
  const selected = selectArtistSearchMatch(hits, "IU");
  if (selected?.mbid !== "22222222-2222-4222-8222-222222222222") {
    throw new Error("exact name should win");
  }
});

Deno.test("MusicBrainz recording search match prefers exact title", () => {
  const hits = parseRecordingSearch({
    recordings: [
      {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        title: "Other",
        score: 99,
        "artist-credit": [{ name: "IU", joinphrase: "", artist: { id: "22222222-2222-4222-8222-222222222222", name: "IU" } }],
      },
      {
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        title: "Good Day",
        score: 80,
        "artist-credit": [{ name: "IU", joinphrase: "", artist: { id: "22222222-2222-4222-8222-222222222222", name: "IU" } }],
      },
    ],
  });
  const selected = selectRecordingSearchMatch(hits, "IU", "Good Day");
  if (selected?.mbid !== "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb") {
    throw new Error("exact recording title should win");
  }
});

Deno.test("Last.fm catalog list keeps hangul korea and drops it from global", () => {
  const cheapKorean = lastfmCheapKoreanVerdict("아이유", "좋은 날");
  if (cheapKorean !== "korean") throw new Error("hangul must be korean");
  const keepKorea = decideLastfmCatalogTrack({
    regionPolicy: "korean_only",
    requireHipHop: false,
    cheap: cheapKorean,
    tags: null,
  });
  if (keepKorea !== "keep") throw new Error("korea catalog must keep hangul at Last.fm");
  const dropGlobal = decideLastfmCatalogTrack({
    regionPolicy: "exclude_korean",
    requireHipHop: false,
    cheap: cheapKorean,
    tags: null,
  });
  if (dropGlobal !== "drop") throw new Error("global catalog must drop hangul at Last.fm");
});

Deno.test("Last.fm catalog list uses artist tags for romanized k-pop", () => {
  const cheap = lastfmCheapKoreanVerdict("aespa", "Spicy");
  if (cheap !== "need_tags") throw new Error("romanized k-pop must ask Last.fm tags");
  const need = decideLastfmCatalogTrack({
    regionPolicy: "korean_only",
    requireHipHop: false,
    cheap,
    tags: null,
  });
  if (need !== "need_tags") throw new Error("korea catalog must fetch artist tags");
  const keep = decideLastfmCatalogTrack({
    regionPolicy: "korean_only",
    requireHipHop: false,
    cheap,
    tags: [{ name: "k-pop", count: 80 }, { name: "korean", count: 20 }],
  });
  if (keep !== "keep") throw new Error("k-pop tag must keep for korea catalog");
  const drop = decideLastfmCatalogTrack({
    regionPolicy: "exclude_korean",
    requireHipHop: false,
    cheap,
    tags: [{ name: "k-pop", count: 80 }],
  });
  if (drop !== "drop") throw new Error("global catalog must drop k-pop tagged artists");
  const globalWithoutTags = decideLastfmCatalogTrack({
    regionPolicy: "exclude_korean",
    requireHipHop: false,
    cheap,
    tags: null,
  });
  if (globalWithoutTags !== "keep") {
    throw new Error("global list must not Last.fm-tag every romanized row");
  }
});

Deno.test("Last.fm hip-hop source and artist.getTopTags URL", () => {
  if (!lastfmCatalogSourceIsHipHop("tag.getTopTracks", "hip-hop")) {
    throw new Error("hip-hop tag source");
  }
  if (!lastfmCatalogRequiresHipHop("musicbrainz-lastfm-hiphop-catalog")) {
    throw new Error("hiphop catalog requires hip-hop");
  }
  const keep = decideLastfmCatalogTrack({
    regionPolicy: "exclude_korean",
    requireHipHop: false,
    cheap: lastfmCheapKoreanVerdict("Kendrick Lamar", "HUMBLE."),
    tags: null,
  });
  if (keep !== "keep") throw new Error("global hip-hop chart row should stay");
  const url = buildLastfmArtistTopTagsUrl("0123456789abcdef", { artist: "aespa" });
  if (!url.href.includes("method=artist.getTopTags")) throw new Error("artist tags method");
});
