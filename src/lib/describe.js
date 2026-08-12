// Turns the facts Google reports about a place into one plain sentence.
//
// This exists because the seed list used to carry hand-written blurbs, and one
// of them credited Almaden Community Center with a pool it does not have.
// Nothing here invents anything: every clause is switched on a field Google
// actually returned, so the worst failure is a description that is short.

// Google's `types` are machine names. Only the ones worth saying out loud are
// listed; anything else is ignored rather than guessed at.
const FEATURES = [
  ["swimming_pool", "a pool"],
  ["gym", "a gym"],
  ["fitness_center", "a gym"],
  ["auditorium", "an auditorium"],
  ["library", "a library"],
  ["playground", "a playground"],
  ["skateboard_park", "a skate park"],
  ["dog_park", "a dog run"],
  ["sports_complex", "sports fields"],
  ["athletic_field", "sports fields"],
  ["garden", "gardens"],
  ["picnic_ground", "picnic ground"],
  ["community_garden", "a community garden"],
  ["event_venue", "event space"],
];

function list(items) {
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}

/**
 * @param place a seed row carrying `facts` from scripts/refresh-places.mjs
 * @returns a sentence, or null when Google told us nothing worth saying
 */
export function describePlace(place) {
  const facts = place.facts;
  if (!facts) return null;

  // Google's own editorial line is written by a person and is the best thing
  // available, so it wins outright when the place has one.
  if (facts.editorial) return facts.editorial;

  const types = facts.types ?? [];
  const kind = facts.primary ?? null;

  const features = FEATURES.filter(([type]) => types.includes(type))
    .map(([, label]) => label)
    // The primary type is already the subject of the sentence; repeating it
    // as a feature reads as "Library with a library".
    .filter((label) => !kind || !kind.toLowerCase().includes(label.split(" ").at(-1)));

  const parts = [];
  if (kind && features.length) parts.push(`${kind} with ${list(features)}`);
  else if (kind) parts.push(kind);
  else if (features.length) parts.push(`Has ${list(features)}`);

  const amenities = [
    facts.goodForChildren && "good for kids",
    facts.restroom && "restrooms",
    facts.freeParking && "free parking",
    facts.wheelchair && "step-free entrance",
    facts.outdoorSeating && "outdoor seating",
  ].filter(Boolean);

  if (amenities.length) parts.push(list(amenities.slice(0, 3)));

  if (!parts.length) return null;
  const sentence = parts.join(" · ");
  return sentence.endsWith(".") ? sentence : `${sentence}.`;
}

/**
 * Why a site is on the invest list, in one sentence. Same rule as above:
 * every clause is switched on a number the City of San José published, so a
 * site missing one gets a shorter sentence rather than a filled-in guess.
 *
 * @param need a row from catalogue.json's `needs`
 */
export function describeNeed(need) {
  const parts = [];

  if (need.condition != null && need.assessed) {
    parts.push(
      `The city's ${need.assessed} survey scored it ${Math.round(need.condition * 100)} out of 100`
    );
  }
  if (need.hpi_percentile != null) {
    parts.push(
      `it sits in the ${ordinal(Math.round(need.hpi_percentile))} percentile of the Healthy Places Index`
    );
  }
  if (need.weakest?.length) {
    parts.push(`${need.weakest[0].label.toLowerCase()} scored lowest of anything on site`);
  }

  if (!parts.length) return "The city has not published enough on this site to rank it.";
  if (parts.length === 1) return `${parts[0]}.`;
  return `${parts.slice(0, -1).join(", ")}, and ${parts.at(-1)}.`;
}

function ordinal(n) {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}
