// One data surface for the whole app.
//
// With VITE_SUPABASE_* set, everything goes to Supabase. Without it the same
// calls run against localStorage using the curated seed list, so the app is
// fully clickable before any keys exist. Nothing above this file knows which.

import { supabase, hasSupabase } from "./supabase";
import { PLACES, NEEDS } from "./seed";
import { DEFAULT_WEIGHTS, FACTORS } from "./scoring";

const KEY = "rspace.v1";

function readLocal() {
  const raw = localStorage.getItem(KEY);
  return raw ? JSON.parse(raw) : { accounts: [], session: null, profiles: {}, weights: {}, favorites: {} };
}

function writeLocal(next) {
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

async function digest(password) {
  const bytes = new TextEncoder().encode(`rspace:${password}`);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/* ── Auth ─────────────────────────────────────────────────────── */

export async function getSession() {
  if (hasSupabase) {
    const { data } = await supabase.auth.getSession();
    return data.session ? { userId: data.session.user.id, email: data.session.user.email } : null;
  }
  const db = readLocal();
  return db.session;
}

export function onAuthChange(callback) {
  if (!hasSupabase) return () => {};
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session ? { userId: session.user.id, email: session.user.email } : null);
  });
  return () => data.subscription.unsubscribe();
}

export async function signUp(email, password) {
  if (hasSupabase) {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return { error: error.message };
    // The project requires email confirmation: the account exists, but there
    // is no session until the link is clicked.
    if (!data.session) return { pending: true };
    return { session: { userId: data.user.id, email: data.user.email } };
  }

  const db = readLocal();
  if (db.accounts.some((a) => a.email === email)) {
    return { error: "An account already uses that email. Try signing in." };
  }
  const account = { id: crypto.randomUUID(), email, hash: await digest(password) };
  const session = { userId: account.id, email };
  writeLocal({ ...db, accounts: [...db.accounts, account], session });
  return { session };
}

export async function signIn(email, password) {
  if (hasSupabase) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: "That email and password don't match. Try again, or reset your password." };
    return { session: { userId: data.user.id, email: data.user.email } };
  }

  const db = readLocal();
  const account = db.accounts.find((a) => a.email === email);
  if (!account || account.hash !== (await digest(password))) {
    return { error: "That email and password don't match. Try again, or reset your password." };
  }
  const session = { userId: account.id, email };
  writeLocal({ ...db, session });
  return { session };
}

export async function signOut() {
  if (hasSupabase) {
    await supabase.auth.signOut();
    return;
  }
  writeLocal({ ...readLocal(), session: null });
}

export async function deleteAccount(userId) {
  if (hasSupabase) {
    await supabase.from("profiles").delete().eq("id", userId);
    await supabase.auth.signOut();
    return;
  }
  const db = readLocal();
  const { [userId]: _p, ...profiles } = db.profiles;
  const { [userId]: _w, ...weights } = db.weights;
  const { [userId]: _f, ...favorites } = db.favorites;
  writeLocal({
    accounts: db.accounts.filter((a) => a.id !== userId),
    session: null,
    profiles,
    weights,
    favorites,
  });
}

/* ── Profile ──────────────────────────────────────────────────── */

// `text_scale` and `simple_ui` are the reader's display settings. The profiler
// proposes them from the age given and they are changed in the profile, so a
// row that predates them reads back as the standard screen either way.
const EMPTY_PROFILE = {
  name: "",
  age: null,
  location: "",
  lat: null,
  lng: null,
  interests: [],
  profile_picture_url: null,
  text_scale: 1,
  simple_ui: false,
};

export async function getProfile(userId) {
  if (hasSupabase) {
    const { data } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
    return data ? { ...EMPTY_PROFILE, ...data } : null;
  }
  return readLocal().profiles[userId] ?? null;
}

export async function saveProfile(userId, patch) {
  const next = { ...EMPTY_PROFILE, ...((await getProfile(userId)) ?? {}), ...patch };

  if (hasSupabase) {
    const { error } = await supabase.from("profiles").upsert({ id: userId, ...next });
    if (error) return { error: error.message };
    return { profile: next };
  }

  const db = readLocal();
  writeLocal({ ...db, profiles: { ...db.profiles, [userId]: next } });
  return { profile: next };
}

/* ── Weights ──────────────────────────────────────────────────── */

export async function getWeights(userId) {
  if (hasSupabase) {
    const { data } = await supabase.from("score_weights").select("*").eq("user_id", userId).maybeSingle();
    if (!data) return { ...DEFAULT_WEIGHTS };
    return Object.fromEntries(FACTORS.map((f) => [f.key, data[f.column]]));
  }
  return readLocal().weights[userId] ?? { ...DEFAULT_WEIGHTS };
}

export async function saveWeights(userId, weights) {
  if (hasSupabase) {
    const row = Object.fromEntries(FACTORS.map((f) => [f.column, weights[f.key]]));
    await supabase.from("score_weights").upsert({ user_id: userId, ...row });
    return weights;
  }
  const db = readLocal();
  writeLocal({ ...db, weights: { ...db.weights, [userId]: weights } });
  return weights;
}

/* ── Places ───────────────────────────────────────────────────── */

// Returns closed places too — they stay reachable by link, and the store
// keeps them off the map and out of scoring.
//
// Supabase wins where it has the row, and the bundled catalogue fills in the
// rest. That union is not belt-and-braces: the generators commit to the repo
// and push to Supabase in the same workflow run, and anything that widens the
// catalogue — a new source, a schema change, a failed push — leaves the table
// a step behind the bundle until the next run. Without the union those places
// are simply invisible to signed-in readers for a day, which is how a feature
// ships looking broken.
export async function listPlaces() {
  if (hasSupabase) {
    const { data } = await supabase.from("third_spaces").select("*");
    if (data?.length) {
      const rows = data.map((row) => ({ ...row, id: row.slug }));
      const known = new Set(rows.map((row) => row.id));
      return [...rows, ...PLACES.filter((place) => !known.has(place.id))];
    }
  }
  return PLACES;
}

/* ── Favorites ────────────────────────────────────────────────── */

export async function listFavorites(userId) {
  if (hasSupabase) {
    const { data } = await supabase
      .from("favorites")
      .select("third_spaces(slug)")
      .eq("user_id", userId);
    return (data ?? []).map((row) => row.third_spaces.slug);
  }
  return readLocal().favorites[userId] ?? [];
}

export async function toggleFavorite(userId, slug, saved) {
  if (hasSupabase) {
    const { data: place } = await supabase
      .from("third_spaces")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    // A place the bundled catalogue has and the table has not caught up to
    // yet — see listPlaces above. There is no row to key a favorite to, and
    // `single()` used to throw here rather than say so.
    if (!place) return;
    if (saved) {
      await supabase.from("favorites").insert({ user_id: userId, third_space_id: place.id });
    } else {
      await supabase.from("favorites").delete().eq("user_id", userId).eq("third_space_id", place.id);
    }
    return;
  }

  const db = readLocal();
  const current = db.favorites[userId] ?? [];
  const next = saved ? [...new Set([...current, slug])] : current.filter((s) => s !== slug);
  writeLocal({ ...db, favorites: { ...db.favorites, [userId]: next } });
}

/* ── Adopt ────────────────────────────────────────────────────── */

// Not a Supabase read. The invest list is derived entirely from the city's
// published condition assessments and Equity Index, so it ships with the
// build and is regenerated by scripts/sync-sanjose.mjs rather than being
// something a user or an admin edits.
export async function listNeeds() {
  return NEEDS;
}
