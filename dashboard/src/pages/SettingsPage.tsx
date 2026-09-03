import { useEffect, useState, type FormEvent } from "react";

import { changePassword } from "../api/auth.js";
import { getSystem } from "../api/system.js";
import { ConfirmDialog } from "../components/ConfirmDialog.js";
import { LoadingState } from "../components/LoadingState.js";
import { Section } from "../components/Section.js";
import { TopBar } from "../components/TopBar.js";
import { useAuth } from "../hooks/useAuth.js";
import { friendlyError } from "../lib/errors.js";
import { formatUptime } from "../lib/format.js";
import type { SystemResponse } from "../types/activity.js";

export function SettingsPage() {
  const { user, signOut } = useAuth();
  const [system, setSystem] = useState<SystemResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [changing, setChanging] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false);

  useEffect(() => {
    void getSystem()
      .then(setSystem)
      .catch((cause: unknown) =>
        setError(friendlyError(cause, "Could not load settings.")),
      );
  }, []);

  async function onChangePassword(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await changePassword(currentPassword, newPassword);
      setChanging(false);
      setCurrentPassword("");
      setNewPassword("");
    } catch (cause) {
      setError(friendlyError(cause, "Could not change the password."));
    } finally {
      setBusy(false);
    }
  }

  if (system === null && error === null) {
    return <LoadingState />;
  }

  return (
    <>
      <TopBar title="Settings" />
      {error ? (
        <div className="error-state panel" style={{ marginBottom: 20 }}>
          <span>{error}</span>
        </div>
      ) : null}
      {system ? (
        <Section title="Relay">
          <div className="panel">
            <div className="row">
              <span className="row-label">Public URL</span>
              <span>{system.public_url}</span>
            </div>
            <div className="row">
              <span className="row-label">Protocol</span>
              <span>Mote Protocol v{system.protocol_version}</span>
            </div>
            <div className="row">
              <span className="row-label">Environment</span>
              <span style={{ textTransform: "capitalize" }}>
                {system.environment}
              </span>
            </div>
            <div className="row">
              <span className="row-label">Database</span>
              <span>SQLite</span>
            </div>
            <div className="row">
              <span className="row-label">Command TTL</span>
              <span>{system.command_ttl_ms / 1000} seconds</span>
            </div>
            <div className="row">
              <span className="row-label">Heartbeat stale threshold</span>
              <span>{system.heartbeat_stale_ms / 1000} seconds</span>
            </div>
            <div className="row">
              <span className="row-label">Uptime</span>
              <span>{formatUptime(system.uptime_ms)}</span>
            </div>
          </div>
        </Section>
      ) : null}
      <Section title="Administrator">
        <div className="panel">
          <div className="row">
            <span className="row-label">Username</span>
            <span>{user?.username ?? "—"}</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button
            type="button"
            className="btn"
            onClick={() => setChanging(true)}
          >
            Change Password
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => setConfirmSignOut(true)}
          >
            Sign Out
          </button>
        </div>
        <p className="topbar-sub" style={{ marginTop: 16 }}>
          Password recovery is not available in the Dashboard. Use the Relay CLI
          on the server:
          <br />
          <span className="mono">
            docker compose exec relay node dist/cli.js admin password --username{" "}
            {user?.username ?? "admin"}
          </span>
        </p>
      </Section>
      {changing ? (
        <div className="dialog-backdrop">
          <form
            className="dialog"
            onSubmit={(event) => void onChangePassword(event)}
          >
            <h2>Change Password</h2>
            <div className="field" style={{ marginTop: 16 }}>
              <label htmlFor="current-password">Current password</label>
              <input
                id="current-password"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                required
              />
            </div>
            <div className="field" style={{ marginTop: 12 }}>
              <label htmlFor="new-password">New password</label>
              <input
                id="new-password"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                required
                minLength={12}
              />
            </div>
            <div className="dialog-actions">
              <button
                type="button"
                className="btn"
                onClick={() => setChanging(false)}
                disabled={busy}
              >
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={busy}>
                Change Password
              </button>
            </div>
          </form>
        </div>
      ) : null}
      {confirmSignOut ? (
        <ConfirmDialog
          title="Sign out?"
          description="This ends the current Dashboard session."
          confirmLabel="Sign Out"
          onCancel={() => setConfirmSignOut(false)}
          onConfirm={() => {
            void signOut();
          }}
        />
      ) : null}
    </>
  );
}
