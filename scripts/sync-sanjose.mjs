// Rebuilds the place catalogue and the invest-need list from the City of San
// José's own open data, and writes them to src/lib/catalogue.json.
//
//   node scripts/sync-sanjose.mjs
//
// Everything here is published by the city under CC-BY and served without a
// key, quota, or referrer restriction, so this can be re-run at will and costs
// nothing. It exists because the seed list used to carry hand-set numbers —
// an invented 0–100 `popularity`, hand-typed opening hours, hand-tagged
// interests, and three entirely fictional funding applications. Every one of
// those now comes from a layer below, or is left null.
//
// Google is still the source for ratings, reviews, photos, and quotes; this
// script never touches those. Run order for a full rebuild:
//
//   node scripts/sync-sanjose.mjs        # city facts   (free)
//   node scripts/place-ids.mjs           # google ids   (free)
//   node scripts/refresh-places.mjs      # google facts (paid tier)
//
// Layers, all from the city's OPN_OpenDataService:
//
//   187  Community Centers            name, address, gym/kitchen/parking flags
//   188  Parks                        name, address, acreage, type, status
//   337  Library                      branch names and addresses
//   554  Park Amenities & Sports      what is actually on the ground
//   557  Park Condition Assessment    2025 condition scores + HPI percentile
//   548  Equity Index Census Tracts   population, income, equity score
//   549  Neighborhoods                neighborhood boundaries
//
// Sources:
//   https://data.sanjoseca.gov/dataset/park
//   https://geo.sanjoseca.gov/server/rest/services/OPN/OPN_OpenDataService/MapServer

import { readCatalogue, writeCatalogue } from "./catalogue.mjs";

// Whatever the last run produced, so a re-sync of the city facts keeps the
// Google half rather than starting from nothing.
let EXISTING = [];
try {
  EXISTING = readCatalogue().places;
} catch {
  console.error("No catalogue.json yet — building it from scratch.");
}

const SERVICE =
  "https://geo.sanjoseca.gov/server/rest/services/OPN/OPN_OpenDataService/MapServer";

const LAYERS = {
  communityCenters: 187,
  parks: 188,
  libraries: 337,
  amenities: 554,
  condition: 557,
  equity: 548,
  neighborhoods: 549,
};

/* ── Fetching ─────────────────────────────────────────────────────
   ArcGIS caps a response at its own record limit and reports the cut with
   `exceededTransferLimit`, so every read pages until it stops saying that. */

async function queryAll(layer, { where = "1=1", fields = "*", geometry = false }) {
  const rows = [];
  let offset = 0;

  for (;;) {
    const url =
      `${SERVICE}/${layer}/query?where=${encodeURIComponent(where)}` +
      `&outFields=${encodeURIComponent(fields)}` +
      `&returnGeometry=${geometry}&outSR=4326&f=json` +
      `&resultOffset=${offset}&resultRecordCount=1000`;

    const response = await fetch(url);
    if (!response.ok) throw new Error(`layer ${layer}: HTTP ${response.status}`);
    const data = await response.json();
    if (data.error) throw new Error(`layer ${layer}: ${data.error.message}`);

    const batch = data.features ?? [];
    rows.push(...batch);
    if (!data.exceededTransferLimit || batch.length === 0) break;
    offset += batch.length;
  }

  return rows;
}

/* ── Geometry ─────────────────────────────────────────────────────
   The city publishes these as polygons, so a pin needs a representative
   point. The shoelace centroid is right for a convex-ish park; a degenerate
   ring (zero area) falls back to the bounding-box centre. */

function centroidOf(geometry) {
  const ring = geometry?.rings?.[0];
  if (!ring || ring.length < 3) return null;

  let twiceArea = 0;
  let x = 0;
  let y = 0;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const cross = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
    twiceArea += cross;
    x += (ring[j][0] + ring[i][0]) * cross;
    y += (ring[j][1] + ring[i][1]) * cross;
  }

  if (Math.abs(twiceArea) < 1e-12) {
    const xs = ring.map((p) => p[0]);
    const ys = ring.map((p) => p[1]);
    return { lng: (Math.min(...xs) + Math.max(...xs)) / 2, lat: (Math.min(...ys) + Math.max(...ys)) / 2 };
  }

  const factor = 1 / (3 * twiceArea);
  return { lng: x * factor, lat: y * factor };
}

