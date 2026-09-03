import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";

import { MoteMark } from "../components/Icons.js";
import { useAuth } from "../hooks/useAuth.js";
import { friendlyError } from "../lib/errors.js";

export function LoginPage() {
  const { user, ready, configured, signIn } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (ready && user) {
    return <Navigate to="/" replace />;
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(username, password);
    } catch (cause) {
      setError(friendlyError(cause, "Could not sign in."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-page">
      <form className="login-card" onSubmit={(event) => void onSubmit(event)}>
        <div className="sidebar-brand" style={{ padding: "0 0 8px" }}>
          <MoteMark />
          <span>Mote Relay</span>
        </div>
        <p>Administrator</p>
        {!configured ? (
          <div className="notice">
            No administrator configured. Create one using the Mote Relay CLI.
          </div>
        ) : null}
        <div className="field">
          <label htmlFor="username">Username</label>
          <input
            id="username"
            name="username"
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </div>
        {error ? (
          <p className="field-error" role="alert">
            {error}
          </p>
        ) : null}
        <button type="submit" className="btn btn-primary" disabled={busy}>
          Sign In
        </button>
        <p style={{ marginTop: 16, textAlign: "center", fontSize: 12 }}>
          relay.yanze.me
        </p>
      </form>
    </main>
  );
}
