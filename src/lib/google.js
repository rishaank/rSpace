// Google Maps JavaScript API, Places (New), and Routes.
// Without VITE_GOOGLE_MAPS_API_KEY every call resolves to null and the screens
// fall back to the paper map, typed neighborhoods, and seeded transit times.

const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

export const hasMapsKey = Boolean(key);

let loader = null;

export function loadMaps() {
  if (!hasMapsKey) return Promise.resolve(null);
  if (loader) return loader;

  loader = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=places,marker&v=weekly&loading=async`;
    script.async = true;
    script.onload = () => resolve(window.google.maps);
    script.onerror = () => reject(new Error("Google Maps failed to load"));
    document.head.appendChild(script);
  });

  return loader;
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

// We keep the neighborhood, not the point.
export async function neighborhoodFor({ lat, lng }) {
  const maps = await loadMaps();
  if (!maps) return null;

  const geocoder = new maps.Geocoder();
  const { results } = await geocoder.geocode({ location: { lat, lng } });
  const first = results?.[0];
  if (!first) return null;

  const part = (type) => first.address_components.find((c) => c.types.includes(type))?.long_name;
  const area = part("neighborhood") ?? part("sublocality") ?? part("locality");
  const city = part("locality");
  return [area, city].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(", ");
}

export async function suggestAddresses(query) {
  const maps = await loadMaps();
  if (!maps || query.trim().length < 3) return [];

  const { AutocompleteSuggestion } = await maps.importLibrary("places");
  const { suggestions } = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
    input: query,
    locationBias: { center: { lat: 37.3352, lng: -121.8911 }, radius: 25000 },
  });

  return (suggestions ?? []).slice(0, 4).map((s) => {
    const p = s.placePrediction;
    return { id: p.placeId, main: p.mainText?.text ?? p.text.text, secondary: p.secondaryText?.text ?? "" };
  });
}

export async function resolveSuggestion(placeId) {
  const maps = await loadMaps();
  if (!maps) return null;

  const { Place } = await maps.importLibrary("places");
  const place = new Place({ id: placeId });
  await place.fetchFields({ fields: ["location", "addressComponents"] });

  const lat = place.location.lat();
  const lng = place.location.lng();
  return { lat, lng, location: await neighborhoodFor({ lat, lng }) };
}

// Live ratings, review count, and price level for one place.
export async function placeDetails(placeId) {
  const maps = await loadMaps();
  if (!maps) return null;

  const { Place } = await maps.importLibrary("places");
  const place = new Place({ id: placeId });
  await place.fetchFields({
    fields: ["rating", "userRatingCount", "priceLevel", "reviews", "businessStatus", "regularOpeningHours"],
  });

  return {
    rating: place.rating,
    reviews: place.userRatingCount,
    price_level: PRICE_LEVELS[place.priceLevel] ?? null,
    quote: place.reviews?.[0]?.text?.text ?? null,
    closed: place.businessStatus === "CLOSED_PERMANENTLY",
  };
}

const PRICE_LEVELS = {
  FREE: 0,
  INEXPENSIVE: 1,
  MODERATE: 2,
  EXPENSIVE: 3,
  VERY_EXPENSIVE: 4,
};

// Routes API, transit mode — minutes from the user to the place.
export async function transitMinutes(origin, destination) {
  if (!hasMapsKey || !origin) return null;

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
}
