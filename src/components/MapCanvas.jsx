import { useEffect, useRef } from "react";
import { hasMapsKey, loadMaps } from "../lib/google";

const MAP_ID = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID ?? "DEMO_MAP_ID";

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
export default function MapCanvas({
  places,
  selectedId,
  onSelect,
  origin,
  variant = "score",
  loading = false,
  heat = [],
}) {
  if (hasMapsKey && !loading) {
    return (
      <LiveMap
        places={places}
        selectedId={selectedId}
        onSelect={onSelect}
        origin={origin}
        variant={variant}
      />
    );
  }

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

  useEffect(() => {
    let live = true;

    loadMaps().then(async (maps) => {
      if (!live || !host.current) return;

      const { AdvancedMarkerElement } = await maps.importLibrary("marker");

      map.current ??= new maps.Map(host.current, {
        mapId: MAP_ID,
        center: origin ?? { lat: 37.3352, lng: -121.8911 },
        zoom: 12,
        disableDefaultUI: true,
        gestureHandling: "greedy",
      });

      markers.current.forEach((m) => (m.map = null));
      markers.current = places.map((place) => {
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
      });

      const bounds = new maps.LatLngBounds();
      places.forEach((p) => bounds.extend({ lat: p.lat, lng: p.lng }));
      if (origin) bounds.extend(origin);
      if (places.length) map.current.fitBounds(bounds, 56);
    });

    return () => {
      live = false;
    };
  }, [places, selectedId, origin, variant, onSelect]);

  return <div className="mapgl" ref={host} />;
}
