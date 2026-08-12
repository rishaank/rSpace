// Google Maps JavaScript API, Places (New), and Routes.
//
// Without VITE_GOOGLE_MAPS_API_KEY every call resolves to null and the screens
// fall back to the paper map, typed neighborhoods, and seeded transit times.
// Every call here is also allowed to fail that way at runtime: a blocked
// referrer or a disabled API degrades the screen, it never hangs it.
//
// Staying inside the free tier shapes this file as much as correctness does.
// Google's allowance is per SKU per month, and the tier holding ratings,
// reviews, and photos is only 1,000 calls — so ratings, review counts, price
// levels, and quotes are not fetched here at all. They are pulled once by
// scripts/refresh-places.mjs and stored on the row. What is left at runtime is
// the photo and the transit time, both of which go through the cache in
// ./cache.js and stop entirely once this browser has spent its allowance.

import { DAY, HOUR, affordable, remember } from "./cache";

const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

// Per browser, per month. Well under the per-SKU free tier even with the
// cache cold, and the cache means a normal session never approaches them.
const PHOTO_BUDGET = 60;
const ROUTE_BUDGET = 400;

export const hasMapsKey = Boolean(key);

const LOAD_TIMEOUT_MS = 10000;

let loader = null;
let authFailure = null;

/** Google calls this global on a key, referrer, or billing problem. */
export function mapsAuthFailure() {
  return authFailure;
}

/** Resolves the maps namespace, or null if it can't be loaded. */
export function loadMaps() {
  if (!hasMapsKey) return Promise.resolve(null);
  if (loader) return loader;

  loader = new Promise((resolve) => {
    // `loading=async` means onload fires before the API is usable — the
    // callback is the only signal that importLibrary() exists.
    const done = `__mapsReady_${Math.random().toString(36).slice(2)}`;
    const timer = setTimeout(() => finish(null), LOAD_TIMEOUT_MS);

    function finish(maps) {
      clearTimeout(timer);
      delete window[done];
      resolve(maps);
    }

    window[done] = () => finish(window.google?.maps ?? null);

    // Google reports key / referrer / billing problems only through this
    // global and a console line — there is no promise to catch.
    window.gm_authFailure = () => {
      authFailure = "Google rejected the API key for Maps JavaScript. Check the browser console for the exact ...MapError (usually RefererNotAllowedMapError or BillingNotEnabledMapError).";
      console.error("[rSpace] " + authFailure);
    };

    const script = document.createElement("script");
    script.src =
      `https://maps.googleapis.com/maps/api/js?key=${key}` +
      `&v=weekly&loading=async&callback=${done}`;
    script.async = true;
    script.onerror = () => finish(null);
    document.head.appendChild(script);
  });

  return loader;
}

async function library(name) {
  const maps = await loadMaps();
  if (!maps?.importLibrary) return null;
  try {
    return await maps.importLibrary(name);
  } catch {
    return null;
  }
}

export function geolocate() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve({ error: "unsupported" });
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve({ error: "denied" }),
      { timeout: 8000, maximumAge: 300000 }
    );
  });
}

function readNeighborhood(components) {
  const part = (type) => components.find((c) => c.types.includes(type))?.longText;
  const area = part("neighborhood") ?? part("sublocality") ?? part("locality");
  const city = part("locality");
  return [area, city].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(", ") || null;
}

/**
 * Reverse geocodes a point to a neighborhood name. Needs the Geocoding API,
 * which is a separate product from Maps JS — returns null when it isn't
 * enabled so callers can fall back to a known neighborhood.
 */
export async function neighborhoodFor({ lat, lng }) {
  const maps = await loadMaps();
  if (!maps?.Geocoder) return null;

  try {
    const { results } = await new maps.Geocoder().geocode({ location: { lat, lng } });
    const first = results?.[0];
    if (!first) return null;
    const part = (type) => first.address_components.find((c) => c.types.includes(type))?.long_name;
    const area = part("neighborhood") ?? part("sublocality") ?? part("locality");
    const city = part("locality");
    return [area, city].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(", ") || null;
  } catch {
    return null;
  }
}

