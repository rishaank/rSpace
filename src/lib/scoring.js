// Score = aI + bD + cT + dP + eC
//
// Each component is normalised to 0–1 first. Weights are stored raw and
// normalised to sum 1.0 here, at query time. A component that comes back null
// (Google unreachable, say) drops out and its weight is redistributed across
// the rest.
//
// The weights themselves come from the order the reader put the five factors
// in — see RANK_WEIGHTS below. Normalising at query time rather than on write
// is what lets that work: reordering the list rewrites every weight at once,
// and a factor that goes missing still leaves the remaining four in their
// stated proportions.

export const FACTORS = [
  { key: "interactability", label: "People to meet", short: "People to meet", column: "weight_interactability" },
  { key: "distance", label: "Distance from home", short: "Distance", column: "weight_distance" },
  { key: "transport", label: "Transit access", short: "Transit access", column: "weight_transport" },
  { key: "popularity", label: "Reputation", short: "Reputation", column: "weight_popularity" },
  { key: "cost", label: "Cost of entry", short: "Cost", column: "weight_cost" },
];

// People rank the five factors rather than dialling in numbers, so the
// weights come from a position in a list. The gaps are even and the set
// already sums to 1.0, which means first place is worth three times last
// place — enough for the order to matter, not so much that the bottom two
// stop counting.
export const RANK_WEIGHTS = [0.3, 0.25, 0.2, 0.15, 0.1];

export const DEFAULT_ORDER = FACTORS.map((f) => f.key);

/** A ranking, most important first, to the raw weights that get stored. */
export function weightsForOrder(order) {
  return Object.fromEntries(
    FACTORS.map((f) => [f.key, RANK_WEIGHTS[order.indexOf(f.key)] ?? RANK_WEIGHTS.at(-1)])
  );
}

/**
 * The stored weights back to a ranking. Heaviest first, and ties fall back to
 * the canonical factor order so the list never reshuffles on its own. This
 * also reads weights saved by the old sliders, whatever values they hold.
 */
export function orderForWeights(weights) {
  return [...DEFAULT_ORDER].sort(
    (a, b) =>
      (weights[b] ?? 0) - (weights[a] ?? 0) || DEFAULT_ORDER.indexOf(a) - DEFAULT_ORDER.indexOf(b)
  );
}

export const DEFAULT_WEIGHTS = weightsForOrder(DEFAULT_ORDER);

export const FALLBACK_PRICE_LEVEL = 2;

const MAX_MILES = 8; // beyond this, distance scores 0
const MAX_TRANSIT_MIN = 30;
const REVIEW_SATURATION = 500;

export function milesBetween(a, b) {
  if (!a || !b) return null;
  const R = 3958.8;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// I — how much there is to do here, counted from the amenities the city
// lists on the site by scripts/sync-sanjose.mjs.
//
// A site the city lists no amenities for returns null so the component drops
// out and its weight spreads over the rest, the same as an unreachable
// Google call. Without the guard `null / 100` is 0, which is not "unknown" —
// it is the worst possible score, and it was quietly bottom-ranking the 16
// places whose amenities the city has not published.
function interactability(place) {
  if (place.popularity == null) return null;
  return clamp01(place.popularity / 100);
}

// D — live per user, never stored.
function distance(miles) {
  if (miles == null) return null;
  return clamp01(1 - miles / MAX_MILES);
}

// T — Routes API, transit mode.
function transport(minutes) {
  if (minutes == null) return null;
  return clamp01(1 - minutes / MAX_TRANSIT_MIN);
}

// P — rating carried by review volume, so 5.0 from three people doesn't win.
function popularity(place) {
  if (place.rating == null) return null;
  const stars = clamp01((place.rating - 1) / 4);
  const volume = clamp01(
    Math.log10(1 + place.reviews) / Math.log10(1 + REVIEW_SATURATION)
  );
  return clamp01(0.65 * stars + 0.35 * volume);
}

// C — price_level 0–4, missing falls back to 2.
function cost(place) {
  const level = place.price_level ?? FALLBACK_PRICE_LEVEL;
  return clamp01(1 - level / 4);
}

function clamp01(n) {
  return Math.max(0, Math.min(1, n));
}

/**
 * @param place   a third_spaces row
 * @param weights raw slider values, keyed by factor
 * @param origin  { lat, lng } of the user, or null
 * @returns { total, components, miles, missing }
 */
export function scorePlace(place, weights, origin) {
  const miles = milesBetween(origin, place);

  const components = {
    interactability: interactability(place),
    distance: distance(miles),
    transport: transport(place.transit_minutes),
    popularity: popularity(place),
    cost: cost(place),
  };

  const present = FACTORS.filter((f) => components[f.key] != null);
  const sum = present.reduce((t, f) => t + (weights[f.key] ?? 0), 0);

  const total = sum
    ? present.reduce((t, f) => t + ((weights[f.key] ?? 0) / sum) * components[f.key], 0)
    : 0;

  return {
    total: Math.round(total * 100),
    components,
    miles,
    missing: FACTORS.filter((f) => components[f.key] == null).map((f) => f.key),
  };
}

export function scoreAll(places, weights, origin) {
  return places
    .map((place) => ({ ...place, ...scorePlace(place, weights, origin) }))
    .sort((a, b) => b.total - a.total);
}

export function normalisedWeights(weights) {
  const sum = FACTORS.reduce((t, f) => t + (weights[f.key] ?? 0), 0);
  if (!sum) return { ...DEFAULT_WEIGHTS };
  return Object.fromEntries(FACTORS.map((f) => [f.key, (weights[f.key] ?? 0) / sum]));
}

export function formatMiles(miles) {
  if (miles == null) return "—";
  return `${miles < 10 ? miles.toFixed(1) : Math.round(miles)} mi`;
}

export function formatCost(place) {
  const level = place.price_level ?? FALLBACK_PRICE_LEVEL;
  if (level === 0) return "Free";
  return "$".repeat(level);
}
