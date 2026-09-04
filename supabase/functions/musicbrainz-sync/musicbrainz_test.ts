import {
  assertAllowedFinalUrl,
  buildDiscoveryRequest,
  buildLookupRequest,
  ContractError,
  dateOverlaps,
  parseRelease,
  parseReleaseSearchPage,
  partialDate,
  selectRepresentativeRelease,
  validateActualRelease,
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

Deno.test("representative release ordering is deterministic", () => {
  const selected = selectRepresentativeRelease([
    { mbid: "ffffffff-ffff-4fff-8fff-ffffffffffff", title: "A", status: "Official", date: "2025", country: null, trackCount: 10 },
    { mbid: "00000000-0000-4000-8000-000000000000", title: "B", status: "Official", date: "2025", country: null, trackCount: 10 },
    { mbid: "11111111-1111-4111-8111-111111111111", title: "C", status: "Promotion", date: "2020", country: null, trackCount: 10 },
  ]);
  assert(selected.mbid === "00000000-0000-4000-8000-000000000000", "UUID tiebreak mismatch");
});
