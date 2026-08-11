// Google Maps JavaScript API, Places (New), and Routes.
//
// Without VITE_GOOGLE_MAPS_API_KEY every call resolves to null and the screens
// fall back to the paper map, typed neighborhoods, and seeded transit times.
// Every call here is also allowed to fail that way at runtime: a blocked
// referrer or a disabled API degrades the screen, it never hangs it.

const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

export const hasMapsKey = Boolean(key);

const LOAD_TIMEOUT_MS = 10000;

let loader = null;

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

/**
 * Address suggestions. Each carries the Place it came from, so resolving it
 * later needs Places only — no Geocoding API.
 */
export async function suggestAddresses(query) {
  if (query.trim().length < 3) return [];

  const places = await library("places");
  if (!places) return [];

  try {
    const { suggestions } = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
      input: query,
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
    await suggestion.place.fetchFields({ fields: ["location", "addressComponents"] });
    return {
      lat: suggestion.place.location.lat(),
      lng: suggestion.place.location.lng(),
      location: readNeighborhood(suggestion.place.addressComponents ?? []),
    };
  } catch {
    return null;
  }
}

const PRICE_LEVELS = {
  FREE: 0,
  INEXPENSIVE: 1,
  MODERATE: 2,
  EXPENSIVE: 3,
  VERY_EXPENSIVE: 4,
};

/** Live rating, review count, and price level for one place, or null. */
export async function placeDetails(placeId) {
  const places = await library("places");
  if (!places) return null;

  try {
    const place = new places.Place({ id: placeId });
    await place.fetchFields({
      fields: ["rating", "userRatingCount", "priceLevel", "reviews", "businessStatus"],
    });

    return {
      rating: place.rating,
      reviews: place.userRatingCount,
      price_level: PRICE_LEVELS[place.priceLevel] ?? null,
      quote: place.reviews?.[0]?.text?.text ?? null,
      closed: place.businessStatus === "CLOSED_PERMANENTLY",
    };
  } catch {
    return null;
  }
}

/** Routes API, transit mode — minutes from the user to the place, or null. */
export async function transitMinutes(origin, destination) {
  if (!hasMapsKey || !origin) return null;

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
}
