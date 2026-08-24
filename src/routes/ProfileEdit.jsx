import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../lib/store";
import { ALL_INTERESTS } from "../lib/seed";
import { AppBar, CustomInterest, Device, DisplayChoice, Field } from "../components/ui";

// 16 · /profile/edit
export default function ProfileEdit() {
  const { profile, saveProfile, signOut, deleteAccount } = useApp();
  const navigate = useNavigate();

  const [name, setName] = useState(profile.name);
  const [age, setAge] = useState(String(profile.age ?? ""));
  const [interests, setInterests] = useState(profile.interests ?? []);
  const [display, setDisplay] = useState({
    text_scale: profile.text_scale ?? 1,
    simple_ui: profile.simple_ui ?? false,
  });
  const [adding, setAdding] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const unpicked = ALL_INTERESTS.filter((i) => !interests.includes(i));

  async function save() {
    await saveProfile({ name: name.trim(), age: Number.parseInt(age, 10), interests, ...display });
    navigate("/profile");
  }

  return (
    <Device>
      <AppBar
        title="Edit profile"
        trail={
          <button type="button" className="linkbtn" style={{ font: "inherit", color: "inherit" }} onClick={save}>
            Save
          </button>
        }
      />

      <div className="scroll" style={{ display: "flex", flexDirection: "column" }}>
        <div
          className="pad"
          style={{ padding: "22px 24px 20px", display: "flex", gap: 16, alignItems: "center", borderBottom: "1px solid var(--hairline)" }}
        >
          <div
            style={{
              width: 78,
              height: 78,
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
            {name.charAt(0).toUpperCase() || "·"}
          </div>
          <div className="grow" style={{ display: "grid", gap: 8 }}>
            <button type="button" className="btn xs ghost" style={{ height: 40 }}>
              Replace photo
            </button>
            <button type="button" className="linkbtn clay" style={{ fontSize: 15.5 }}>
              Remove
            </button>
          </div>
        </div>

        <div className="pad" style={{ paddingTop: 20, display: "grid", gap: 20 }}>
          <Field label="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <Field
            label="Age"
            inputMode="numeric"
            value={age}
            onChange={(e) => setAge(e.target.value.replace(/\D/g, "").slice(0, 3))}
          />

          <div className="field">
            <label htmlFor="hood">Neighborhood</label>
            <div className="adorn">
              <input id="hood" value={profile.location} readOnly />
              <button type="button" onClick={() => navigate("/onboarding/place")}>
                Change
              </button>
            </div>
          </div>

          <div style={{ display: "grid", gap: 10 }}>
            <div className="eyebrow">Interests</div>
            <div className="chips">
              {interests.map((interest) => (
                <button
                  key={interest}
                  type="button"
                  className="chip on"
                  style={{ padding: "7px 13px", fontSize: 16.5 }}
                  onClick={() => setInterests((prev) => prev.filter((i) => i !== interest))}
                >
                  {interest} ×
                </button>
              ))}
              <button
                type="button"
                className="chip dashed"
                style={{ padding: "7px 13px", fontSize: 16.5 }}
                onClick={() => setAdding((a) => !a)}
              >
                + Add interest
              </button>
            </div>

            {adding && (
              <div style={{ display: "grid", gap: 14, paddingTop: 4 }}>
                <div className="chips">
                  {unpicked.map((interest) => (
                    <button
                      key={interest}
                      type="button"
                      className="chip"
                      style={{ padding: "7px 13px", fontSize: 16.5 }}
                      onClick={() => {
                        setInterests((prev) => [...prev, interest]);
                        setAdding(false);
                      }}
                    >
                      {interest}
                    </button>
                  ))}
                </div>
                <CustomInterest
                  picked={interests}
                  onAdd={(interest) => {
                    setInterests((prev) => [...prev, interest]);
                    setAdding(false);
                  }}
                />
              </div>
            )}
          </div>

          {/* The profiler proposed these from the age above. This is where
              that proposal is overruled, and it takes effect on Save. */}
          <div style={{ borderTop: "1px solid var(--hairline)", paddingTop: 18 }}>
            <div className="section-head" style={{ marginBottom: 14 }}>
              Display
            </div>
            <DisplayChoice value={display} onChange={setDisplay} />
          </div>
        </div>

        <div className="foot pad" style={{ padding: "16px 24px 32px", display: "grid", gap: 12 }}>
          <button
            type="button"
            className="btn xs ghost"
            onClick={async () => {
              await signOut();
              navigate("/");
            }}
          >
            Sign out
          </button>

          {confirmDelete ? (
            <div className="alarm">
              <div className="eyebrow clay">This can&rsquo;t be undone</div>
              <p>Your profile, saved places, and priorities are deleted immediately.</p>
              <div style={{ display: "flex", gap: 10, paddingTop: 8 }}>
                <button
                  type="button"
                  className="btn xs"
                  style={{ background: "var(--clay)" }}
                  onClick={async () => {
                    await deleteAccount();
                    navigate("/");
                  }}
                >
                  Delete everything
                </button>
                <button type="button" className="btn xs ghost" onClick={() => setConfirmDelete(false)}>
                  Keep it
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className="btn xs ghost clay" onClick={() => setConfirmDelete(true)}>
              Delete my account
            </button>
          )}
        </div>
      </div>
    </Device>
  );
}
