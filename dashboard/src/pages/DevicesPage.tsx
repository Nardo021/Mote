import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { listDevices } from "../api/devices.js";
import { DataTable } from "../components/DataTable.js";
import { LoadingState } from "../components/LoadingState.js";
import { DeviceStatusBadge } from "../components/StatusBadge.js";
import { TopBar } from "../components/TopBar.js";
import { usePolling } from "../hooks/usePolling.js";
import { friendlyError } from "../lib/errors.js";
import {
  formatRelativeTime,
  lastCommandLabel,
  shortenId,
} from "../lib/format.js";
import type { AdminDevice } from "../types/device.js";

export function DevicesPage() {
  const [devices, setDevices] = useState<AdminDevice[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const result = await listDevices();
      setDevices(result.devices);
      setError(null);
    } catch (cause) {
      setError(friendlyError(cause, "Could not load devices."));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);
  usePolling(refresh, 5_000, devices !== null);

  if (devices === null && error === null) {
    return <LoadingState />;
  }

  return (
    <>
      <TopBar title="Devices" />
      {error && devices === null ? (
        <div className="error-state panel">
          <span>{error}</span>
          <button type="button" className="btn" onClick={() => void refresh()}>
            Retry
          </button>
        </div>
      ) : (
        <DataTable
          rows={devices ?? []}
          getRowKey={(device) => device.id}
          emptyTitle="No devices"
          emptyDescription="Create a device with the Mote Relay CLI."
          columns={[
            {
              key: "name",
              header: "Name",
              render: (device) => (
                <Link to={`/devices/${device.id}`}>{device.name}</Link>
              ),
            },
            {
              key: "status",
              header: "Status",
              render: (device) => <DeviceStatusBadge device={device} />,
            },
            {
              key: "id",
              header: "Device ID",
              render: (device) => (
                <span className="mono" title={device.id}>
                  {shortenId(device.id)}
                </span>
              ),
            },
            {
              key: "seen",
              header: "Last Seen",
              render: (device) => formatRelativeTime(device.last_seen_at),
            },
            {
              key: "command",
              header: "Last Command",
              render: (device) => lastCommandLabel(device.last_command),
            },
            {
              key: "enabled",
              header: "Enabled",
              render: (device) => (device.enabled ? "Yes" : "No"),
            },
          ]}
        />
      )}
    </>
  );
}
