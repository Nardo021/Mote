import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import {
  disableDevice,
  enableDevice,
  getDevice,
  lockDevice,
  rotateDeviceCredential,
} from "../api/devices.js";
import { ConfirmDialog } from "../components/ConfirmDialog.js";
import { LoadingState } from "../components/LoadingState.js";
import { SecretDialog } from "../components/SecretDialog.js";
import { Section } from "../components/Section.js";
import { DeviceStatusBadge } from "../components/StatusBadge.js";
import { TopBar } from "../components/TopBar.js";
import { usePolling } from "../hooks/usePolling.js";
import { friendlyError } from "../lib/errors.js";
import {
  formatAbsoluteTime,
  formatDuration,
  formatRelativeTime,
  shortenId,
  titleCaseAction,
  titleCaseStatus,
} from "../lib/format.js";
import type { AdminDevice } from "../types/device.js";

type Pending = "lock" | "rotate" | "disable" | null;

export function DeviceDetailPage() {
  const { id } = useParams();
  const [device, setDevice] = useState<AdminDevice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  const [busy, setBusy] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (id === undefined) {
      return;
    }
    try {
      setDevice(await getDevice(id));
      setError(null);
    } catch (cause) {
      setError(friendlyError(cause, "Could not load device."));
    }
  }, [id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);
  usePolling(refresh, 5_000, device !== null);

  if (device === null && error === null) {
    return <LoadingState />;
  }

  if (device === null) {
    return (
      <div className="error-state panel">
        <span>{error ?? "Device not found."}</span>
        <button type="button" className="btn" onClick={() => void refresh()}>
          Retry
        </button>
      </div>
    );
  }

  const current = device;

  async function runEnable() {
    setBusy(true);
    try {
      setDevice(await enableDevice(current.id));
    } catch (cause) {
      setError(friendlyError(cause, "Could not enable the device."));
    } finally {
      setBusy(false);
    }
  }

  async function runAction(action: Exclude<Pending, null>) {
    setBusy(true);
    try {
      if (action === "lock") {
        await lockDevice(current.id);
      } else if (action === "rotate") {
        const rotated = await rotateDeviceCredential(current.id);
        setSecret(rotated.credential);
      } else {
        setDevice(await disableDevice(current.id));
      }
      setPending(null);
      await refresh();
    } catch (cause) {
      setError(friendlyError(cause, "Could not complete that action."));
      setPending(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <TopBar
        title={current.name}
        subtitle={<Link to="/devices">Devices</Link>}
        action={<DeviceStatusBadge device={current} />}
      />
      <Section title="Device">
        <div className="panel">
          <div className="row">
            <span className="row-label">Device ID</span>
            <span className="mono" title={device.id}>
              {shortenId(device.id)}
            </span>
          </div>
          <div className="row">
            <span className="row-label">Status</span>
            <DeviceStatusBadge device={device} />
          </div>
          <div className="row">
            <span className="row-label">Last Seen</span>
            <span>{formatRelativeTime(device.last_seen_at)}</span>
          </div>
          <div className="row">
            <span className="row-label">Connected Since</span>
            <span>
              {device.online ? formatAbsoluteTime(device.connected_at) : "—"}
            </span>
          </div>
        </div>
      </Section>
      <Section title="Relay">
        <div className="panel">
          <div className="row">
            <span className="row-label">Connection</span>
            <span>{device.online ? "WebSocket" : "—"}</span>
          </div>
          <div className="row">
            <span className="row-label">Last Heartbeat</span>
            <span>
              {device.online
                ? formatRelativeTime(device.last_heartbeat_at)
                : "—"}
            </span>
          </div>
        </div>
      </Section>
      <Section title="Last Command">
        <div className="panel">
          <div className="row">
            <span className="row-label">Action</span>
            <span>
              {device.last_command
                ? titleCaseAction(device.last_command.action)
                : "—"}
            </span>
          </div>
          <div className="row">
            <span className="row-label">Status</span>
            <span>
              {device.last_command
                ? titleCaseStatus(device.last_command.status)
                : "—"}
            </span>
          </div>
          <div className="row">
            <span className="row-label">Duration</span>
            <span>{formatDuration(device.last_command?.duration_ms)}</span>
          </div>
          <div className="row">
            <span className="row-label">Time</span>
            <span>{formatAbsoluteTime(device.last_command?.created_at)}</span>
          </div>
        </div>
      </Section>
      <Section title="Actions">
        <div
          className="panel"
          style={{ padding: 16, display: "flex", gap: 8, flexWrap: "wrap" }}
        >
          <button
            type="button"
            className="btn btn-primary"
            disabled={!device.enabled || !device.online}
            title={
              !device.online
                ? "Device must be online to receive commands."
                : undefined
            }
            onClick={() => setPending("lock")}
          >
            Lock
          </button>
        </div>
      </Section>
      <Section title="Security">
        <div
          className="panel"
          style={{ padding: 16, display: "flex", gap: 8, flexWrap: "wrap" }}
        >
          <button
            type="button"
            className="btn"
            onClick={() => setPending("rotate")}
          >
            Rotate Credential
          </button>
          {device.enabled ? (
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => setPending("disable")}
            >
              Disable Device
            </button>
          ) : (
            <button
              type="button"
              className="btn"
              onClick={() => void runEnable()}
            >
              Enable Device
            </button>
          )}
        </div>
      </Section>
      {pending === "lock" ? (
        <ConfirmDialog
          title={`Lock ${device.name}?`}
          description="This will immediately lock the current macOS session."
          confirmLabel="Lock"
          busy={busy}
          onCancel={() => setPending(null)}
          onConfirm={() => void runAction("lock")}
        />
      ) : null}
      {pending === "rotate" ? (
        <ConfirmDialog
          title="Rotate device credential?"
          description="The current credential will stop working. The replacement is shown only once."
          confirmLabel="Rotate Credential"
          danger
          busy={busy}
          onCancel={() => setPending(null)}
          onConfirm={() => void runAction("rotate")}
        />
      ) : null}
      {pending === "disable" ? (
        <ConfirmDialog
          title={`Disable ${device.name}?`}
          description="The Mac will be disconnected and will not receive commands until it is enabled again."
          confirmLabel="Disable Device"
          danger
          busy={busy}
          onCancel={() => setPending(null)}
          onConfirm={() => void runAction("disable")}
        />
      ) : null}
      {secret ? (
        <SecretDialog
          title="New device credential"
          secret={secret}
          onClose={() => setSecret(null)}
        />
      ) : null}
    </>
  );
}
