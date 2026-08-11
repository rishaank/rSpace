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
              className={["pin", variant === "need" ? "need" : "", place.id === selectedId ? "on" : ""]
                .filter(Boolean)
                .join(" ")}
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
  const markers = useRef([]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;

    (async () => {
      const maps = await loadMaps();
      if (!live || !host.current) return;
      if (!maps?.importLibrary) return setFailed(true);

      // Under `loading=async` the libraries have to be imported before their
      // constructors are used — `new maps.Map()` off the global renders blank.
      const [{ Map }, { AdvancedMarkerElement }] = await Promise.all([
        maps.importLibrary("maps"),
        maps.importLibrary("marker"),
      ]);
      if (!live || !host.current) return;

      map.current ??= new Map(host.current, {
        mapId: MAP_ID,
        center: origin ?? { lat: 37.3352, lng: -121.8911 },
        zoom: 12,
        disableDefaultUI: true,
        gestureHandling: "greedy",
      });

      // A rejected map leaves the marker library in a state where the
      // constructor throws; that must not take the whole effect down.
      markers.current.forEach((m) => (m.map = null));
      markers.current = places.flatMap((place) => {
        try {
        const el = document.createElement("button");
        el.type = "button";
        el.className = [
          "pin",
          variant === "need" ? "need" : "",
          place.id === selectedId ? "on" : "",
        ]
          .filter(Boolean)
          .join(" ");
        el.style.position = "static";
        el.style.transform = "none";
        el.textContent = String(variant === "need" ? place.need : place.total);
        el.addEventListener("click", () => onSelect(place.id));

          return new AdvancedMarkerElement({
            map: map.current,
            position: { lat: place.lat, lng: place.lng },
            content: el,
          });
        } catch {
          return [];
        }
      });

      const bounds = new maps.LatLngBounds();
      places.forEach((p) => bounds.extend({ lat: p.lat, lng: p.lng }));
      if (origin) bounds.extend(origin);
      if (places.length) map.current.fitBounds(bounds, 56);

      // Google can initialise the container and then replace it with its own
      // "Something went wrong" panel, which paints no tiles. Either way, show
      // the drawn map — but say why, so the cause is not invisible.
      setTimeout(() => {
        if (!live) return;
        const painted = host.current?.querySelector("canvas, img");
        if (painted) return;
        console.error(
          "[rSpace] The Google map loaded but never painted, so the drawn map is " +
            "being shown instead. " +
            (mapsAuthFailure() ?? "No auth failure was reported — check the console for a Google ...MapError.")
        );
        setFailed(true);
      }, 6000);
    })().catch((error) => {
      // The paper map is a fine fallback, but a silent one hides real bugs.
      console.warn("[map] falling back to the drawn map:", error);
      if (live) setFailed(true);
    });

    return () => {
      live = false;
    };
  }, [places, selectedId, origin, variant, onSelect]);

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
