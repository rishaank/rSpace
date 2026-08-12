import { useEffect, useRef, useState } from "react";
import { hasMapsKey, loadMaps, mapsAuthFailure } from "../lib/google";

// Advanced markers require a real Map ID from Google Cloud. Google's sample
// "DEMO_MAP_ID" initialises a container that never paints, so without a real
// one we use the drawn map from the design instead of a blank panel.
const MAP_ID = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID;
const hasMapId = Boolean(MAP_ID) && MAP_ID !== "DEMO_MAP_ID";

// Where a lat/lng lands inside the paper map, as a percentage of the frame.
// The band is inset so nothing hides behind the header or the bottom sheet.
function project(point, bounds) {
  const x = (point.lng - bounds.west) / (bounds.east - bounds.west || 1);
  const y = (bounds.north - point.lat) / (bounds.north - bounds.south || 1);
  return { left: `${14 + x * 72}%`, top: `${30 + y * 29}%` };
}

function boundsOf(points) {
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  return {
    north: Math.max(...lats),
    south: Math.min(...lats),
    east: Math.max(...lngs),
    west: Math.min(...lngs),
  };
}

function pinClass(place, variant, selectedId) {
  return ["pin", variant === "need" ? "need" : "", place.id === selectedId ? "on" : ""]
    .filter(Boolean)
    .join(" ");
}

// Marker content is a plain DOM node, so its look is written rather than
// rendered. Creation and selection both go through here — a marker that is
// built after the labelling effect has run would otherwise stay blank.
function paintPin(el, place, variant, selectedId) {
  el.className = pinClass(place, variant, selectedId);
  el.textContent = String(variant === "need" ? place.need : place.total);
}

/**
 * Renders the Google map when a key is configured, and the paper map from the
 * design otherwise. Pins carry the score; the selected one is filled.
 */
export default function MapCanvas(props) {
  if (hasMapsKey && hasMapId && !props.loading) return <LiveMap {...props} />;
  return <PaperMap {...props} />;
}

/** The design's drawn map — also the fallback whenever Google is unavailable. */
function PaperMap({
  places,
  selectedId,
  onSelect,
  origin,
  variant = "score",
  loading = false,
  heat = [],
}) {
  const points = places.length ? places : [{ lat: 37.3352, lng: -121.8911 }];
  const bounds = boundsOf(origin ? [...points, origin] : points);

  return (
    <div className={`map${loading ? " loading" : ""}`} aria-hidden={loading}>
      <div className="water" />

      {heat.map((spot, i) => (
        <div
          key={i}
          className="heat"
          style={{
            ...project(spot, bounds),
            width: spot.size,
            height: spot.size,
            opacity: spot.opacity,
          }}
        />
      ))}

      {origin && <div className="youarehere" style={project(origin, bounds)} title="You are here" />}

      {/* Ascending, so the strongest scores sit on top of the pile. */}
      {[...places]
        .sort((a, b) => (a.total ?? a.need) - (b.total ?? b.need))
        .map((place) =>
          loading ? (
            <div key={place.id} className="pin skeleton" style={project(place, bounds)} />
          ) : (
            <button
              key={place.id}
              type="button"
              className={pinClass(place, variant, selectedId)}
              style={project(place, bounds)}
              onClick={() => onSelect(place.id)}
            >
              {variant === "need" ? place.need : place.total}
            </button>
          )
        )}
    </div>
  );
}

