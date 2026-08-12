// Refreshes catalogue rows from their google_place_id and writes them back
// into src/lib/catalogue.json. Pass --push to also write them to Supabase
// (needs the service role key).
//
//   VITE_GOOGLE_MAPS_API_KEY=… node scripts/refresh-places.mjs
//   VITE_GOOGLE_MAPS_API_KEY=… node scripts/refresh-places.mjs --limit 120
//   VITE_GOOGLE_MAPS_API_KEY=… SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… \
//     node scripts/refresh-places.mjs --push
//
// This is the *only* place that pays for the expensive Places fields, and it
// is now the binding constraint on how big the catalogue can be. Each row is
// one Place Details Enterprise + Atmosphere event against a **1,000/month**
// free allowance, so a weekly run can afford about 250 rows and no more.
//
// `--limit` therefore defaults to 200, and rows are refreshed oldest-first so
// consecutive runs work their way through the whole catalogue rather than
// re-pulling the same head of the list. Google's terms also cap caching of
// place content at 30 days; at 200 a week a 329-row catalogue comes round
// every 12 days, inside that.

import { readCatalogue, writeCatalogue } from "./catalogue.mjs";
import { describePlace } from "../src/lib/describe.js";

const key = process.env.VITE_GOOGLE_MAPS_API_KEY;
if (!key) {
  console.error("Set VITE_GOOGLE_MAPS_API_KEY.");
  process.exit(1);
}

const catalogue = readCatalogue();

const limitArg = process.argv.indexOf("--limit");
const LIMIT = limitArg > -1 ? Number(process.argv[limitArg + 1]) : 200;

// A row refreshed recently is skipped outright. Without this a re-run — after
// a crash, a rate limit, or just running the script twice — pays the
// Enterprise rate again for rows that were already current, which is the
// easiest way to burn the 1,000/month allowance by accident. Two weeks keeps
// every row inside the 30 days Google allows content to be cached.
const ageArg = process.argv.indexOf("--max-age");
const MAX_AGE_DAYS = ageArg > -1 ? Number(process.argv[ageArg + 1]) : 14;

const today = new Date().toISOString().slice(0, 10);
const cutoff = new Date(Date.now() - MAX_AGE_DAYS * 86400000).toISOString().slice(0, 10);

const withId = catalogue.places.filter((p) => p.google_place_id);
const stale = withId.filter((p) => !p.refreshed || p.refreshed < cutoff);

// Oldest refresh first; never refreshed at all sorts to the front.
const due = stale
  .sort((a, b) => (a.refreshed ?? "").localeCompare(b.refreshed ?? ""))
  .slice(0, LIMIT);

console.error(
  `${catalogue.places.length} places · ${withId.length} with a place ID · ` +
    `${withId.length - stale.length} still fresh (refreshed since ${cutoff}).`
);
console.error(`Refreshing ${due.length}. Enterprise events this run: ${due.length}.`);

if (!due.length) {
  console.error("Nothing due. Pass --max-age 0 to force.");
  process.exit(0);
}

if (due.length > 250) {
  console.error("Warning: over 250 in one run risks the 1,000/month Enterprise allowance.");
}

const FIELDS = [
  "id",
  "displayName",
  "formattedAddress",
  "location",
  "types",
  "primaryTypeDisplayName",
  "businessStatus",
  "rating",
  "userRatingCount",
  "priceLevel",
  "regularOpeningHours",
  "editorialSummary",
  "goodForChildren",
  "goodForGroups",
  "restroom",
  "outdoorSeating",
  "parkingOptions",
  "accessibilityOptions",
  "reviews",
].join(",");

const PRICE_LEVELS = {
  PRICE_LEVEL_FREE: 0,
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4,
};

// Google's formatted address is the whole postal line, and it does not always
// lead with the street: Willow Glen's starts "Public Library, 1157 Minnesota
// Ave". Keep the segments before the city, then prefer the one that starts
// with a house number.
//
//   901 E Santa Clara St, San Jose, CA 95116, USA   → 901 E Santa Clara St
//   Public Library, 1157 Minnesota Ave, San Jose, … → 1157 Minnesota Ave
//   N 2nd St &, E St James St, San Jose, …          → N 2nd St & E St James St
function shortAddress(formatted) {
  if (!formatted) return null;
  const parts = formatted.split(",").map((s) => s.trim());
  const city = parts.findIndex((p) => /^San Jos/i.test(p));
  const street = city > 0 ? parts.slice(0, city) : parts.slice(0, 1);

  // A corner reaches us split across two segments — "N 2nd St &", "E St
  // James St" — so glue those back together before choosing.
  const joined = street.reduce((acc, part) => {
    if (acc.length && acc.at(-1).endsWith("&")) acc[acc.length - 1] += ` ${part}`;
    else acc.push(part);
    return acc;
  }, []);

  const pick = joined.find((p) => /^\d/.test(p)) ?? joined[0];
  return pick?.replace(/\s*&\s*$/, "").trim() || null;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Places enforces a per-minute rate as well as the monthly allowance, and an
// unpaced loop trips it: the first run of the full catalogue got 74 rows in
// and then took HTTP 429 for the remaining 60. A short gap between calls
// keeps a 200-row run inside the limit, and a 429 still backs off and retries
// rather than silently leaving the row stale.
// 120ms was still too fast and spent most of a run in backoff; 400ms gets a
// 134-row pass through cleanly in about a minute.
const GAP_MS = 400;
const RETRIES = 4;

/**
 * A 429 from Places is two different problems wearing the same status code,
 * and they want opposite responses:
 *
 *   per-minute rate  → back off and retry, it clears in seconds
 *   per-day quota    → stop, it clears at midnight Pacific
 *
 * Retrying the second one just spins. The project carries a
 * `GetPlaceRequestPerDayPerProject` cap (150/day as configured), which is the
 * real hard stop on how fast the catalogue can be filled in — not the
 * 1,000/month Enterprise allowance. Raise it under
 * Cloud console › APIs & Services › Quotas if a full pass is needed sooner.
 */
class DailyQuotaReached extends Error {}

async function fetchPlace(id) {
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    const response = await fetch(`https://places.googleapis.com/v1/places/${id}`, {
      headers: {
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": FIELDS,
        Referer: "http://localhost:5173/",
      },
    });

    if (response.ok) return response;
    if (response.status !== 429) return response;

    const body = await response.clone().text();
    if (/per day|PerDay/i.test(body)) {
      throw new DailyQuotaReached(
        body.match(/limit '([^']+)'/)?.[1] ?? "a per-day quota"
      );
    }
    if (attempt === RETRIES) return response;

    // A retried 429 is not billed, so backing off costs waiting, not quota.
    const wait = 2000 * 2 ** attempt;
    console.error(`  rate limited, waiting ${wait / 1000}s…`);
    await sleep(wait);
  }
}

