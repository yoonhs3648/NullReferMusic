import {
  assertAllowedLastfmUrl,
  buildLastfmTopArtistsUrl,
  parseLastfmTopArtists,
} from "./lastfm.ts";
import {
  parseArtistSearch,
  selectArtistSearchMatch,
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
