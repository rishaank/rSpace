import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useApp } from "../lib/store";
import { Alarm, AppBar, Device, Field } from "../components/ui";

// 02 · /signup — Create account
export default function Signup() {
  const { signUp } = useApp();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(false);
  const [busy, setBusy] = useState(false);

  const longEnough = password.length >= 8;
  const hasNumber = /\d/.test(password);
  const matches = confirm.length > 0 && confirm === password;
  const canSubmit = email.includes("@") && longEnough && hasNumber && matches;

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    const result = await signUp(email.trim(), password);
    setBusy(false);
    if (result.error) setError(result.error);
    else if (result.pending) setPending(true);
    else navigate("/onboarding/you");
  }

  return (
    <Device>
      <AppBar title="Create account" trail="I / IV" onBack={() => navigate("/")} />

      <form className="scroll" onSubmit={submit} style={{ display: "flex", flexDirection: "column" }}>
        <div className="pad" style={{ paddingTop: 26 }}>
          <h2 className="display">
            Let&rsquo;s start with
            <br />
            an account.
          </h2>
          <p className="prose" style={{ paddingTop: 11 }}>
            Your saved places and priorities travel with you. We never post anything or share your
            address.
          </p>
        </div>

        {error && (
          <div className="pad" style={{ paddingTop: 20 }}>
            <Alarm title="Couldn't create the account">{error}</Alarm>
          </div>
        )}

        {pending && (
          <div className="pad" style={{ paddingTop: 20 }}>
            <div className="notice">
              Your account is created. Check {email} for a confirmation link, then{" "}
              <Link to="/login" style={{ fontStyle: "italic" }}>
                sign in
              </Link>
              .
            </div>
          </div>
        )}

        <div className="pad" style={{ paddingTop: 26, display: "grid", gap: 20 }}>
          <Field
            label="Email"
            type="email"
            autoComplete="email"
            inputMode="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <div>
            <Field
              label="Password"
              type={show ? "text" : "password"}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              adorn={
                <button type="button" onClick={() => setShow((s) => !s)}>
                  {show ? "Hide" : "Show"}
                </button>
              }
            />
            <div className="checks">
              <span className={longEnough ? "met" : ""}>{longEnough ? "✓" : "·"} 8+ characters</span>
              <span className={hasNumber ? "met" : ""}>{hasNumber ? "✓" : "·"} One number</span>
            </div>
          </div>

          <Field
            label="Confirm password"
            type={show ? "text" : "password"}
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            bad={confirm.length > 0 && !matches}
            hint={confirm.length > 0 && !matches ? "The two passwords don't match" : undefined}
          />
        </div>

        <div className="foot pad" style={{ padding: "16px 24px 34px", display: "grid", gap: 14 }}>
          <p className="prose" style={{ fontSize: 15, color: "var(--text-4)" }}>
            By continuing you agree to the community guidelines. You must be 13 or older to make an
            account.
          </p>
          <button type="submit" className="btn" disabled={!canSubmit || busy || pending}>
            {busy ? "Creating…" : pending ? "Waiting for confirmation" : "Continue"}
          </button>
        </div>
      </form>
    </Device>
  );
}
