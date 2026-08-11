import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listApplicants } from "../lib/data";
import { useApp } from "../lib/store";
import { Device, TabBar } from "../components/ui";
import MapCanvas from "../components/MapCanvas";
import { AdoptTabs } from "./Adopt";

// 20 · /adopt/map — Where to invest
export default function AdoptMap() {
  const { origin } = useApp();
  const [applicants, setApplicants] = useState([]);
  const [selectedId, setSelectedId] = useState(null);

  useEffect(() => {
    listApplicants().then((list) => {
      setApplicants([...list].sort((a, b) => b.need - a.need));
    });
  }, []);

  const selected = applicants.find((a) => a.id === selectedId) ?? applicants[0];
  const rest = applicants.filter((a) => a.id !== selected?.id);

  // Shaded areas: the higher the need score, the wider and darker the circle.
  const heat = applicants.map((a) => ({
    lat: a.lat,
    lng: a.lng,
    size: 60 + a.need,
    opacity: a.need / 320,
  }));

  return (
    <Device>
      <MapCanvas
        places={applicants}
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
            Shaded areas have the most people and the fewest free places to go.
          </p>
        </div>
        <AdoptTabs />
      </div>

      {selected && (
        <div className="sheet">
          <div className="pad" style={{ paddingTop: 14 }}>
            <div className="eyebrow clay" style={{ fontSize: 10.5 }}>
              Highest need · {selected.need}
            </div>
            <div className="display sm" style={{ fontSize: 24, paddingTop: 5 }}>
              {selected.name}
            </div>
            <p className="prose" style={{ fontSize: 16.5, paddingTop: 6 }}>
              {selected.summary}
            </p>
          </div>

          <div className="pad" style={{ paddingTop: 14 }}>
            {rest.map((a, i) => (
              <div
                key={a.id}
                className="spread"
                style={{ borderTop: "1px solid var(--hairline)", padding: "7px 0", fontSize: 16, color: "var(--text-3)" }}
              >
                <span>
                  {i === 0 ? "Second" : "Third"} · {a.neighborhood}
                </span>
                <span style={{ color: "var(--ink)" }}>{a.need}</span>
              </div>
            ))}
          </div>

          <div className="pad" style={{ padding: "14px 24px 16px" }}>
            <Link to={`/adopt/${selected.id}`} className="btn sm">
              See the application
            </Link>
          </div>

          <TabBar />
        </div>
      )}
    </Device>
  );
}
