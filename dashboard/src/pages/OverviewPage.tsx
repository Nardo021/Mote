import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";

import { lockDevice } from "../api/devices.js";
import { getOverview } from "../api/overview.js";
import { ConfirmDialog } from "../components/ConfirmDialog.js";
import { ErrorBanner } from "../components/ErrorBanner.js";
import { LoadingState } from "../components/LoadingState.js";
import {
  ActionPanel,
  PropertyList,
  PropertyRow,
  Section,
} from "../components/Section.js";
import {
  DeviceStatusBadge,
  EventStatusBadge,
  RelayStatusBadge,
} from "../components/StatusBadge.js";
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
        <ErrorBanner message={error} onRetry={() => void refresh()} />
      ) : null}
      {overview ? (
        <>
          <Section title="Devices">
            <PropertyList>
              <PropertyRow label="Summary">
                {overview.devices.online} online · {overview.devices.total} total
              </PropertyRow>
              {devices.map((device) => (
                <PropertyRow
                  key={device.id}
                  label={
                    <Link className="hover:underline" to={`/devices/${device.id}`}>
                      {device.name}
                    </Link>
                  }
                >
                  <div className="flex flex-col gap-1">
                    <DeviceStatusBadge device={device} />
                    <span className="text-muted-foreground">
                      Last seen {formatRelativeTime(device.last_seen_at)} ·{" "}
                      {lastCommandLabel(device.last_command)}
                    </span>
                  </div>
                </PropertyRow>
              ))}
            </PropertyList>
          </Section>
          <Section title="Quick Action">
            <ActionPanel>
              {enabled.length === 0 ? (
                <p className="text-muted-foreground">No enabled devices.</p>
              ) : (
                enabled.map((device) => (
                  <Button
                    key={device.id}
                    type="button"
                    disabled={!device.online}
                    title={
                      device.online
                        ? undefined
                        : "Device must be online to receive commands."
                    }
                    onClick={() => setLockTarget(device)}
                  >
                    Lock {device.name}
                  </Button>
                ))
              )}
              {enabled.length > 0 && lockable.length === 0 ? (
                <p className="text-muted-foreground">
                  Device must be online to receive commands.
                </p>
              ) : null}
            </ActionPanel>
          </Section>
          <Section title="Recent Activity">
            <PropertyList>
              {overview.recent_activity.length === 0 ? (
                <PropertyRow>
                  <p className="text-muted-foreground">No recent commands.</p>
                </PropertyRow>
              ) : (
                overview.recent_activity.map((event) => (
                  <PropertyRow
                    key={event.id}
                    label={
                      <span className="tabular">
                        {formatAbsoluteTime(event.created_at)}
                      </span>
                    }
                  >
                    {titleCaseAction(event.action)} · {event.device_name} ·{" "}
                    <EventStatusBadge status={event.status} /> ·{" "}
                    {formatDuration(event.duration_ms)}
                  </PropertyRow>
                ))
              )}
            </PropertyList>
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
