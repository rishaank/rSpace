import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../lib/store";
import { hasMapsKey, resolveSuggestion, suggestAddresses } from "../lib/google";
import { lookupPlaces, looksLikeZip } from "../lib/geography";
import { Alarm, AppBar, Device, Field } from "../components/ui";

// 07 · /onboarding/place — Manual entry
export default function OnboardingAddress() {
  const { saveProfile } = useApp();
  const navigate = useNavigate();

  const [query, setQuery] = useState("");
  const [remote, setRemote] = useState([]);
  const [searching, setSearching] = useState(false);
  const [chosen, setChosen] = useState(null);

  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  // ZIPs and town names are answered from the generated Census table, in a
  // keystroke and with no request at all. Everything else — a street address,
  // a cross street — is what Google is actually better at, and the two lists
  // are shown together rather than one replacing the other.
  const local = lookupPlaces(query);
  const zipTyped = looksLikeZip(query);

  useEffect(() => {
    // A ZIP is already answered, exactly, by the table. Asking Places to
    // autocomplete "9511" as well would spend a session on a worse answer.
    if (!hasMapsKey || zipTyped || query.trim().length < 3) {
      setRemote([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    const timer = setTimeout(async () => {
      const found = await suggestAddresses(query);
      setRemote(found);
      setSearching(false);
    }, 220);

    return () => clearTimeout(timer);
  }, [query, zipTyped]);

  // Local first: it is exact, and it is the half that works when Google does
  // not. Duplicates are dropped on the visible name so "Mountain View" does
  // not appear once from each source.
  const seen = new Set(local.map((s) => s.main.toLowerCase()));
  const suggestions = [...local, ...remote.filter((s) => !seen.has(s.main.toLowerCase()))];

  async function confirm() {
    if (!chosen) return;
    setBusy(true);
    setFailed(false);

    // The full address is used once, to place the origin, then discarded. A
    // local suggestion already carries its point, so confirming one costs
    // nothing and cannot fail.
    const point = chosen.point
      ? { lat: chosen.point.lat, lng: chosen.point.lng, location: chosen.location }
      : await resolveSuggestion(chosen);

    if (!point) {
      setBusy(false);
      return setFailed(true);
    }

    await saveProfile({
      location: point.location ?? chosen.main,
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
            label="Address, ZIP, or town"
            placeholder="95125, Mountain View, 1250 Lincoln Ave"
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
              <span>Suggestions</span>
              <span>{searching ? "Searching…" : `${suggestions.length} found`}</span>
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
              We reached Google but couldn&rsquo;t pin that result. Try your ZIP or your town
              instead — those are answered from a stored table and always work.
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
