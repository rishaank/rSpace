import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../lib/store";
import { AppBar, Device, DisplayChoice, Field, Ticks, displayForAge } from "../components/ui";

const BANDS = [
  { label: "Teen 13–17", age: 15 },
  { label: "Adult", age: 34 },
  { label: "65+", age: 68 },
];

// 05 · /onboarding/you — Name & age
export default function OnboardingYou() {
  const { profile, saveProfile } = useApp();
  const navigate = useNavigate();

  const [name, setName] = useState(profile?.name ?? "");
  const [age, setAge] = useState(profile?.age ? String(profile.age) : "");
  const [display, setDisplay] = useState({
    text_scale: profile?.text_scale ?? 1,
    simple_ui: profile?.simple_ui ?? false,
  });
  // Someone who has been through this screen before has already answered the
  // display question, so their age must not re-propose over that answer.
  const [chose, setChose] = useState(profile?.age != null);

  const initial = name.trim().charAt(0).toUpperCase() || "·";
  const numericAge = Number.parseInt(age, 10);
  const canContinue = name.trim().length > 0 && numericAge >= 13 && numericAge < 120;

  // This is what the age is for. Typing one proposes the display that usually
  // suits it; the controls below are the proposal, already made, and touching
  // any of them ends the proposing.
  useEffect(() => {
    if (!chose) setDisplay(displayForAge(numericAge));
  }, [numericAge, chose]);

  function band(entry) {
    if (!Number.isFinite(numericAge)) return false;
    if (entry.label === "Teen 13–17") return numericAge >= 13 && numericAge <= 17;
    if (entry.label === "65+") return numericAge >= 65;
    return numericAge >= 18 && numericAge < 65;
  }

  async function submit(event) {
    event.preventDefault();
    await saveProfile({ name: name.trim(), age: numericAge, ...display });
    navigate("/onboarding/place");
  }

  return (
    <Device>
      <AppBar title="About you" trail="II / IV" back={false} />
      <Ticks step={2} />

      <form className="scroll" onSubmit={submit} style={{ display: "flex", flexDirection: "column" }}>
        <div className="pad" style={{ paddingTop: 26 }}>
          <h2 className="display">
            What should we
            <br />
            call you?
          </h2>
          {/* This used to promise that age would "flag places with age limits
              or programs meant for you", which nothing in the app did. Age
              sets the display below, and that is all it does. */}
          <p className="prose" style={{ paddingTop: 11 }}>
            Your age sets how large the text is and how much detail each place shows &mdash; both
            of which you can change below. It&rsquo;s never shown publicly.
          </p>
        </div>

        <div className="pad" style={{ paddingTop: 28, display: "grid", gap: 24 }}>
          <Field
            label="First name"
            autoComplete="given-name"
            placeholder="Rosa"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ fontSize: 22 }}
          />

          <div>
            <Field
              label="Age"
              inputMode="numeric"
              placeholder="34"
              value={age}
              onChange={(e) => setAge(e.target.value.replace(/\D/g, "").slice(0, 3))}
              style={{ fontSize: 22 }}
            />
            <div className="chips" style={{ gap: 7, paddingTop: 10 }}>
              {BANDS.map((entry) => (
                <button
                  key={entry.label}
                  type="button"
                  className={`chip sm${band(entry) ? " on" : ""}`}
                  onClick={() => setAge(String(entry.age))}
                >
                  {entry.label}
                </button>
              ))}
            </div>
          </div>

          {Number.isFinite(numericAge) && numericAge >= 13 && (
            <div style={{ borderTop: "1px solid var(--hairline)", paddingTop: 18, display: "grid", gap: 14 }}>
              <div>
                <div className="display sm" style={{ fontSize: 22 }}>
                  How this should read
                </div>
                <p className="aside" style={{ fontSize: 15.5, paddingTop: 4 }}>
                  {chose ? "Your choice." : `Set from ${numericAge}. Change either one.`}
                </p>
              </div>
              <DisplayChoice
                value={display}
                onChange={(next) => {
                  setChose(true);
                  setDisplay(next);
                }}
              />
            </div>
          )}

          <div
            style={{
              borderTop: "1px solid var(--hairline)",
              paddingTop: 18,
              display: "flex",
              gap: 14,
              alignItems: "center",
            }}
          >
            <div
              style={{
                width: 64,
                height: 64,
                flex: "none",
                background: "var(--pale)",
                border: "1px solid var(--ink)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 24,
                color: "var(--moss)",
              }}
            >
              {initial}
            </div>
            <div className="grow">
              <div style={{ fontSize: 18 }}>Add a photo</div>
              <div className="aside" style={{ fontSize: 15.5 }}>
                Optional — you can do this later
              </div>
            </div>
          </div>
        </div>

        <div className="foot pad" style={{ padding: "16px 24px 34px" }}>
          <button type="submit" className="btn" disabled={!canContinue}>
            Continue
          </button>
        </div>
      </form>
    </Device>
  );
}
