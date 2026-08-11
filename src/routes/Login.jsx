import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useApp } from "../lib/store";
import { Alarm, AppBar, Device, Field } from "../components/ui";

const LOCKOUT_AFTER = 5;

// 03 · /login — Sign in   ·   04 · /login — Wrong credentials
export default function Login() {
  const { signIn } = useApp();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [attempts, setAttempts] = useState(0);
  const [busy, setBusy] = useState(false);

  const left = LOCKOUT_AFTER - attempts;

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    const result = await signIn(email.trim(), password);
    setBusy(false);
    if (result.error) {
      setAttempts((n) => n + 1);
      setError(result.error);
    } else {
      navigate("/map");
    }
  }

  return (
    <Device>
      <AppBar title="Sign in" onBack={() => navigate("/")} />

      <form className="scroll" onSubmit={submit} style={{ display: "flex", flexDirection: "column" }}>
        <div className="pad" style={{ paddingTop: 30 }}>
          <h2 className="display">Welcome back.</h2>
        </div>

        {error && (
          <div className="pad" style={{ paddingTop: 20 }}>
            <Alarm title="Couldn't sign in">{error}</Alarm>
          </div>
        )}

        <div className="pad" style={{ paddingTop: error ? 22 : 28, display: "grid", gap: 22 }}>
          <Field
            label="Email"
            type="email"
            autoComplete="email"
            inputMode="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Field
            label="Password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            bad={Boolean(error)}
            hint={
              error && left > 0 && left <= 3
                ? `${left} attempts left before a short lockout`
                : undefined
            }
          />
          <button type="button" className="linkbtn">
            {error ? "Email me a reset link" : "Forgot your password?"}
          </button>
        </div>

        <div className="foot pad" style={{ padding: "16px 24px 34px", display: "grid", gap: 12 }}>
          <button type="submit" className="btn" disabled={busy || !email || !password}>
            {error ? "Try again" : "Sign in"}
          </button>
          {!error && (
            <p className="prose" style={{ textAlign: "center" }}>
              New here?{" "}
              <Link to="/signup" style={{ fontStyle: "italic" }}>
                Create an account
              </Link>
            </p>
          )}
        </div>
      </form>
    </Device>
  );
}
