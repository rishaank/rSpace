import { Link } from "react-router-dom";
import { useApp } from "../lib/store";
import { FACTORS, normalisedWeights, orderForWeights } from "../lib/scoring";
import { Device, Meter, TabBar } from "../components/ui";

// 15 · /profile
export default function Profile() {
  const { profile, weights, favorites, ranked } = useApp();
  const shown = normalisedWeights(weights);
  const regulars = ranked.filter((p) => favorites.includes(p.id)).slice(0, 3);

  return (
    <Device>
      <div className="scroll" style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ background: "var(--pine)", padding: "20px 24px 22px", flex: "none" }}>
          <div className="row" style={{ gap: 16 }}>
            <div
              style={{
                width: 74,
                height: 74,
                flex: "none",
                background: "var(--pale)",
                border: "1px solid var(--ink)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 30,
                color: "var(--pine)",
              }}
            >
              {profile.name.charAt(0).toUpperCase()}
            </div>
            <div className="grow">
              <div style={{ fontWeight: 500, fontSize: 31, lineHeight: 1.1, letterSpacing: "-.02em", color: "var(--paper)" }}>
                {profile.name}
              </div>
              <div className="meta" style={{ color: "var(--sage)", display: "block", paddingTop: 6 }}>
                {profile.age} · {profile.location}
              </div>
            </div>
          </div>

          <div className="chips" style={{ paddingTop: 16 }}>
            {(profile.interests ?? []).map((interest) => (
              <span key={interest} className="chip on-dark">
                {interest}
              </span>
            ))}
            <Link to="/profile/edit" className="chip on-dark dashed" style={{ textDecoration: "none" }}>
              + Add
            </Link>
          </div>
        </div>

        <div className="pad" style={{ paddingTop: 20 }}>
          <div className="section-head">Your priorities</div>
          {/* Listed in the order they were ranked, so this reads back the
              same way it was set. */}
          {orderForWeights(weights).map((key, i) => (
            <Meter
              key={key}
              name={`${i + 1}. ${FACTORS.find((f) => f.key === key).short}`}
              value={Math.min(shown[key] * 2, 1)}
              text={`${Math.round(shown[key] * 100)}%`}
              thin
            />
          ))}
          <div style={{ paddingTop: 12 }}>
            <Link to="/profile/weights" className="btn xs ghost">
              Re-tune priorities
            </Link>
          </div>
        </div>

        <div className="pad" style={{ paddingTop: 20 }}>
          <div className="section-head">Saved places</div>
          {regulars.length ? (
            regulars.map((place) => (
              <Link key={place.id} to={`/place/${place.id}`} className="rowlink" style={{ fontSize: 18 }}>
                <span>{place.name}</span>
                <span className="chev">›</span>
              </Link>
            ))
          ) : (
            <p className="aside" style={{ padding: "12px 0" }}>
              Save a place and it shows up here.
            </p>
          )}
        </div>

        <div className="foot pad" style={{ padding: "20px 24px 20px" }}>
          <Link to="/profile/edit" className="btn xs ghost">
            Edit profile
          </Link>
        </div>
      </div>

      <TabBar />
    </Device>
  );
}
