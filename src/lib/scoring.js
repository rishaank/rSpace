// Score = aI + bD + cT + dP + eC
//
// Each component is normalised to 0–1 first. Weights are stored raw and
// normalised to sum 1.0 here, at query time, so dragging one slider never
// moves the others. A component that comes back null (Google unreachable,
// say) drops out and its weight is redistributed across the rest.

export const FACTORS = [
  { key: "interactability", label: "People to meet", short: "People to meet", column: "weight_interactability" },
  { key: "distance", label: "Distance from home", short: "Distance", column: "weight_distance" },
  { key: "transport", label: "Transit access", short: "Transit access", column: "weight_transport" },
  { key: "popularity", label: "Reputation", short: "Reputation", column: "weight_popularity" },
  { key: "cost", label: "Cost of entry", short: "Cost", column: "weight_cost" },
];

export const DEFAULT_WEIGHTS = {
  interactability: 0.3,
  distance: 0.25,
  transport: 0.2,
  popularity: 0.15,
  cost: 0.1,
};

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

// I — busy-times / popularity proxy from Google Places.
function interactability(place) {
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
