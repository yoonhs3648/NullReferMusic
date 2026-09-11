import {
  assertAllowedFinalUrl,
  buildArtistSearchRequest,
  buildDiscoveryRequest,
  buildLookupRequest,
  buildRecordingSearchRequest,
  quoteLucene,
  catalogCoreTitle,
  catalogMatchKey,
  selectRecordingSearchMatch,
  ContractError,
  dateOverlaps,
  coalescePartialDate,
  parseRelease,
  parseReleaseSearchPage,
  partialDate,
  selectRepresentativeRelease,
  validateActualRelease,
  artistLooksKorean,
  classifyKoreanWork,
  catalogRegionPolicy,
  isSouthKoreaArtist,
  parseArtistGeo,
  scheduleRequiresKoreanWork,
} from "./musicbrainz.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function throws(fn: () => unknown, message: string): void {
  try {
    fn();
  } catch (error) {
    assert(error instanceof ContractError, `${message}: wrong error`);
    return;
  }
  throw new Error(`${message}: did not throw`);
}

const ARTIST = "11111111-1111-4111-8111-111111111111";
const RELEASE = "22222222-2222-4222-8222-222222222222";
const GROUP = "33333333-3333-4333-8333-333333333333";
const TRACK = "44444444-4444-4444-8444-444444444444";
const RECORDING = "55555555-5555-4555-8555-555555555555";

function credit() {
  return [{
    name: "Artist",
    joinphrase: "",
    artist: { id: ARTIST, name: "Artist", "sort-name": "Artist" },
  }];
}

function releaseFixture() {
  return {
    id: RELEASE,
    title: "Future Album",
    status: "Official",
    quality: "normal",
    packaging: null,
    country: "KR",
    date: "2027-02",
    barcode: null,
    "text-representation": { language: "kor", script: "Kore" },
    "release-group": { id: GROUP },
    "artist-credit": credit(),
    "release-events": [{
      date: "2027-02",
      area: { "iso-3166-1-codes": ["KR"] },
    }],
    media: [{
      position: 1,
      title: null,
      format: "Digital Media",
      tracks: [{
        id: TRACK,
        position: 1,
        number: "1",
        title: "Song",
        length: 180000,
        "artist-credit": credit(),
        recording: {
          id: RECORDING,
          title: "Song",
          length: 180000,
          video: false,
          "artist-credit": credit(),
          isrcs: ["KRA012700001"],
          tags: [],
          genres: [],
        },
      }],
    }],
    tags: [{ name: "Pop", count: 3 }],
    genres: [],
  };
}

Deno.test("request builder fixes origin, encoding, includes and pagination", () => {
  const search = buildDiscoveryRequest(ARTIST, "2026-09-04", "2027-09-04", 0);
  assert(search.origin === "https://musicbrainz.org", "wrong origin");
  assert(search.searchParams.get("offset") === "0", "wrong offset");
  assert(search.searchParams.get("limit") === "100", "wrong limit");
  assert(search.searchParams.get("query")?.includes(`arid:"${ARTIST}"`), "artist query missing");
  assert(search.searchParams.get("query")?.includes('status:"official"'), "official filter missing");
  const lookup = buildLookupRequest("release", RELEASE);
  assert(lookup.searchParams.get("inc")?.includes("recordings"), "release includes missing");
  throws(() => buildLookupRequest("release", "../../etc"), "path injection");
  throws(() => assertAllowedFinalUrl("https://example.com/ws/2/release/x"), "redirect origin");
});

Deno.test("partial dates validate calendar and overlap as intervals", () => {
  assert(partialDate("2024-02-29") === "2024-02-29", "leap date rejected");
  throws(() => partialDate("2023-02-29"), "invalid calendar date");
  throws(() => partialDate("2027-13"), "invalid month");
  assert(dateOverlaps("2027", "2027-12-31", "2027-12-31"), "year interval mismatch");
  assert(dateOverlaps("2027-02", "2027-02-28", "2027-03-01"), "month interval mismatch");
  assert(!dateOverlaps("2027-02", "2027-03-01", "2027-03-31"), "month should not overlap");
});

Deno.test("search parser rejects malformed fields and preserves partial dates", () => {
  const page = parseReleaseSearchPage({
    count: 1,
    offset: 0,
    releases: [{
      id: RELEASE,
      title: "Future Album",
      date: "2027-02",
      status: "Official",
      country: "KR",
      "release-group": {
        id: GROUP,
        "primary-type": "Album",
        "secondary-types": [],
      },
    }],
  });
  assert(page.candidates[0].release_date_text === "2027-02", "partial date lost");
  throws(() => parseReleaseSearchPage({ count: 1, offset: 0, releases: [{ id: "bad" }] }), "bad MBID");
});

