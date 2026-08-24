// The catalogue, and the vocabulary the interface is built from.
//
// Nothing describing a place is written by hand. Two generators produce the
// list, and neither one's output is edited:
//
//   catalogue.json  scripts/sync-sanjose.mjs — the City of San José's own
//                   open data. Parks, community centers, libraries, what
//                   amenities are on the ground, the 2025 condition
//                   assessments, and the Equity Index tracts behind the
//                   invest list. Ratings, reviews and quotes are layered on
//                   afterwards by scripts/refresh-places.mjs from Google.
//
//   community.json  scripts/sync-community.mjs — OpenStreetMap, for the third
//                   spaces the city does not own and so does not publish:
//                   independent cafés, the open space preserves that belong
//                   to the county and the Midpeninsula district, and the
//                   places to volunteer.
//
// Re-generate rather than edit:
//
//   node scripts/sync-sanjose.mjs
//   node scripts/sync-community.mjs
//
// The lists below are the app's own vocabulary — the words the filter chips
// and the interest picker are written in. They are interface copy, not claims
// about any particular place.

import catalogue from "./catalogue.json";
import community from "./community.json";

// Ordered by how many places carry each: the map header's shortcut tabs show
// the first three, so this is also the decision about which three.
export const CATEGORIES = ["Gathering", "Sport", "Food", "Outdoors", "Service", "Other"];

// Every interest here is one at least one place actually carries. That is a
// rule, not a coincidence: an option that matches nothing empties the map and
// gives the reader no way to tell a bad filter from a bad neighborhood. Two
// used to break it — "Volunteering", which nothing in the city's data could
// satisfy, and "Faith groups", which nothing still can. Volunteering works
// now because community.json has somewhere to do it. Faith groups is gone,
// and anyone who wants it can type it: a typed interest says how many places
// it found before it is added.
export const INTEREST_GROUPS = [
  {
    name: "Sport & movement",
    items: [
      "Basketball",
      "Soccer",
      "Baseball",
      "Volleyball",
      "Tennis",
      "Pickleball",
      "Swimming",
      "Skating",
      "Fitness",
    ],
  },
  {
    name: "Outdoors",
    items: ["Walking", "Trails & nature", "Dogs", "Gardening"],
  },
  {
    name: "Making & learning",
    items: ["Reading", "Tutoring", "Chess", "Art & craft", "Music"],
  },
  {
    name: "Food & company",
    items: ["Food & meals", "Coffee & tea", "Kids & family"],
  },
  {
    name: "Community",
    items: ["Volunteering"],
  },
];

export const ALL_INTERESTS = INTEREST_GROUPS.flatMap((g) => g.items);

/** When each source was last pulled, for the profile screen's data note. */
export const SOURCES = [
  { name: catalogue.source, generated: catalogue.generated },
  { name: community.source, generated: community.generated },
];

/** When the catalogue was last pulled from the city, for the about line. */
export const GENERATED = catalogue.generated;

export const SOURCE = catalogue.source;

export const COMMUNITY_SOURCE = community.source;

/**
 * The city's own planning areas — Willow Glen, Almaden, Alum Rock and the
 * dozen others — ordered by how many third spaces sit in each. The profiler
 * falls back to these when Google's autocomplete is unreachable.
 *
 * Deliberately the coarse geography, not the 297-entry Neighborhoods layer:
 * that one is accurate on a place ("Northside-Backesto") but unhelpful in a
 * "where are you?" picker. A place carries both — `neighborhood` is the
 * specific one, `district` the recognisable one.
 */
export const NEIGHBORHOODS = catalogue.neighborhoods;

export const PLACES = [...catalogue.places, ...community.places];

/**
 * Where the city's own numbers say investment is most needed: a poor 2025
 * condition assessment inside a high-priority Equity Index tract. Every field
 * on a row is published by the city and shown on the screen, so the ranking
 * can be checked rather than taken on trust.
 *
 * City places only, and that is not an oversight — the list is built out of
 * the city's condition assessments, and nobody assesses a café.
 */
export const NEEDS = catalogue.needs;

/* ── Matching a reader's interests ────────────────────────────────
   A picked interest is one of the words above, and a place carries the same
   words, so that half is a set membership test.

   A *typed* interest is not. The reader can write anything, and the only
   honest thing to match it against is what the sources actually published
   about a place — its name, the sentence built from its amenity codes, and
   the codes themselves through the label table the city's vocabulary is
   written in. "skate" finds the skate parks; "cricket" finds nothing, and
   the picker says so before the interest is ever added, rather than the map
   silently going empty two screens later. */

const LABELS = catalogue.amenity_labels ?? {};

function fold(value) {
  return (value ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

const haystacks = new Map();

function haystack(place) {
  let text = haystacks.get(place.id);
  if (text === undefined) {
    text = fold(
      [
        place.name,
        place.summary,
        place.category,
        ...place.interests,
        ...(place.amenities ?? []).map((code) => LABELS[code]),
      ]
        .filter(Boolean)
        .join(" ")
    );
    haystacks.set(place.id, text);
  }
  return text;
}

/** True when `place` answers to at least one of `interests`. */
export function matchesInterests(place, interests) {
  return interests.some((interest) =>
    ALL_INTERESTS.includes(interest)
      ? place.interests.includes(interest)
      : haystack(place).includes(fold(interest))
  );
}

/** How many places a typed interest would find, for the picker to report. */
export function countMatches(interest) {
  const q = fold(interest).trim();
  if (q.length < 2) return 0;
  return PLACES.filter((place) => haystack(place).includes(q)).length;
}
