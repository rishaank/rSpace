import { Link } from "react-router-dom";
import { useApp } from "../lib/store";
import { Device } from "../components/ui";
import { formatCost, formatMiles } from "../lib/scoring";

// 10 · /onboarding/done — Handoff
export default function OnboardingDone() {
  const { profile, ranked, places } = useApp();
  const top = ranked.slice(0, 3);

  return (
    <Device tone="pale">
      <div className="scroll" style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "60px 28px 0" }}>
          <div
            style={{
              width: 56,
              height: 56,
              background: "var(--pine)",
              color: "var(--paper)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 26,
            }}
            aria-hidden="true"
          >
            ✓
          </div>
          <h2 className="display" style={{ fontSize: 40, paddingTop: 24 }}>
            You&rsquo;re set,
            <br />
            {profile.name}.
          </h2>
          <p className="prose lg" style={{ paddingTop: 14, color: "var(--text-2)" }}>
            We scored {places.length} public places against your priorities. Here&rsquo;s what came
            out on top.
          </p>
        </div>

        <div style={{ padding: "30px 28px 0" }}>
          <div className="section-head">Your top three</div>
          {top.map((place) => (
            <Link
              key={place.id}
              to={`/place/${place.id}`}
              className="placerow"
              style={{ borderBottomColor: "#cdd3c0", padding: "13px 0", alignItems: "baseline" }}
            >
              <div className="n" style={{ fontSize: 26 }}>
                {place.total}
              </div>
              <div className="grow">
                <div style={{ fontSize: 19.5 }}>{place.name}</div>
                <div className="meta">
                  {formatMiles(place.miles)} · {formatCost(place).toLowerCase()}
                </div>
              </div>
            </Link>
          ))}
        </div>

        <div className="foot" style={{ padding: "16px 28px 36px" }}>
          <Link to="/map" className="btn">
            Open the map
          </Link>
        </div>
      </div>
    </Device>
  );
}