Deno.test("release media without tracks is treated as empty, not a contract error", () => {
  const parsed = parseRelease({
    ...releaseFixture(),
    media: [{
      position: 1,
      title: null,
      format: "Digital Media",
      "track-count": 0,
    }],
  });
  assert(parsed.media[0].tracks.length === 0, "missing tracks must parse as empty");
});

Deno.test("actual release-event, artist, status and country are authoritative", () => {
  const parsed = parseRelease(releaseFixture());
  validateActualRelease(parsed, ARTIST, "2027-02-01", "2027-02-28", ["KR"], ["Official"]);
  throws(
    () => validateActualRelease(parsed, ARTIST, "2027-03-01", "2027-03-31", ["KR"], ["Official"]),
    "top-level candidate date must not bypass actual event",
  );
  throws(
    () => validateActualRelease(parsed, ARTIST, "2027-02-01", "2027-02-28", ["US"], ["Official"]),
    "country mismatch",
  );
});

Deno.test("empty MusicBrainz event dates do not reject the release", () => {
  const parsed = parseRelease({
    ...releaseFixture(),
    date: null,
    "release-events": [
      { date: "", area: { "iso-3166-1-codes": ["US"] } },
      { date: "2019-04", area: { "iso-3166-1-codes": ["KR"] } },
    ],
  });
  assert(parsed.date === "2019-04", "dated event must fill release.date");
  assert(parsed.events[0].date == null, "empty event date must stay null");
  assert(parsed.events[1].date === "2019-04", "dated event must parse");
  validateActualRelease(parsed, ARTIST, "2019-04-01", "2019-04-30", ["KR"], ["Official"]);

  const rootOnly = parseRelease({
    ...releaseFixture(),
    date: "2020",
    "release-events": [{ date: null, area: { "iso-3166-1-codes": ["KR"] } }],
  });
  assert(rootOnly.date === "2020", "root date must survive empty events");
  validateActualRelease(rootOnly, ARTIST, "2020-01-01", "2020-12-31", ["KR"], ["Official"]);

  const unknown = parseRelease({
    ...releaseFixture(),
    date: null,
    "release-events": [{ date: "", area: { "iso-3166-1-codes": ["KR"] } }],
  });
  assert(unknown.date == null, "missing dates must stay null");
  assert(coalescePartialDate(unknown.date, "2018-06", "2017") === "2018-06", "catalog fallback order");
});

Deno.test("representative release ordering is deterministic", () => {
  const selected = selectRepresentativeRelease([
    { mbid: "ffffffff-ffff-4fff-8fff-ffffffffffff", title: "A", status: "Official", date: "2025", country: null, trackCount: 10 },
    { mbid: "00000000-0000-4000-8000-000000000000", title: "B", status: "Official", date: "2025", country: null, trackCount: 10 },
    { mbid: "11111111-1111-4111-8111-111111111111", title: "C", status: "Promotion", date: "2020", country: null, trackCount: 10 },
  ]);
  assert(selected.mbid === "00000000-0000-4000-8000-000000000000", "UUID tiebreak mismatch");
});

Deno.test("korean work classifier keeps hangul, k-pop, and KR ISRC", () => {
  assert(
    classifyKoreanWork({ artistName: "아이유", trackTitle: "밤편지" }) === "accept",
    "hangul must be korean",
  );
  assert(
    classifyKoreanWork({ artistName: "BTS", trackTitle: "Dynamite", tags: [{ name: "k-pop" }] }) ===
      "accept",
    "k-pop tag must be korean",
  );
  assert(
    classifyKoreanWork({ artistName: "IU", trackTitle: "Good Day", isrcs: ["KRA351600390"] }) ===
      "accept",
    "KR ISRC must be korean",
  );
  assert(scheduleRequiresKoreanWork("musicbrainz-lastfm-korea-catalog"), "korea catalog");
  assert(scheduleRequiresKoreanWork("musicbrainz-lastfm-korean-hiphop-catalog"), "korean hiphop");
  assert(catalogRegionPolicy("musicbrainz-lastfm-global-catalog") === "exclude_korean", "global excludes korean");
  assert(catalogRegionPolicy("musicbrainz-lastfm-hiphop-catalog") === "exclude_korean", "hiphop excludes korean");
  assert(catalogRegionPolicy("musicbrainz-lastfm-global-top") === "exclude_korean", "global top excludes korean");
});