let refreshed = 0;

let exhausted = null;

for (const place of due) {
  let response;
  try {
    response = await fetchPlace(place.google_place_id);
  } catch (error) {
    if (!(error instanceof DailyQuotaReached)) throw error;
    exhausted = error.message;
    break;
  }
  await sleep(GAP_MS);

  if (!response.ok) {
    console.error(`${place.id}: HTTP ${response.status}, left as-is`);
    continue;
  }

  const d = await response.json();

  // The city is authoritative for what its own facilities are called and
  // where they are — its name is the one on the sign, and a polygon centroid
  // beats Google's single pin for a 27-acre park. Google is only consulted
  // for the things the city does not publish.
  const address = shortAddress(d.formattedAddress);

  const facts = {
    types: d.types ?? [],
    primary: d.primaryTypeDisplayName?.text ?? null,
    editorial: d.editorialSummary?.text ?? null,
    goodForChildren: d.goodForChildren ?? null,
    goodForGroups: d.goodForGroups ?? null,
    restroom: d.restroom ?? null,
    outdoorSeating: d.outdoorSeating ?? null,
    freeParking: d.parkingOptions?.freeParkingLot ?? d.parkingOptions?.freeStreetParking ?? null,
    wheelchair: d.accessibilityOptions?.wheelchairAccessibleEntrance ?? null,
  };

  // Google's terms require reviews to be shown verbatim and attributed, so
  // the author travels with the text rather than being dropped.
  //
  // Of the reviews Google returns, take the one whose own star rating sits
  // closest to the place's overall rating. Picking the top-rated one would
  // quietly turn the section into marketing copy; this picks a typical
  // opinion instead, in either direction.
  const review = [...(d.reviews ?? [])]
    .filter((r) => (r.text?.text ?? r.originalText?.text ?? "").length > 40)
    .sort((a, b) => Math.abs((a.rating ?? 0) - d.rating) - Math.abs((b.rating ?? 0) - d.rating))[0];

  // Written from `facts` only — never invented. See src/lib/describe.js. It
  // only replaces the city's amenity sentence when Google actually said
  // something, so a thin listing never blanks a good description.
  const described = describePlace({ ...place, facts });

  Object.assign(place, {
    address: !address || address === place.name ? place.address : address,
    rating: d.rating ?? null,
    reviews: d.userRatingCount ?? 0,
    price_level: PRICE_LEVELS[d.priceLevel] ?? place.price_level,
    closed: d.businessStatus === "CLOSED_PERMANENTLY" || place.closed === true,
    summary: described ?? place.summary,
    quote: review?.text?.text ?? review?.originalText?.text ?? null,
    quote_author: review?.authorAttribution?.displayName ?? null,
    quote_rating: review?.rating ?? null,
    refreshed: today,
  });

  refreshed++;
  console.error(`${place.id} → ${d.rating ?? "no rating"} · ${d.userRatingCount ?? 0} reviews`);
}

// Written even on a short run: the rows that did come back are real, and
// each one carries `refreshed`, so tomorrow's run picks up where this stopped
// instead of paying for them again.
writeCatalogue(catalogue);
console.error(`\nRefreshed ${refreshed} rows.`);

if (exhausted) {
  const left = due.length - refreshed;
  console.error(
    `\nStopped early: hit '${exhausted}'. ${left} row${left === 1 ? "" : "s"} still to do.\n` +
      "The cap resets at midnight Pacific — re-run then, or raise it in the Cloud\n" +
      "console under APIs & Services › Quotas › Places API."
  );
  process.exit(0);
}

if (process.argv.includes("--push")) {
  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const rows = catalogue.places.map(({ id, closed_on, ...rest }) => ({
    slug: id,
    closed_on: closed_on ?? null,
    ...rest,
  }));

  for (let i = 0; i < rows.length; i += 100) {
    const { error } = await supabase
      .from("third_spaces")
      .upsert(rows.slice(i, i + 100), { onConflict: "slug" });
    if (error) throw error;
  }
  console.error(`Pushed ${rows.length} rows.`);
}
