import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../lib/store";
import { ALL_INTERESTS, INTEREST_GROUPS } from "../lib/seed";
import { AppBar, Chip, CustomInterest, Device } from "../components/ui";

// 08 · /onboarding/interests
export default function OnboardingInterests() {
  const { profile, saveProfile } = useApp();
  const navigate = useNavigate();
  const [picked, setPicked] = useState(profile?.interests ?? []);

  const custom = picked.filter((i) => !ALL_INTERESTS.includes(i));

  function toggle(item) {
    setPicked((prev) => (prev.includes(item) ? prev.filter((i) => i !== item) : [...prev, item]));
  }

  async function submit() {
    await saveProfile({ interests: picked });
    navigate("/onboarding/weights");
  }

  return (
    <Device>
      <AppBar title="Interests" trail="Optional" back={false} />

      <div className="scroll" style={{ display: "flex", flexDirection: "column" }}>
        <div className="pad" style={{ paddingTop: 24 }}>
          <h2 className="display">
            What would you
            <br />
            go out for?
          </h2>
          <p className="prose" style={{ paddingTop: 11 }}>
            Pick any number. Interests filter the map — they don&rsquo;t change a place&rsquo;s
            score. The map opens filtered to whatever you pick here, and you can turn that off
            under Filters.
          </p>
        </div>

        <div className="pad" style={{ paddingTop: 22, display: "grid", gap: 18 }}>
          {INTEREST_GROUPS.map((group) => (
            <div key={group.name} style={{ display: "grid", gap: 10 }}>
              <div className="section-head">{group.name}</div>
              <div className="chips">
                {group.items.map((item) => (
                  <Chip key={item} on={picked.includes(item)} onClick={() => toggle(item)}>
                    {item}
                  </Chip>
                ))}
              </div>
            </div>
          ))}

          {/* Anything the five groups above do not have a word for. The
              picked list can hold it whether or not it matches — what the
              field will not do is let it be added without saying so. */}
          <div style={{ borderTop: "1px solid var(--hairline)", paddingTop: 16 }}>
            <CustomInterest picked={picked} onAdd={(interest) => setPicked((p) => [...p, interest])} />
          </div>

          {/* Typed interests are not in any group, so they would otherwise
              vanish off the screen the moment they were added. */}
          {custom.length > 0 && (
            <div style={{ display: "grid", gap: 10 }}>
              <div className="section-head">Your own</div>
              <div className="chips">
                {custom.map((item) => (
                  <Chip key={item} on onClick={() => toggle(item)}>
                    {item}
                  </Chip>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="foot pad" style={{ padding: "16px 24px 34px", display: "grid", gap: 11 }}>
          <p className="aside" style={{ textAlign: "center" }}>
            {picked.length} selected
          </p>
          <button type="button" className="btn" onClick={submit}>
            Continue
          </button>
        </div>
      </div>
    </Device>
  );
}