function inRing(point, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const straddles = yi > point.lat !== yj > point.lat;
    if (straddles && point.lng < ((xj - xi) * (point.lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** The first polygon in `areas` containing the point, or null. */
function areaAt(point, areas) {
  if (!point) return null;
  return areas.find((a) => a.rings.some((ring) => inRing(point, ring))) ?? null;
}

/* ── Vocabulary ───────────────────────────────────────────────────
   The amenity codes in layer 554 are the city's, and they are the only
   honest source for what a place actually offers. Anything not listed here
   is carried through as a plain amenity but maps to no interest, rather
   than being guessed at. */

const AMENITY_INTERESTS = {
  BBALL: "Basketball",
  SOCC: "Soccer",
  FUTSAL: "Soccer",
  POOL: "Swimming",
  WATERPLY: "Swimming",
  WATERB: "Swimming",
  PICKLE: "Pickleball",
  TEN: "Tennis",
  TRACK: "Walking",
  EXERC: "Walking",
  PARC: "Walking",
  VISTA: "Walking",
  GAMETB: "Chess",
  PNGPNG: "Chess",
  ORNGARD: "Gardening",
  PICNIC: "Food & meals",
  BBQ: "Food & meals",
  ART: "Art & craft",
  AMP: "Music",
  PLAYTOT: "Kids & family",
  PLAYYOUTH: "Kids & family",
  PLAYCOMB: "Kids & family",
  SLIDE: "Kids & family",
  SAND: "Kids & family",
  RIDE: "Kids & family",
  TETHR: "Kids & family",
  DOG: "Walking",
  SKATE: "Sport",
  BMX: "Sport",
};

const AMENITY_LABELS = {
  BBALL: "basketball courts",
  SOCC: "soccer fields",
  FUTSAL: "futsal courts",
  BASE: "baseball diamonds",
  SOFT: "softball diamonds",
  TEN: "tennis courts",
  PICKLE: "pickleball courts",
  VOLL: "volleyball courts",
  POOL: "a pool",
  WATERPLY: "a water play area",
  SKATE: "a skate park",
  DOG: "a dog park",
  ORNGARD: "gardens",
  PICNIC: "picnic areas",
  PLAYTOT: "a toddler playground",
  PLAYYOUTH: "a youth playground",
  PLAYCOMB: "a playground",
  RESTROOM: "restrooms",
  EXERC: "an exercise station",
  TRACK: "a track",
  GAMETB: "game tables",
  AMP: "an amphitheatre",
  ART: "public art",
  BOCC: "bocce courts",
  HORSE: "horseshoe pits",
  FRISB: "a disc golf course",
  HAND: "handball courts",
};

// Amenities people gather around, as opposed to infrastructure like parking
// or gates. The interactability component counts these and nothing else.
const SOCIAL_AMENITIES = new Set([
  "BBALL", "SOCC", "FUTSAL", "BASE", "SOFT", "TEN", "PICKLE", "VOLL", "POOL",
  "WATERPLY", "SKATE", "DOG", "ORNGARD", "PICNIC", "PLAYTOT", "PLAYYOUTH",
  "PLAYCOMB", "EXERC", "TRACK", "GAMETB", "AMP", "ART", "BOCC", "HORSE",
  "FRISB", "HAND", "BMX", "SAND", "SLIDE", "RIDE", "TETHR", "PNGPNG", "BEACH",
  "MULTI", "FOOTB", "BOAT", "WATERB", "PARC", "VISTA",
]);

const SPORT_AMENITIES = new Set([
  "BBALL", "SOCC", "FUTSAL", "BASE", "SOFT", "TEN", "PICKLE", "VOLL", "POOL",
  "SKATE", "TRACK", "BOCC", "HAND", "FRISB", "BMX", "FOOTB", "MULTI",
]);

// Park types worth listing as a third space. Golf courses, storm basins,
// medians, and unbuilt land are dropped rather than shown as somewhere to go.
const PARK_TYPES = {
  NEIG: "Sport",
  REG: "Service",
  CTY: "Service",
  SPRT: "Sport",
  DOG: "Service",
  COMGRD: "Service",
  NAT: "Service",
  CIV: "Gathering",
  TR: "Service",
  CC: "Gathering",
  LIBR: "Gathering",
};

// PLANNINGAREA is the city's coarse geography — the ~15 districts people
// actually name when asked where they live. The Neighborhoods layer is far
// more granular (297 association areas like "Ballbach and Sofa"), which is
// right on a place but wrong in a "where are you?" picker.
//
// The column has a leading-space "Berryessa" and a mis-capitalised
// "WIllow Glen" in it, so it is normalised rather than trusted as a key.
// Outlying open space and the catch-all are not places anyone lives.
const NOT_A_DISTRICT = new Set(["Citywide", "Family Camp", "Calero", "San Felipe", "Coyote"]);

function districtName(value) {
  if (!value) return null;
  const name = titleCase(value.trim());
  return NOT_A_DISTRICT.has(name) ? null : name;
}

function slugify(name) {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

// The city stores these names in caps. Title casing them needs to keep
// joining words down ("Ballbach and Sofa") but still capitalise across
// hyphens, slashes, and apostrophes ("Olinder-McKinley", "Cambrian/Pioneer",
// "O'Connor Park") — and leave a possessive alone, so "Bob's" does not become
// "Bob'S".
const MINOR_WORDS = new Set(["and", "of", "the", "at", "on", "de", "del", "la", "el"]);

function titleCase(value) {
  return value
    .toLowerCase()
    .split(/\s+/)
    .map((word, i) =>
      i > 0 && MINOR_WORDS.has(word)
        ? word
        : word.replace(/(^|[-'/])([a-z])/g, (match, sep, letter) =>
            sep === "'" && match.length === 2 && word.endsWith("'s")
              ? match
              : sep + letter.toUpperCase()
          )
    )
    .join(" ");
}

/* ── Pull ─────────────────────────────────────────────────────── */

console.error("Reading the City of San José open data service…");

const [
  neighborhoodRows,
  equityRows,
  centreRows,
  libraryRows,
  parkRows,
  amenityRows,
  conditionRows,
] = await Promise.all([
  queryAll(LAYERS.neighborhoods, { fields: "NAME", geometry: true }),
  queryAll(LAYERS.equity, {
    where: "INSANJOSE='Yes'",
    fields: "CENSUSTRACT,POPTOTAL,HOUSEHOLDCOUNT,EQUITYSCORECOMBINED,INCMEDIANINCOME,LEPRATIO,EDULESSTHANHSRATIO",
    geometry: true,
  }),
  queryAll(LAYERS.communityCenters, {
    where: "CCSTATUS='Open'",
    fields: "FACILITYID,LOCATIONID,NAME,CENTERTYPE,ADDRESS,GYM,KITCHEN,PARKING,ELEVATOR,SENIORNUTRITION,DESCRIPTION,HYPERLINK",
    geometry: true,
  }),
  queryAll(LAYERS.libraries, {
    where: "STATUS='Open'",
    fields: "FACILITYID,NAME,FULLADDR,PHONE,AGENCYURL,OPERDAYS,OPERHOURS",
    geometry: true,
  }),
  queryAll(LAYERS.parks, {
    where: "CURRENTSTATUS='Open'",
    fields: "FACILITYID,LOCATIONID,NAME,ADDRESS,PARKTYPE,PARKCLASS,ALLACRES,DEVACRES,COUNCILDISTRICT,PLANNINGAREA,OWNER,ADOPTABLE,ADOPTIONSTATUS,HYPERLINK",
    geometry: true,
  }),
  queryAll(LAYERS.amenities, {
    where: "AMENITYSTATUS='Open' OR AMENITYSTATUS IS NULL",
    fields: "LOCATIONID,NAME,AMENITYTYPE,QUANTITY,RESTROOMACCESS,LIGHTING,RESERVABLE,ALLINCLUSIVE",
  }),
  queryAll(LAYERS.condition, {
    where: "OVERALLSCORE>0",
    fields: "LOCATIONID,PARKNAME,ASSESSMENTYEAR,OVERALLSCORE,HPIPCTILE,RESTROOMSCORETOTAL,COURTSCORETOTAL,PLAYGROUNDSCORETOTAL,FIELDSCORETOTAL,TURFSCORETOTAL",
  }),
]);

console.error(
  `  ${neighborhoodRows.length} neighborhoods · ${equityRows.length} equity tracts · ` +
    `${centreRows.length} community centers · ${libraryRows.length} libraries · ` +
    `${parkRows.length} parks · ${amenityRows.length} amenities · ${conditionRows.length} assessments`
);

/* ── Index ────────────────────────────────────────────────────── */

const neighborhoods = neighborhoodRows
  .filter((r) => r.attributes.NAME && r.geometry?.rings)
  .map((r) => ({ name: titleCase(r.attributes.NAME), rings: r.geometry.rings }));

const equityAreas = equityRows
  .filter((r) => r.geometry?.rings)
  .map((r) => ({ ...r.attributes, rings: r.geometry.rings }));

// Amenities key off LOCATIONID, which is the same identifier the parks and
// community-center layers carry.
const amenitiesByLocation = new Map();
for (const { attributes: a } of amenityRows) {
  if (!a.LOCATIONID || !a.AMENITYTYPE) continue;
  const list = amenitiesByLocation.get(a.LOCATIONID) ?? [];
  list.push({ type: a.AMENITYTYPE, quantity: a.QUANTITY ?? 1, lighting: a.LIGHTING === "Yes" });
  amenitiesByLocation.set(a.LOCATIONID, list);
}

// Keep only the most recent assessment for each site.
const conditionByLocation = new Map();
for (const { attributes: a } of conditionRows) {
  if (!a.LOCATIONID) continue;
  const held = conditionByLocation.get(a.LOCATIONID);
  if (!held || Number(a.ASSESSMENTYEAR) > Number(held.ASSESSMENTYEAR)) {
    conditionByLocation.set(a.LOCATIONID, a);
  }
}

/* ── Derived measures ─────────────────────────────────────────── */

// I — interactability. Was an invented 0–100 number; now it counts what the
// city says is on the ground. Distinct social amenities carry most of the
// weight, because six different things to do draws a wider mix of people
// than six of the same thing, and total units carry the rest. Log-scaled so
// a regional park does not flatten every neighborhood park to zero.
function interactabilityFrom(amenities, extras = 0) {
  if (!amenities.length && !extras) return null;

  const social = amenities.filter((a) => SOCIAL_AMENITIES.has(a.type));
  const distinct = new Set(social.map((a) => a.type)).size + extras;
  const units = social.reduce((total, a) => total + (Number(a.quantity) || 1), 0) + extras;

  const variety = Math.min(1, Math.log1p(distinct) / Math.log1p(10));
  const volume = Math.min(1, Math.log1p(units) / Math.log1p(25));
  return Math.round((0.65 * variety + 0.35 * volume) * 100);
}

function interestsFrom(amenities) {
  const found = new Set();
  for (const a of amenities) {
    const interest = AMENITY_INTERESTS[a.type];
    if (interest && interest !== "Sport") found.add(interest);
  }
  return [...found].sort();
}

// Composed from amenity codes only, in the same spirit as src/lib/describe.js:
// every clause is switched on something the city reported. Google's editorial
// line replaces this later when refresh-places.mjs finds one.
function describeAmenities(amenities) {
  const labelled = [...new Set(amenities.map((a) => AMENITY_LABELS[a.type]).filter(Boolean))];
  if (!labelled.length) return null;
  const shown = labelled.slice(0, 4);
  const list =
    shown.length === 1
      ? shown[0]
      : `${shown.slice(0, -1).join(", ")} and ${shown.at(-1)}`;
  return `Has ${list}.`;
}

function categoryFor(parkType, amenities) {
  if (amenities.some((a) => SPORT_AMENITIES.has(a.type))) return "Sport";
  return PARK_TYPES[parkType] ?? "Other";
}

/* ── Build the catalogue ──────────────────────────────────────── */

const places = [];
const seen = new Set();

function add(row) {
  if (!row.lat || !row.lng) return;
  let id = slugify(row.name);
  if (!id) return;
  if (seen.has(id)) {
    // Two sites genuinely share a name (several "Hank Lopez" entries do);
    // the city facility id keeps them apart rather than one silently
    // overwriting the other.
    id = `${id}-${String(row.city_facility_id ?? places.length).toLowerCase()}`;
    if (seen.has(id)) return;
  }
  seen.add(id);
  places.push({ id, ...row });
}

// Community centers — indoor, staffed, and the closest thing the city runs to
// a true third space.
for (const { attributes: a, geometry } of centreRows) {
  const point = centroidOf(geometry);
  const amenities = amenitiesByLocation.get(a.LOCATIONID) ?? [];

  // A gym, a commercial kitchen, and an elevator are real facilities the
  // amenity layer does not cover, so they count toward interactability.
  const indoor =
    (a.GYM === "Yes" ? 1 : 0) +
    (a.KITCHEN && a.KITCHEN !== "None" ? 1 : 0) +
    (a.SENIORNUTRITION === "Yes" ? 1 : 0);

  const indoorLabels = [
    a.GYM === "Yes" && "a gym",
    a.KITCHEN === "Commercial" && "a commercial kitchen",
    a.SENIORNUTRITION === "Yes" && "a senior nutrition program",
    a.ELEVATOR === "Yes" && "an elevator",
  ].filter(Boolean);

  add({
    source: "sjc-community-centers",
    city_facility_id: a.FACILITYID ?? null,
    city_location_id: a.LOCATIONID ?? null,
    google_place_id: null,
    name: a.NAME,
    category: "Gathering",
    address: a.ADDRESS ?? null,
    lat: point?.lat ?? null,
    lng: point?.lng ?? null,
    neighborhood: areaAt(point, neighborhoods)?.name ?? null,
    district: null, // backfilled from the nearest district anchor below
    price_level: 0,
    popularity: interactabilityFrom(amenities, indoor),
    amenities: [...new Set(amenities.map((x) => x.type))].sort(),
    interests: interestsFrom(amenities),
    parking_spaces: a.PARKING ?? null,
    acres: null,
    condition: null,
    hours: null,
    summary:
      indoorLabels.length || amenities.length
        ? `Community center with ${
            indoorLabels.length ? indoorLabels.join(", ") : "public rooms"
          }.${amenities.length ? ` ${describeAmenities(amenities)}` : ""}`.trim()
        : null,
    rating: null,
    reviews: 0,
    quote: null,
    quote_author: null,
    quote_rating: null,
  });
}

// Library branches.
for (const { attributes: a, geometry } of libraryRows) {
  const point = centroidOf(geometry);
  add({
    source: "sjc-libraries",
    city_facility_id: a.FACILITYID ?? null,
    city_location_id: null,
    google_place_id: null,
    name: a.NAME,
    category: "Gathering",
    address: a.FULLADDR ?? null,
    lat: point?.lat ?? null,
    lng: point?.lng ?? null,
    neighborhood: areaAt(point, neighborhoods)?.name ?? null,
    district: null, // backfilled from the nearest district anchor below
    price_level: 0,
    // A branch is one room with one thing to do in the amenity vocabulary,
    // but it is a genuine gathering place, so it gets a floor rather than a
    // null that would drop the component entirely.
    popularity: 55,
    amenities: [],
    interests: ["Reading", "Tutoring"],
    parking_spaces: null,
    acres: null,
    condition: null,
    // The city publishes these columns but leaves them empty, so nothing is
    // claimed about opening times rather than a plausible time being typed in.
    hours: a.OPERHOURS ?? null,
    summary: "Branch of the San José Public Library.",
    rating: null,
    reviews: 0,
    quote: null,
    quote_author: null,
    quote_rating: null,
  });
}

// Parks, trails, gardens, and dog parks.
for (const { attributes: a, geometry } of parkRows) {
  if (!PARK_TYPES[a.PARKTYPE]) continue;
  if (a.PARKTYPE === "CC" || a.PARKTYPE === "LIBR") continue; // already listed above

  const amenities = amenitiesByLocation.get(a.LOCATIONID) ?? [];
  const assessment = conditionByLocation.get(a.LOCATIONID);
  // An open space with nothing built on it is land, not somewhere to go.
  // A parcel the city assessed counts even when the amenity layer is thin,
  // because being assessed means staff treat it as a park.
  if (!amenities.length && !assessment) continue;

  const point = centroidOf(geometry);

  add({
    source: "sjc-parks",
    city_facility_id: a.FACILITYID ?? null,
    city_location_id: a.LOCATIONID ?? null,
    google_place_id: null,
    name: a.NAME,
    category: categoryFor(a.PARKTYPE, amenities),
    address: a.ADDRESS ?? null,
    lat: point?.lat ?? null,
    lng: point?.lng ?? null,
    neighborhood: areaAt(point, neighborhoods)?.name ?? null,
    district: districtName(a.PLANNINGAREA),
    price_level: 0,
    popularity: interactabilityFrom(amenities),
    amenities: [...new Set(amenities.map((x) => x.type))].sort(),
    interests: interestsFrom(amenities),
    parking_spaces: null,
    acres: a.ALLACRES ? Number(a.ALLACRES.toFixed(1)) : null,
    condition: assessment?.OVERALLSCORE != null ? Number(assessment.OVERALLSCORE.toFixed(3)) : null,
    hours: null,
    summary: describeAmenities(amenities),
    rating: null,
    reviews: 0,
    quote: null,
    quote_author: null,
    quote_rating: null,
  });
}

/* ── Carry Google's half across ───────────────────────────────────
   The city knows what a place *is*; Google knows what people think of it.
   Rows already enriched by refresh-places.mjs keep their place id, rating,
   review count, and quote, so a re-sync of the city facts never throws away
   the expensive half of the catalogue. Matching is on the normalised name,
   then on the street address, and nothing is merged on a guess. */

function normalise(value) {
  return (value ?? "")
    .toLowerCase()
    .replace(/\b(branch|regional|the)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const byName = new Map();
const byAddress = new Map();
for (const place of places) {
  byName.set(normalise(place.name), place);
  if (place.address) byAddress.set(normalise(place.address), place);
}

let carried = 0;
for (const old of EXISTING) {
  if (!old.google_place_id) continue;
  const match = byName.get(normalise(old.name)) ?? byAddress.get(normalise(old.address));
  if (!match) {
    console.error(`  no city record for "${old.name}" — its Google data is dropped`);
    continue;
  }

  match.google_place_id = old.google_place_id;
  match.rating = old.rating ?? null;
  match.reviews = old.reviews ?? 0;
  match.quote = old.quote ?? null;
  match.quote_author = old.quote_author ?? null;
  match.quote_rating = old.quote_rating ?? null;
  // Keeps refresh-places.mjs working oldest-first across a re-sync instead of
  // treating the whole catalogue as never refreshed.
  if (old.refreshed) match.refreshed = old.refreshed;
  if (old.closed) match.closed = true;
  // Google's editorial line is written by a person and beats a list of
  // amenity codes, so it wins where there is one.
  if (old.summary) match.summary = old.summary;
  if (old.price_level != null) match.price_level = old.price_level;
  carried++;
}

console.error(`  carried Google data onto ${carried} of ${EXISTING.length} previous rows`);

/* ── Where to invest ──────────────────────────────────────────── */
//
// This replaces three invented funding applications. A site is flagged when
// the city's own 2025 condition assessment scored it poorly *and* it sits in
// a tract the city's Equity Index marks as a priority. Both halves are
// published numbers, and both are shown on the screen, so the ranking can be
// checked rather than taken on faith.

const needs = [];

for (const place of places) {
  const assessment = place.city_location_id
    ? conditionByLocation.get(place.city_location_id)
    : null;
  if (!assessment || assessment.OVERALLSCORE == null) continue;

  const tract = areaAt({ lat: place.lat, lng: place.lng }, equityAreas);
  if (!tract) continue;

  // Condition runs 0–1, best last. The Healthy Places Index percentile runs
  // 0–100, least healthy first. EQUITYSCORECOMBINED is the sum of two 1–5
  // sub-scores, so it runs 2–10 rather than 1–5 — normalising it as 1–5 is
  // what pushed the first pass of this list past 100.
  const disrepair = 1 - assessment.OVERALLSCORE;
  const hpi = assessment.HPIPCTILE != null ? 1 - assessment.HPIPCTILE / 100 : null;
  const equity = tract.EQUITYSCORECOMBINED != null ? (tract.EQUITYSCORECOMBINED - 2) / 8 : null;

  const parts = [disrepair, hpi, equity].filter((n) => n != null);
  const need = Math.round((parts.reduce((t, n) => t + n, 0) / parts.length) * 100);

  needs.push({
    id: place.id,
    name: place.name,
    category: place.category,
    neighborhood: place.neighborhood,
    lat: place.lat,
    lng: place.lng,
    need,
    condition: Number(assessment.OVERALLSCORE.toFixed(3)),
    assessed: assessment.ASSESSMENTYEAR ?? null,
    hpi_percentile: assessment.HPIPCTILE ?? null,
    equity_score: tract.EQUITYSCORECOMBINED ?? null,
    tract: tract.CENSUSTRACT ?? null,
    population: tract.POPTOTAL ?? null,
    median_income: tract.INCMEDIANINCOME ?? null,
    // The weakest scored categories, so the screen can say what is actually
    // wrong instead of describing it in general terms.
    weakest: [
      ["Restrooms", assessment.RESTROOMSCORETOTAL],
      ["Courts", assessment.COURTSCORETOTAL],
      ["Playground", assessment.PLAYGROUNDSCORETOTAL],
      ["Sports fields", assessment.FIELDSCORETOTAL],
      ["Turf", assessment.TURFSCORETOTAL],
    ]
      .filter(([, score]) => score != null)
      .sort((a, b) => a[1] - b[1])
      .slice(0, 3)
      .map(([label, score]) => ({ label, score: Number(score.toFixed(2)) })),
  });
}

needs.sort((a, b) => b.need - a.need);

/* ── Write ────────────────────────────────────────────────────── */

places.sort((a, b) => a.name.localeCompare(b.name));

// The district list the profiler offers when Google's autocomplete is not
// reachable, and the "common choices" chips it shows first.
//
// Two earlier attempts got this wrong and are worth not repeating: ordering
// the 297 association areas by tract population put "Trimble Business Area"
// at the top, and ordering them by park count put "Ballbach and Sofa" there.
// Both are real names; neither is one a reader would recognise as home. The
// planning areas are the ~15 districts the city itself uses, so the chips now
// read Willow Glen, Almaden, Berryessa.
//
// Each district's anchor is the mean of the places in it — the city publishes
// no polygon for these, and for a "roughly where are you" origin the middle
// of a district's parks is close enough.
const districts = new Map();

for (const place of places) {
  if (!place.district || place.lat == null) continue;
  const held = districts.get(place.district) ?? { lat: 0, lng: 0, places: 0 };
  held.lat += place.lat;
  held.lng += place.lng;
  held.places += 1;
  districts.set(place.district, held);
}

const neighborhoodList = [...districts.entries()]
  .map(([name, d]) => ({
    name,
    lat: Number((d.lat / d.places).toFixed(5)),
    lng: Number((d.lng / d.places).toFixed(5)),
    places: d.places,
  }))
  .sort((a, b) => b.places - a.places || a.name.localeCompare(b.name));

// Only the Parks layer carries PLANNINGAREA. Community centers and libraries
// take the district whose anchor they are nearest to, which for a geography
// this coarse lands them in the right one.
for (const place of places) {
  if (place.district || place.lat == null) continue;
  let best = null;
  for (const d of neighborhoodList) {
    const gap = (d.lat - place.lat) ** 2 + (d.lng - place.lng) ** 2;
    if (!best || gap < best.gap) best = { name: d.name, gap };
  }
  place.district = best?.name ?? null;
}

const catalogue = {
  generated: new Date().toISOString().slice(0, 10),
  source: "City of San José open data (CC-BY) · geo.sanjoseca.gov OPN_OpenDataService",
  layers: LAYERS,
  neighborhoods: neighborhoodList,
  places,
  needs: needs.slice(0, 40),
};

writeCatalogue(catalogue);

console.error(`\nWrote ${places.length} places and ${catalogue.needs.length} invest sites.`);
console.error(
  "  by category: " +
    Object.entries(
      places.reduce((counts, p) => ({ ...counts, [p.category]: (counts[p.category] ?? 0) + 1 }), {})
    )
      .map(([k, v]) => `${k} ${v}`)
      .join(" · ")
);
console.error(`  with a condition score: ${places.filter((p) => p.condition != null).length}`);
console.error(`  with a neighborhood: ${places.filter((p) => p.neighborhood).length}`);
