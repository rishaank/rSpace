// A localStorage cache with a time limit, and a monthly ceiling on how many
// billable Google calls one browser is allowed to make.
//
// Google's free tier is now counted per SKU per month — 10,000 calls for the
// cheap ones, 1,000 for the ones that carry ratings, reviews, and photos — so
// the cheapest request is the one that never leaves. Everything expensive
// goes through `remember`, and anything that would still cost money on a miss
// checks `affordable` first.
//
// Two things this deliberately is not: it is not a global cap (each browser
// keeps its own count, so the hard limit still belongs in the Google Cloud
// console under APIs & Services › Quotas), and it is not long-term storage.
// Google's terms allow place content to be held for 30 days at most, which is
// why no TTL here comes close to it.

const KEY = "rspace.google.v1";
const MAX_ENTRIES = 400;

export const HOUR = 60 * 60 * 1000;
export const DAY = 24 * HOUR;

function read() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) ?? { entries: {}, spent: {} };
  } catch {
    return { entries: {}, spent: {} };
  }
}

function write(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // A full or blocked store costs us the cache, not the app.
  }
}

function month() {
  return new Date().toISOString().slice(0, 7);
}

/**
 * Has this browser got room for one more call in `bucket` this month? Counts
 * the call when the answer is yes, so callers ask exactly once per attempt.
 */
export function affordable(bucket, ceiling) {
  const state = read();
  if (state.spent.month !== month()) state.spent = { month: month() };

  const used = state.spent[bucket] ?? 0;
  if (used >= ceiling) return false;

  state.spent[bucket] = used + 1;
  write(state);
  return true;
}

/** What this browser has spent so far, for the profile screen's data note. */
export function spending() {
  const state = read();
  if (state.spent.month !== month()) return {};
  const { month: _m, ...buckets } = state.spent;
  return buckets;
}

// Calls that have gone out but not come back, keyed the same way. A place
// screen that asks for a photo and a transit time at once, or two components
// asking for the same thing, must not buy it twice.
const inflight = new Map();

/**
 * Returns the cached value for `key`, or calls `load` and caches what it
 * returns. A `null` result is cached too, and for a shorter time — a place
 * with no photo should not be asked about again on every render, but it
 * should be asked about again eventually.
 */
export function remember(key, ttl, load) {
  const hit = read().entries[key];
  if (hit && hit.until > Date.now()) return Promise.resolve(hit.value);

  const existing = inflight.get(key);
  if (existing) return existing;

  const pending = (async () => {
    const value = await load();

    // Re-read rather than reusing the snapshot from the top: another call
    // may have finished and written while this one was in the air, and
    // building off the stale copy would drop whatever it stored.
    const state = read();
    const entries = {
      ...state.entries,
      [key]: { value, until: Date.now() + (value == null ? HOUR : ttl) },
    };

    // Oldest out first, so a long session can't grow the entry list forever.
    const keys = Object.keys(entries);
    if (keys.length > MAX_ENTRIES) {
      keys
        .sort((a, b) => entries[a].until - entries[b].until)
        .slice(0, keys.length - MAX_ENTRIES)
        .forEach((k) => delete entries[k]);
    }

    write({ ...state, entries });
    return value;
  })();

  inflight.set(key, pending);
  return pending.finally(() => inflight.delete(key));
}
