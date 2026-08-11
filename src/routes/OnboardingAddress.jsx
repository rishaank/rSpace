import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../lib/store";
import { hasMapsKey, resolveSuggestion, suggestAddresses } from "../lib/google";
import { NEIGHBORHOODS } from "../lib/seed";
import { Alarm, AppBar, Device, Field } from "../components/ui";

// Without a Maps key the same field matches against the seeded neighborhoods,
// so the flow still completes.
function localSuggestions(query) {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  return NEIGHBORHOODS.filter((n) => n.name.toLowerCase().includes(q)).map((n) => ({
    id: n.name,
    main: n.name,
    secondary: "San José, CA",
    point: n,
  }));
}

// 07 · /onboarding/place — Manual entry
export default function OnboardingAddress() {
  const { saveProfile } = useApp();
  const navigate = useNavigate();

  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [chosen, setChosen] = useState(null);

  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!hasMapsKey) return setSuggestions(localSuggestions(query));

    const timer = setTimeout(async () => {
      const found = await suggestAddresses(query);
      // Google unreachable or the query matched nothing — the seeded
      // neighborhoods still get the profiler finished.
      setSuggestions(found.length ? found : localSuggestions(query));
    }, 220);

    return () => clearTimeout(timer);
  }, [query]);

  async function confirm() {
    if (!chosen) return;
    setBusy(true);
    setFailed(false);

    // The full address is used once, to place the origin, then discarded.
    const point = chosen.point
      ? { lat: chosen.point.lat, lng: chosen.point.lng, location: `${chosen.main}, San José` }
      : await resolveSuggestion(chosen);

    if (!point) {
      setBusy(false);
      return setFailed(true);
    }

    await saveProfile({
      location: point.location ?? `${chosen.main}, San José`,
      lat: point.lat,
      lng: point.lng,
    });
    navigate("/onboarding/interests");
  }

  return (
    <Device>
      <AppBar title="Enter an address" />

      <div className="scroll" style={{ display: "flex", flexDirection: "column" }}>
        <div className="pad" style={{ paddingTop: 24 }}>
          <Field
            label="Address, cross street, or ZIP"
            placeholder="1250 Lincoln Ave"
            value={query}
            autoFocus
            onChange={(e) => {
              setQuery(e.target.value);
              setChosen(null);
            }}
            style={{ fontSize: 21 }}
          />
        </div>

        {suggestions.length > 0 && (
          <div className="pad" style={{ paddingTop: 20 }}>
            <div className="section-head">
              Suggestions {hasMapsKey ? "· Google Places" : "· San José neighborhoods"}
            </div>
            {suggestions.map((s) => (
              <button
                key={s.id}
                type="button"
                className="placerow"
                style={{ padding: "12px 0", display: "block" }}
                onClick={() => {
                  setChosen(s);
                  setQuery(s.main);
                }}
              >
                <div style={{ fontSize: 19.5, color: "var(--ink)" }}>{s.main}</div>
                <div className="aside" style={{ fontSize: 15.5 }}>
                  {s.secondary}
                </div>
              </button>
            ))}
          </div>
        )}

        <div className="pad" style={{ paddingTop: 22 }}>
          {failed ? (
            <Alarm title="Couldn't place that address">
              We reached Google but couldn&rsquo;t pin that result. Pick another suggestion, or go
              back and choose a neighborhood.
            </Alarm>
          ) : (
            <div className="notice">
              We keep only the neighborhood on your profile. The full address is used once, to
              measure distances, and then discarded.
            </div>
          )}
        </div>

        <div className="foot pad" style={{ padding: "16px 24px 34px" }}>
          <button type="button" className="btn" disabled={!chosen || busy} onClick={confirm}>
            {busy ? "Locating…" : "Confirm address"}
          </button>
        </div>
      </div>
    </Device>
  );
}