Deno.test("korean work classifier rejects japanese signals", () => {
  assert(
    classifyKoreanWork({ artistName: "YOASOBI", trackTitle: "アイドル" }) === "reject",
    "kana titles are not korean",
  );
  assert(
    classifyKoreanWork({
      artistName: "Adele",
      trackTitle: "Hello",
      tags: [{ name: "j-pop" }],
    }) === "reject",
    "j-pop must be skipped",
  );
  assert(
    classifyKoreanWork({ artistName: "Taylor Swift", trackTitle: "Anti-Hero", tags: [{ name: "pop" }] }) ===
      "check_artist",
    "western pop needs artist country",
  );
});

Deno.test("lucene quoting escapes MusicBrainz 400 characters", () => {
  const acdc = buildRecordingSearchRequest("AC/DC", "Back in Black", 5);
  const acdcQuery = acdc.searchParams.get("query") ?? "";
  assert(acdcQuery.includes("AC\\/DC"), "slash must be escaped");
  assert(acdcQuery.includes("Back in Black"), "plain title must remain");

  const heart = buildRecordingSearchRequest("AKRIILA", "un <3 inestable", 5);
  const heartQuery = heart.searchParams.get("query") ?? "";
  assert(heartQuery.includes("\\<3"), "angle bracket must be escaped");

  const high = buildRecordingSearchRequest("Arctic Monkeys", "Why'd You Only Call Me When You're High?", 5);
  const highQuery = high.searchParams.get("query") ?? "";
  assert(highQuery.includes("High\\?"), "question mark must be escaped");

  const curly = quoteLucene("game over \u2026");
  assert(curly.includes("..."), "ellipsis must normalize");
  assert(!curly.includes("\u2026"), "raw ellipsis must not remain");

  const artist = buildArtistSearchRequest("AC/DC", 5);
  assert((artist.searchParams.get("query") ?? "").includes("AC\\/DC"), "artist slash must be escaped");

  const stripped = buildRecordingSearchRequest("AC/DC", "un <3 inestable", 5, "stripped");
  const strippedQuery = stripped.searchParams.get("query") ?? "";
  assert(strippedQuery.includes("AC DC") || strippedQuery.includes("ACDC"), "stripped search must drop slash");
  assert(!strippedQuery.includes("<"), "stripped search must drop angle brackets");

  const feat = buildRecordingSearchRequest("김심야", "Me Life & Nothing Else (feat. Someone)", 5);
  const featQuery = feat.searchParams.get("query") ?? "";
  assert(featQuery.includes("artistname:"), "hangul aliases need artistname field");
  assert((featQuery.match(/recording:/g) ?? []).length >= 2, "feat titles must search core title too");

  const arid = buildRecordingSearchRequest("방탄소년단", "Dynamite", 15, "quoted", ARTIST);
  assert((arid.searchParams.get("query") ?? "").includes(`arid:"${ARTIST}"`), "artist MBID search missing");
});

Deno.test("catalog recording match accepts feat, ampersand, and hangul vs roman credits", () => {
  assert(catalogCoreTitle("Me Life & Nothing Else (feat. Someone)") === "Me Life & Nothing Else", "feat must drop");
  assert(catalogMatchKey("Me Life & Nothing Else") === catalogMatchKey("Me Life and Nothing Else"), "& must equal and");

  const dynamite = selectRecordingSearchMatch(
    [{
      mbid: RECORDING,
      title: "Dynamite",
      artistName: "BTS",
      score: 85,
    }],
    "방탄소년단",
    "Dynamite",
  );
  assert(dynamite?.mbid === RECORDING, "hangul chart name must accept roman credit when title matches");

  const featHit = selectRecordingSearchMatch(
    [{
      mbid: RECORDING,
      title: "Me Life & Nothing Else",
      artistName: "Kim Simya",
      score: 88,
    }],
    "김심야",
    "Me Life and Nothing Else (feat. Long Featured Artist Name)",
  );
  assert(featHit?.mbid === RECORDING, "feat and ampersand titles must match the core recording");
});

Deno.test("south korea artist geo uses country, area, and hangul aliases", () => {
  const parsed = parseArtistGeo({
    id: ARTIST,
    name: "BTS",
    country: "KR",
    area: { name: "South Korea", "iso-3166-1-codes": ["KR"] },
    aliases: [{ name: "방탄소년단" }],
  });
  assert(artistLooksKorean(parsed), "KR artist must look korean");
  assert(parsed.names.includes("방탄소년단"), "hangul alias missing");
  assert(!isSouthKoreaArtist("US", "United States"), "US artist is not korean");
});