// Every keystroke is its own billable autocomplete request unless the
// requests are tied together by a session token — one token covers the whole
// type-then-pick sequence and Google charges nothing for the session as long
// as the details call that closes it stays on cheap fields. `toPlace()`
// carries the token onward by itself, so resolveSuggestion just has to retire
// it afterwards.
let session = null;

/**
 * Address suggestions. Each carries the Place it came from, so resolving it
 * later needs Places only — no Geocoding API.
 */
export async function suggestAddresses(query) {
  if (query.trim().length < 3) return [];

  const places = await library("places");
  if (!places) return [];

  session ??= new places.AutocompleteSessionToken();

  try {
    const { suggestions } = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
      input: query,
      sessionToken: session,
      locationBias: { center: { lat: 37.3352, lng: -121.8911 }, radius: 25000 },
    });

    return (suggestions ?? []).slice(0, 4).map((s) => {
      const p = s.placePrediction;
      return {
        id: p.placeId,
        main: p.mainText?.text ?? p.text.text,
        secondary: p.secondaryText?.text ?? "",
        place: p.toPlace(),
      };
    });
  } catch {
    return [];
  }
}

/** Turns a chosen suggestion into { lat, lng, location }, or null. */
export async function resolveSuggestion(suggestion) {
  if (!suggestion?.place) return null;

  try {
    // Both fields are on Google's cheapest tier, which is what keeps the
    // session that closes here free.
    await suggestion.place.fetchFields({ fields: ["location", "addressComponents"] });
    return {
      lat: suggestion.place.location.lat(),
      lng: suggestion.place.location.lng(),
      location: readNeighborhood(suggestion.place.addressComponents ?? []),
    };
  } catch {
    return null;
  } finally {
    session = null;
  }
}

/**
 * The photo for one seeded place, or null.
 *
 * Rows carry a real `google_place_id`, so this is a direct lookup rather than
 * a text search — one cheap request against a known listing instead of a
 * search over the whole corpus, and no chance of matching the wrong place.
 * The photo is the only thing still worth asking Google for at render time;
 * everything else on the detail screen already lives on the row.
 */
export async function placePhoto(place) {
  if (!place.google_place_id) return null;

  // A week is well inside the 30 days Google allows place content to be held,
  // and turns 26 places into 26 requests a week rather than 26 a session.
  return remember(`photo:${place.google_place_id}`, 7 * DAY, async () => {
    const places = await library("places");
    if (!places) return null;
    if (!affordable("photos", PHOTO_BUDGET)) return null;

    try {
      const found = new places.Place({ id: place.google_place_id });
      await found.fetchFields({ fields: ["photos"] });
      return found.photos?.[0]?.getURI({ maxWidth: 780, maxHeight: 400 }) ?? null;
    } catch {
      return null;
    }
  });
}

/** Routes API, transit mode — minutes from the user to the place, or null. */
export async function transitMinutes(origin, destination) {
  if (!hasMapsKey || !origin) return null;

  // Rounded to about a tenth of a mile, so nudging the origin around inside
  // one neighborhood reuses the answer instead of buying a new one.
  const at = (p) => `${p.lat.toFixed(3)},${p.lng.toFixed(3)}`;

  return remember(`transit:${at(origin)}:${at(destination)}`, 12 * HOUR, async () => {
    if (!affordable("routes", ROUTE_BUDGET)) return null;

    try {
      const response = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": key,
          "X-Goog-FieldMask": "routes.duration",
        },
        body: JSON.stringify({
          origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } },
          destination: {
            location: { latLng: { latitude: destination.lat, longitude: destination.lng } },
          },
          travelMode: "TRANSIT",
        }),
      });

      if (!response.ok) return null;
      const data = await response.json();
      const seconds = Number.parseInt(data.routes?.[0]?.duration ?? "", 10);
      return Number.isFinite(seconds) ? Math.round(seconds / 60) : null;
    } catch {
      return null;
    }
  });
}
