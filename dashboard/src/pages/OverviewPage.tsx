import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { lockDevice } from "../api/devices.js";
import { getOverview } from "../api/overview.js";
import { ConfirmDialog } from "../components/ConfirmDialog.js";
import {
  DeviceStatusBadge,
  EventStatusBadge,
  RelayStatusBadge,
} from "../components/StatusBadge.js";
import { LoadingState } from "../components/LoadingState.js";
import { Section } from "../components/Section.js";
import { TopBar } from "../components/TopBar.js";
import { usePolling } from "../hooks/usePolling.js";
import { friendlyError } from "../lib/errors.js";
import {
  formatAbsoluteTime,
  formatDuration,
  formatRelativeTime,
  lastCommandLabel,
  titleCaseAction,
} from "../lib/format.js";
import type { OverviewResponse } from "../types/activity.js";
import { listDevices } from "../api/devices.js";
import type { AdminDevice } from "../types/device.js";

export function OverviewPage() {
  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [devices, setDevices] = useState<AdminDevice[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [lockTarget, setLockTarget] = useState<AdminDevice | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [nextOverview, nextDevices] = await Promise.all([
        getOverview(),
        listDevices(),
      ]);
      setOverview(nextOverview);
      setDevices(nextDevices.devices);
      setError(null);
    } catch (cause) {
      setError(friendlyError(cause, "Could not load overview."));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);
  usePolling(refresh, 5_000, error === null || overview !== null);

  if (overview === null && error === null) {
    return <LoadingState />;
  }

  const enabled = devices.filter((device) => device.enabled);
  const lockable = enabled.filter((device) => device.online);

  return (
    <>
      <TopBar
        title="Mote Relay"
        subtitle="relay.yanze.me"
        action={
          overview ? (
            <RelayStatusBadge status={overview.relay.status} />
          ) : undefined
        }
      />
      {error && overview === null ? (
        <div className="error-state panel">
          <span>{error}</span>
          <button type="button" className="btn" onClick={() => void refresh()}>
            Retry
          </button>
        </div>
      ) : null}
      {overview ? (
        <>
          <Section title="Devices">
            <div className="panel">
              <div className="row">
                <span className="row-label">Summary</span>
                <span>
                  {overview.devices.online} online · {overview.devices.total}{" "}
                  total
                </span>
              </div>
              {devices.map((device) => (
                <div className="row" key={device.id}>
                  <Link to={`/devices/${device.id}`}>{device.name}</Link>
                  <span>
                    <DeviceStatusBadge device={device} />
                    <span className="topbar-sub" style={{ display: "block" }}>
                      Last seen {formatRelativeTime(device.last_seen_at)} ·{" "}
                      {lastCommandLabel(device.last_command)}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </Section>
          <Section title="Quick Action">
            <div
              className="panel"
              style={{ padding: 16, display: "flex", gap: 8, flexWrap: "wrap" }}
            >
              {enabled.length === 0 ? (
                <p className="topbar-sub">No enabled devices.</p>
              ) : (
                enabled.map((device) => (
                  <button
                    key={device.id}
                    type="button"
                    className="btn btn-primary"
                    disabled={!device.online}
                    title={
                      device.online
                        ? undefined
                        : "Device must be online to receive commands."
                    }
                    onClick={() => setLockTarget(device)}
                  >
                    Lock {device.name}
                  </button>
                ))
              )}
              {enabled.length > 0 && lockable.length === 0 ? (
                <p className="topbar-sub">
                  Device must be online to receive commands.
                </p>
              ) : null}
            </div>
          </Section>
          <Section title="Recent Activity">
            <div className="panel">
              {overview.recent_activity.length === 0 ? (
                <p className="empty">No recent commands.</p>
              ) : (
                overview.recent_activity.map((event) => (
                  <div className="row" key={event.id}>
                    <span className="tabular">
                      {formatAbsoluteTime(event.created_at)}
                    </span>
                    <span>
                      {titleCaseAction(event.action)} · {event.device_name} ·{" "}
                      <EventStatusBadge status={event.status} /> ·{" "}
                      {formatDuration(event.duration_ms)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </Section>
        </>
      ) : null}
      {lockTarget ? (
        <ConfirmDialog
          title={`Lock ${lockTarget.name}?`}
          description="This will immediately lock the current macOS session."
          confirmLabel="Lock"
          busy={busy}
          onCancel={() => setLockTarget(null)}
          onConfirm={() => {
            void (async () => {
              setBusy(true);
              try {
                await lockDevice(lockTarget.id);
                setLockTarget(null);
                await refresh();
              } catch (cause) {
                setError(friendlyError(cause, "Could not lock the device."));
                setLockTarget(null);
              } finally {
                setBusy(false);
              }
            })();
          }}
        />
      ) : null}
    </>
  );
}
