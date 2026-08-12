// Refreshes every seeded place from its google_place_id and prints the rows as
// JS ready to paste into src/lib/seed.js. Pass --push to also write them to
// Supabase (needs the service role key).
//
//   VITE_GOOGLE_MAPS_API_KEY=… node scripts/refresh-places.mjs
//   VITE_GOOGLE_MAPS_API_KEY=… SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… \
//     node scripts/refresh-places.mjs --push
//
// This is the *only* place that pays for the expensive Places fields. One run
// is 26 Place Details Enterprise + Atmosphere events against a 1,000/month
// free allowance, so a weekly run costs nothing and the app itself never has
// to ask Google for a rating. Google's terms also cap caching of place content
// at 30 days, which a weekly refresh stays inside.

import { PLACES } from "../src/lib/seed.js";
import { describePlace } from "../src/lib/describe.js";

const key = process.env.VITE_GOOGLE_MAPS_API_KEY;
if (!key) {
  console.error("Set VITE_GOOGLE_MAPS_API_KEY.");
  process.exit(1);
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

const rows = [];

for (const place of PLACES) {
  if (!place.google_place_id) {
    console.error(`${place.id}: no google_place_id, left as-is`);
    rows.push(place);
    continue;
  }

  const response = await fetch(`https://places.googleapis.com/v1/places/${place.google_place_id}`, {
    headers: {
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": FIELDS,
      Referer: "http://localhost:5173/",
    },
  });

  if (!response.ok) {
    console.error(`${place.id}: HTTP ${response.status}, left as-is`);
    rows.push(place);
    continue;
  }

  const d = await response.json();

  // A district has no street address — Google answers with its own name —
  // so the hand-written descriptor in the seed stays.
  const name = d.displayName?.text ?? place.name;
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

  rows.push({
    ...place,
    name,
    address: !address || address === name ? place.address : address,
    lat: d.location?.latitude ?? place.lat,
    lng: d.location?.longitude ?? place.lng,
    rating: d.rating ?? null,
    reviews: d.userRatingCount ?? 0,
    price_level: PRICE_LEVELS[d.priceLevel] ?? place.price_level,
    closed: d.businessStatus === "CLOSED_PERMANENTLY" || place.closed === true,
    facts,
    // Written from `facts` only — never invented. See src/lib/describe.js.
    summary: describePlace({ ...place, facts }),
    quote: review?.text?.text ?? review?.originalText?.text ?? null,
    quote_author: review?.authorAttribution?.displayName ?? null,
    quote_rating: review?.rating ?? null,
  });

  console.error(`${place.id} → ${d.rating ?? "no rating"} · ${d.userRatingCount ?? 0} reviews`);
}

if (process.argv.includes("--push")) {
  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { error } = await supabase.from("third_spaces").upsert(
    // `facts` is the working material describePlace() reads; only the
    // sentence it produced is worth storing, so it does not travel.
    rows.map(({ id, closed_on, facts: _facts, google_place_id, ...rest }) => ({
      slug: id,
      closed_on: closed_on ?? null,
      google_place_id,
      source: google_place_id ? "google_places" : "manual_seed",
      ...rest,
    })),
    { onConflict: "slug" }
  );
  if (error) throw error;
  console.error(`Pushed ${rows.length} rows.`);
}

console.log(JSON.stringify(rows, null, 2));
