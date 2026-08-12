import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listNeeds } from "../lib/data";
import { describeNeed } from "../lib/describe";
import { useApp } from "../lib/store";
import { Device, RankedList, SheetNav, TabBar } from "../components/ui";
import MapCanvas from "../components/MapCanvas";

// 20 · /adopt — Where to invest
export default function AdoptMap() {
  const { origin } = useApp();
  const [needs, setNeeds] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [list, setList] = useState(false);

  useEffect(() => {
    listNeeds().then(setNeeds);
  }, []);

  // The city assesses far more sites than a 390pt map can label — the top 40
  // pinned at once stacked into an unreadable pile over East San José. The
  // shading below still covers all of them, so the pins mark the worst dozen
  // and the heat carries the rest.
  const pinned = needs.slice(0, 12);
  const selected = needs.find((n) => n.id === selectedId) ?? needs[0];
  const at = needs.findIndex((n) => n.id === selected?.id);

  // A site picked out of the full list can sit below the pinned dozen, so pin
  // that one too — otherwise the sheet names a place the map isn't marking.
  const marks = !selected || pinned.includes(selected) ? pinned : [...pinned, selected];

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
        places={marks}
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

      {selected && list && (
        <div className="sheet inline">
          <div
            style={{
              padding: "14px 24px 10px",
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              gap: 12,
              borderBottom: "2px solid var(--ink)",
            }}
          >
            <div className="display sm" style={{ fontSize: 24 }}>
              All {needs.length} sites
            </div>
            <button type="button" className="sheetopen" onClick={() => setList(false)}>
              Done
            </button>
          </div>

          <RankedList
            places={needs}
            currentId={selected.id}
            onPick={(id) => {
              setSelectedId(id);
              setList(false);
            }}
            meta={(site) => [site.neighborhood, site.category].filter(Boolean).join(" · ")}
            need
          />

          <TabBar />
        </div>
      )}

      {selected && !list && (
        <div className="sheet">
          <SheetNav
            index={at}
            count={needs.length}
            onStep={(step) => setSelectedId(needs[at + step].id)}
            onOpenList={() => setList(true)}
            listLabel="All sites"
          />

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

