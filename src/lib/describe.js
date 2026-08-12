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
