import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listNeeds } from "../lib/data";
import { describeNeed } from "../lib/describe";
import { useApp } from "../lib/store";
import { Device, TabBar } from "../components/ui";
import MapCanvas from "../components/MapCanvas";

// 20 · /adopt — Where to invest
export default function AdoptMap() {
  const { origin } = useApp();
  const [needs, setNeeds] = useState([]);
  const [selectedId, setSelectedId] = useState(null);

  useEffect(() => {
    listNeeds().then(setNeeds);
  }, []);

  // The city assesses far more sites than a 390pt map can label — the top 40
  // pinned at once stacked into an unreadable pile over East San José. The
  // shading below still covers all of them, so the pins mark the worst dozen
  // and the heat carries the rest.
  const pinned = needs.slice(0, 12);
  const selected = needs.find((n) => n.id === selectedId) ?? needs[0];

  // Shaded areas: the higher the need score, the wider and darker the circle.
  const heat = needs.map((n) => ({
    lat: n.lat,
    lng: n.lng,
    size: 60 + n.need,
    opacity: n.need / 320,
  }));

  return (
    <Device>
      <MapCanvas
        places={pinned}
        selectedId={selected?.id}
        onSelect={setSelectedId}
        origin={origin}
        variant="need"
        heat={heat}
      />

      <div className="mapheader">
        <div className="pad" style={{ padding: "8px 24px 10px", borderBottom: "2px solid var(--ink)" }}>
          <div className="display sm" style={{ fontSize: 27 }}>
            Where to invest
          </div>
          <p className="prose" style={{ fontSize: 16, lineHeight: 1.4, paddingTop: 5 }}>
            Places the city&rsquo;s own condition survey scored poorly, in the neighborhoods its
            Equity Index ranks highest.
          </p>
        </div>
      </div>

      {selected && (
        <div className="sheet">
          <div style={{ padding: "14px 24px 0", display: "flex", gap: 14, alignItems: "flex-start" }}>
            <div className="grow">
              <div className="display sm" style={{ fontSize: 24 }}>
                {selected.name}
              </div>
              <div className="meta" style={{ display: "block", paddingTop: 5 }}>
                {[selected.neighborhood, selected.category].filter(Boolean).join(" · ")}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div className="score" style={{ fontSize: 38, lineHeight: 0.9, color: "var(--clay)" }}>
                {selected.need}
              </div>
              <div className="eyebrow">need</div>
            </div>
          </div>

          <div className="pad" style={{ paddingTop: 12 }}>
            <p className="prose" style={{ fontSize: 16.5 }}>
              {describeNeed(selected)}
            </p>
          </div>

          <div className="pad" style={{ padding: "14px 24px 16px" }}>
            <Link to={`/adopt/${selected.id}`} className="btn sm">
              See the numbers
            </Link>
          </div>

          <TabBar />
        </div>
      )}
    </Device>
  );
}