function LiveMap({ places, selectedId, onSelect, origin, variant }) {
  const host = useRef(null);
  const map = useRef(null);
  const markers = useRef(new Map());
  const [failed, setFailed] = useState(false);
  // The map is built asynchronously, so the effects that hang things off it
  // need a signal to run again once it exists.
  const [ready, setReady] = useState(false);

  // The list identity changes on every re-score, but the view should only be
  // refitted when the set of pins actually changes — not when a filter leaves
  // the same places in a new order, and never when the selection moves.
  const signature = places
    .map((p) => p.id)
    .sort()
    .join(",");

  // Build the map once. Tearing it down and rebuilding it on every state
  // change was what made panning feel like it snapped back.
  useEffect(() => {
    let live = true;

    (async () => {
      const maps = await loadMaps();
      if (!live || !host.current) return;
      if (!maps?.importLibrary) return setFailed(true);

      // Under `loading=async` the libraries have to be imported before their
      // constructors are used — `new maps.Map()` off the global renders blank.
      const [{ Map }] = await Promise.all([maps.importLibrary("maps"), maps.importLibrary("marker")]);
      if (!live || !host.current || map.current) return;

      map.current = new Map(host.current, {
        mapId: MAP_ID,
        center: origin ?? { lat: 37.3352, lng: -121.8911 },
        zoom: 12,
        disableDefaultUI: true,
        gestureHandling: "greedy",
      });
      setReady(true);

      // Google can initialise the container and then replace it with its own
      // "Something went wrong" panel, which paints no tiles. Either way, show
      // the drawn map — but say why, so the cause is not invisible.
      //
      // A hidden tab gets no animation frames, and the vector map is driven
      // by them, so it cannot paint however healthy it is. Checking anyway
      // would condemn every backgrounded tab to the drawn map for the rest of
      // the session — so a hidden page defers the verdict until it is looked at.
      const check = () => {
        if (!live) return;
        if (document.visibilityState !== "visible") {
          document.addEventListener("visibilitychange", () => setTimeout(check, 6000), { once: true });
          return;
        }
        const painted = host.current?.querySelector("canvas, img");
        if (painted) return;
        console.error(
          "[rSpace] The Google map loaded but never painted, so the drawn map is " +
            "being shown instead. " +
            (mapsAuthFailure() ?? "No auth failure was reported — check the console for a Google ...MapError.")
        );
        setFailed(true);
      };

      setTimeout(check, 6000);
    })().catch((error) => {
      // The paper map is a fine fallback, but a silent one hides real bugs.
      console.warn("[map] falling back to the drawn map:", error);
      if (live) setFailed(true);
    });

    return () => {
      live = false;
    };
  }, [origin]);

  // Markers follow the place list. Only the ones that came or went are
  // touched, so a re-score doesn't flicker every pin on the map.
  useEffect(() => {
    const google = window.google?.maps;
    if (!map.current || !google) return;
    let cancelled = false;

    (async () => {
      const { AdvancedMarkerElement } = await google.importLibrary("marker");
      if (cancelled || !map.current) return;

      const wanted = new Set(places.map((p) => p.id));
      markers.current.forEach((marker, id) => {
        if (wanted.has(id)) return;
        marker.map = null;
        markers.current.delete(id);
      });

      for (const place of places) {
        if (markers.current.has(place.id)) continue;
        try {
          const el = document.createElement("button");
          el.type = "button";
          el.style.position = "static";
          el.style.transform = "none";
          el.addEventListener("click", () => onSelect(place.id));
          paintPin(el, place, variant, selectedId);

          markers.current.set(
            place.id,
            new AdvancedMarkerElement({
              map: map.current,
              position: { lat: place.lat, lng: place.lng },
              content: el,
            })
          );
        } catch {
          // A rejected map leaves the marker constructor throwing; one bad
          // pin must not take the rest of the map down with it.
        }
      }

      // Refit only when the set of pins changed, which is what this effect
      // keys off. Refitting on every render snapped the view back mid-pan.
      if (!places.length) return;
      const bounds = new google.LatLngBounds();
      places.forEach((p) => bounds.extend({ lat: p.lat, lng: p.lng }));
      if (origin) bounds.extend(origin);
      map.current.fitBounds(bounds, 56);
    })().catch(() => {});

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, ready]);

  // Label and highlight without rebuilding: selection changes hundreds of
  // times a session and must not cost a marker rebuild or a refit.
  useEffect(() => {
    places.forEach((place) => {
      const el = markers.current.get(place.id)?.content;
      if (el) paintPin(el, place, variant, selectedId);
    });
  }, [places, selectedId, variant]);

  // Google unreachable: fall back to the paper map rather than a blank panel.
  if (failed) {
    return (
      <PaperMap
        places={places}
        selectedId={selectedId}
        onSelect={onSelect}
        origin={origin}
        variant={variant}
      />
    );
  }

  return <div className="mapgl" ref={host} />;
}
