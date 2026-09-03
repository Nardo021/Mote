import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { Button } from "@/components/ui/button";

import {
  disableDevice,
  enableDevice,
  getDevice,
  lockDevice,
  rotateDeviceCredential,
} from "../api/devices.js";
import { ConfirmDialog } from "../components/ConfirmDialog.js";
import { ErrorBanner } from "../components/ErrorBanner.js";
import { LoadingState } from "../components/LoadingState.js";
import { SecretDialog } from "../components/SecretDialog.js";
import {
  ActionPanel,
  PropertyList,
  PropertyRow,
  Section,
} from "../components/Section.js";
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
      <ErrorBanner
        message={error ?? "Device not found."}
        onRetry={() => void refresh()}
      />
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
      switch (action) {
        case "lock":
          await lockDevice(current.id);
          break;
        case "rotate": {
          const rotated = await rotateDeviceCredential(current.id);
          setSecret(rotated.credential);
          break;
        }
        case "disable":
          setDevice(await disableDevice(current.id));
          break;
        default: {
          const _exhaustive: never = action;
          return _exhaustive;
        }
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
        subtitle={
          <Link className="hover:underline" to="/devices">
            Devices
          </Link>
        }
        action={<DeviceStatusBadge device={current} />}
      />
      {error ? <ErrorBanner message={error} /> : null}
      <Section title="Device">
        <PropertyList>
          <PropertyRow label="Device ID">
            <span className="mono" title={device.id}>
              {shortenId(device.id)}
            </span>
          </PropertyRow>
          <PropertyRow label="Status">
            <DeviceStatusBadge device={device} />
          </PropertyRow>
          <PropertyRow label="App Version">
            <span className="mono">{device.app_version ?? "—"}</span>
          </PropertyRow>
          <PropertyRow label="Last Seen">
            {formatRelativeTime(device.last_seen_at)}
          </PropertyRow>
          <PropertyRow label="Connected Since">
            {device.online ? formatAbsoluteTime(device.connected_at) : "—"}
          </PropertyRow>
        </PropertyList>
      </Section>
      <Section title="Relay">
        <PropertyList>
          <PropertyRow label="Connection">
            {device.online ? "WebSocket" : "—"}
          </PropertyRow>
          <PropertyRow label="Last Heartbeat">
            {device.online
              ? formatRelativeTime(device.last_heartbeat_at)
              : "—"}
          </PropertyRow>
        </PropertyList>
      </Section>
      <Section title="Last Command">
        <PropertyList>
          <PropertyRow label="Action">
            {device.last_command
              ? titleCaseAction(device.last_command.action)
              : "—"}
          </PropertyRow>
          <PropertyRow label="Status">
            {device.last_command
              ? titleCaseStatus(device.last_command.status)
              : "—"}
          </PropertyRow>
          <PropertyRow label="Duration">
            {formatDuration(device.last_command?.duration_ms)}
          </PropertyRow>
          <PropertyRow label="Time">
            {formatAbsoluteTime(device.last_command?.created_at)}
          </PropertyRow>
        </PropertyList>
      </Section>
      <Section title="Actions">
        <ActionPanel>
          <Button
            type="button"
            disabled={!device.enabled || !device.online}
            title={
              !device.online
                ? "Device must be online to receive commands."
                : undefined
            }
            onClick={() => setPending("lock")}
          >
            Lock
          </Button>
        </ActionPanel>
      </Section>
      <Section title="Security">
        <ActionPanel>
          <Button
            type="button"
            variant="outline"
            onClick={() => setPending("rotate")}
          >
            Rotate Credential
          </Button>
          {device.enabled ? (
            <Button
              type="button"
              variant="destructive"
              onClick={() => setPending("disable")}
            >
              Disable Device
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => void runEnable()}
            >
              Enable Device
            </Button>
          )}
        </ActionPanel>
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
