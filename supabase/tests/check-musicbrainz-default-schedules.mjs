import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const fixturePath = path.join(
  root,
  "supabase/tests/fixtures/musicbrainz-default-artist-allowlist.json",
);
const migrationPath = path.join(
  root,
  "supabase/migrations/20260904142000_musicbrainz_default_schedules.sql",
);
const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
const sql = fs.readFileSync(migrationPath, "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const expectedCounts = new Map([
  ["k_pop", 12],
  ["korean_hip_hop", 10],
  ["global_chart", 20],
]);
const cohortMbids = new Map();
const allMbids = new Set();

for (const [cohort, expectedCount] of expectedCounts) {
  const artists = fixture.artists.filter((artist) => artist.cohort === cohort);
  assert(artists.length === expectedCount, `${cohort} count must be ${expectedCount}`);
  cohortMbids.set(cohort, new Set(artists.map((artist) => artist.artistMbid)));
}

for (const artist of fixture.artists) {
  assert(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
      artist.artistMbid,
    ),
    `invalid Artist MBID: ${artist.artistMbid}`,
  );
  assert(!allMbids.has(artist.artistMbid), `duplicate fixture MBID: ${artist.artistMbid}`);
  assert(artist.musicbrainzName.trim() !== "", `blank Artist name: ${artist.artistMbid}`);
  assert(sql.includes(artist.artistMbid), `migration is missing ${artist.artistMbid}`);
  assert(sql.includes(`'${artist.musicbrainzName.replaceAll("'", "''")}'`), `migration is missing ${artist.musicbrainzName}`);
  allMbids.add(artist.artistMbid);
}

for (const mbid of cohortMbids.get("k_pop")) {
  assert(
    !cohortMbids.get("korean_hip_hop").has(mbid),
    `K-pop/Korean hip-hop overlap is forbidden: ${mbid}`,
  );
}

for (const [scheduleKey, time, count] of [
  ["musicbrainz-k-pop-daily", "09:00:00", 12],
  ["musicbrainz-korean-hip-hop-daily", "10:00:00", 10],
  ["musicbrainz-global-chart-daily", "11:00:00", 20],
]) {
  assert(sql.includes(`'${scheduleKey}'`), `missing schedule ${scheduleKey}`);
  assert(sql.includes(`'daily', '${time}'`), `missing KST time ${time}`);
  assert(sql.includes(`true, 0, 365`), `missing active 0..365-day defaults`);
  assert(
    sql.includes(`array['Official'], ${count}, 45, 500`),
    `wrong Artist/request limits for ${scheduleKey}`,
  );
}

assert(
  sql.includes("specialist cohort wins over global_chart") &&
    sql.includes("on conflict (schedule_id, artist_mbid) do update"),
  "global overlap idempotency policy is missing",
);
assert(
  sql.includes("schedule := '17 */6 * * *'") && sql.includes("active := true"),
  "six-hour cleanup setting is missing",
);

console.log("default schedule fixture/static checks passed");

if (!process.argv.includes("--live")) process.exit(0);

const minimumIntervalMs = Math.max(1100, fixture.minimumRequestIntervalMs);
const userAgent =
  "NullReferMusic/1.0 (https://github.com/yoonhs3648/NullReferMusic)";
let previousRequestStartedAt = 0;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function lookupArtist(artist) {
  let lastError;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const waitMs = minimumIntervalMs - (Date.now() - previousRequestStartedAt);
    if (waitMs > 0) await sleep(waitMs);
    previousRequestStartedAt = Date.now();

    try {
      const url = new URL(
        `/ws/2/artist/${artist.artistMbid}`,
        "https://musicbrainz.org",
      );
      url.searchParams.set("fmt", "json");
      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": userAgent,
        },
        signal: AbortSignal.timeout(20_000),
        redirect: "follow",
      });

      if (response.status === 429 || response.status >= 500) {
        const retryAfterSeconds = Number(response.headers.get("retry-after"));
        if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
          await sleep(retryAfterSeconds * 1000);
        }
        lastError = new Error(`transient HTTP ${response.status}`);
        continue;
      }
      assert(response.ok, `${artist.musicbrainzName}: HTTP ${response.status}`);

      const payload = await response.json();
      assert(
        payload.id === artist.artistMbid,
        `${artist.musicbrainzName}: expected id ${artist.artistMbid}, got ${payload.id}`,
      );
      assert(
        payload.name === artist.musicbrainzName,
        `${artist.artistMbid}: expected name ${artist.musicbrainzName}, got ${payload.name}`,
      );
      return payload;
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(
    `${artist.musicbrainzName} lookup failed after retries: ${lastError?.message}`,
  );
}

for (const [index, artist] of fixture.artists.entries()) {
  const payload = await lookupArtist(artist);
  console.log(
    `${String(index + 1).padStart(2, "0")}/${fixture.artists.length} ${payload.id} ${payload.name}`,
  );
}

console.log(
  `official MusicBrainz live verification passed (${fixture.artists.length} Artists, interval >= ${minimumIntervalMs}ms)`,
);
