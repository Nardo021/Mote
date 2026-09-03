import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";

import { listDevices } from "../api/devices.js";
import {
  approvePairRequest,
  listPairRequests,
  rejectPairRequest,
} from "../api/pair.js";
import { DataTable } from "../components/DataTable.js";
import { ErrorBanner } from "../components/ErrorBanner.js";
import { LoadingState } from "../components/LoadingState.js";
import { SecretDialog } from "../components/SecretDialog.js";
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
import type { PairRequest } from "../types/pair.js";

export function DevicesPage() {
  const [devices, setDevices] = useState<AdminDevice[] | null>(null);
  const [requests, setRequests] = useState<PairRequest[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [deviceResult, pairResult] = await Promise.all([
        listDevices(),
        listPairRequests(),
      ]);
      setDevices(deviceResult.devices);
      setRequests(pairResult.requests);
      setError(null);
    } catch (cause) {
      setError(friendlyError(cause, "Could not load devices."));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);
  usePolling(refresh, requests.length > 0 ? 2_000 : 5_000, devices !== null);

  async function onAllow(request: PairRequest) {
    setBusyId(request.id);
    try {
      const approved = await approvePairRequest(request.id);
      setSecret(approved.credential);
      await refresh();
    } catch (cause) {
      setError(friendlyError(cause, "Could not approve that device."));
    } finally {
      setBusyId(null);
    }
  }

  async function onDeny(request: PairRequest) {
    setBusyId(request.id);
    try {
      await rejectPairRequest(request.id);
      await refresh();
    } catch (cause) {
      setError(friendlyError(cause, "Could not reject that device."));
    } finally {
      setBusyId(null);
    }
  }

  if (devices === null && error === null) {
    return <LoadingState />;
  }

  return (
    <>
      <TopBar title="Devices" />
      {error && devices === null ? (
        <ErrorBanner message={error} onRetry={() => void refresh()} />
      ) : (
        <>
          {error ? <ErrorBanner message={error} /> : null}
          {requests.length > 0 ? (
            <section className="mb-7">
              <h2 className="mb-2.5 text-[13px] font-semibold">
                Waiting to pair
              </h2>
              <div className="flex flex-col gap-2">
                {requests.map((request) => (
                  <div
                    key={request.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-card px-4 py-3 ring-1 ring-foreground/10"
                  >
                    <div className="min-w-0">
                      <div className="font-medium">{request.device_name}</div>
                      <div className="text-muted-foreground">
                        <span className="mono" title={request.device_id}>
                          {shortenId(request.device_id)}
                        </span>
                        {" · "}
                        {formatRelativeTime(request.created_at)}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        disabled={busyId === request.id}
                        onClick={() => void onDeny(request)}
                      >
                        Deny
                      </Button>
                      <Button
                        type="button"
                        disabled={busyId === request.id}
                        onClick={() => void onAllow(request)}
                      >
                        Allow
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
          <DataTable
            rows={devices ?? []}
            getRowKey={(device) => device.id}
            emptyTitle="No devices"
            emptyDescription="Open Mote on the Mac and click Pair."
            columns={[
              {
                key: "name",
                header: "Name",
                render: (device) => (
                  <Link
                    className="hover:underline"
                    to={`/devices/${device.id}`}
                  >
                    {device.name}
                  </Link>
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
                key: "version",
                header: "Version",
                render: (device) => (
                  <span className="mono">{device.app_version ?? "—"}</span>
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
        </>
      )}
      {secret ? (
        <SecretDialog
          title="Device credential"
          secret={secret}
          onClose={() => setSecret(null)}
        />
      ) : null}
    </>
  );
}
