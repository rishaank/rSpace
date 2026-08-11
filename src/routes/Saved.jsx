import { Link } from "react-router-dom";
import { useApp } from "../lib/store";
import { formatMiles } from "../lib/scoring";
import { Device, SaveButton, TabBar } from "../components/ui";

// 14 · /saved — Favorites   ·   24 · /saved — Nothing saved yet
export default function Saved() {
  const { ranked, favorites, toggleFavorite } = useApp();
  const saved = ranked.filter((p) => favorites.includes(p.id));

  return (
    <Device>
      <div className="pad" style={{ padding: "8px 24px 10px", borderBottom: "2px solid var(--ink)", flex: "none" }}>
        <div className="display" style={{ fontSize: 30 }}>
          Saved places
        </div>
        {saved.length > 0 && (
          <div className="meta" style={{ display: "block", paddingTop: 4, color: "var(--label)" }}>
            {saved.length} saved · sorted by score
          </div>
        )}
      </div>

      <div className="scroll">
        {saved.length > 0 ? (
          <>
            <div className="pad">
              {saved.map((place) => (
                <div key={place.id} className="placerow" style={{ cursor: "default" }}>
                  <div className="n">{place.total}</div>
                  <Link to={`/place/${place.id}`} className="grow" style={{ textDecoration: "none", color: "inherit" }}>
                    <div className="title">{place.name}</div>
                    <div className="meta" style={{ display: "block", paddingTop: 4 }}>
                      {place.category} · {formatMiles(place.miles)} ·{" "}
                      {place.price_level === 0 ? "free" : "paid"}
                    </div>
                  </Link>
                  <SaveButton
                    saved
                    bare
                    onClick={() => toggleFavorite(place.id)}
                    label={`Remove ${place.name} from saved`}
                  />
                </div>
              ))}
            </div>

            <div className="pad" style={{ paddingTop: 20 }}>
              <div className="notice">
                Saved places show up on your profile as the activities you keep coming back to.
              </div>
            </div>
          </>
        ) : (
          <>
            <div style={{ padding: "56px 30px 0", display: "grid", gap: 16, justifyItems: "start" }}>
              <div style={{ width: 52, height: 2, background: "var(--ink)" }} />
              <h2 className="display md">Nothing saved yet.</h2>
              <p className="prose" style={{ fontSize: 17.5, color: "var(--text-2)" }}>
                Tap the heart on any place and it lands here, sorted by how well it matches your
                priorities. Saved places also show on your profile.
              </p>
              <Link to="/map" className="btn sm" style={{ marginTop: 8 }}>
                Browse the map
              </Link>
            </div>

            <div style={{ padding: "36px 30px 0" }}>
              <div className="section-head">Popular this week</div>
              {ranked.slice(0, 2).map((place) => (
                <Link
                  key={place.id}
                  to={`/place/${place.id}`}
                  className="placerow"
                  style={{ alignItems: "baseline", padding: "12px 0" }}
                >
                  <div className="n" style={{ fontSize: 24, width: 40 }}>
                    {place.total}
                  </div>
                  <div className="grow" style={{ fontSize: 19 }}>
                    {place.name}
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>

      <TabBar />
    </Device>
  );
}
