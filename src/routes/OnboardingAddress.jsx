import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../lib/store";
import { hasMapsKey, resolveSuggestion, suggestAddresses } from "../lib/google";
import { NEIGHBORHOODS } from "../lib/seed";
import { AppBar, Device, Field } from "../components/ui";

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

  useEffect(() => {
    if (!hasMapsKey) return setSuggestions(localSuggestions(query));

    const timer = setTimeout(() => {
      suggestAddresses(query).then(setSuggestions);
    }, 220);
    return () => clearTimeout(timer);
  }, [query]);

  async function confirm() {
    if (!chosen) return;

    // The full address is used once, to place the origin, then discarded.
    const point = chosen.point
      ? { lat: chosen.point.lat, lng: chosen.point.lng, location: `${chosen.main}, San José` }
      : await resolveSuggestion(chosen.id);

    await saveProfile({ location: point.location, lat: point.lat, lng: point.lng });
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
          <div className="notice">
            We keep only the neighborhood on your profile. The full address is used once, to measure
            distances, and then discarded.
          </div>
        </div>

        <div className="foot pad" style={{ padding: "16px 24px 34px" }}>
          <button type="button" className="btn" disabled={!chosen} onClick={confirm}>
            Confirm address
          </button>
        </div>
      </div>
    </Device>
  );
}
