import { useCallback, useEffect, useState } from "react";

import { listActivity } from "../api/activity.js";
import { DataTable } from "../components/DataTable.js";
import { LoadingState } from "../components/LoadingState.js";
import { EventStatusBadge } from "../components/StatusBadge.js";
import { TopBar } from "../components/TopBar.js";
import { usePolling } from "../hooks/usePolling.js";
import { friendlyError } from "../lib/errors.js";
import {
  formatAbsoluteTime,
  formatDuration,
  titleCaseAction,
  titleCaseSource,
} from "../lib/format.js";
import type { ActivityEvent } from "../types/activity.js";

export function ActivityPage() {
  const [events, setEvents] = useState<ActivityEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setEvents((await listActivity({ limit: 50 })).events);
      setError(null);
    } catch (cause) {
      setError(friendlyError(cause, "Could not load activity."));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);
  usePolling(refresh, 8_000, events !== null);

  if (events === null && error === null) {
    return <LoadingState />;
  }

  return (
    <>
      <TopBar
        title="Activity"
        subtitle="Duration is elapsed time from command creation to the terminal result."
      />
      {error && events === null ? (
        <div className="error-state panel">
          <span>{error}</span>
          <button type="button" className="btn" onClick={() => void refresh()}>
            Retry
          </button>
        </div>
      ) : (
        <DataTable
          rows={events ?? []}
          getRowKey={(event) => event.id}
          emptyTitle="No command activity"
          columns={[
            {
              key: "time",
              header: "Time",
              render: (event) => (
                <span className="tabular">
                  {formatAbsoluteTime(event.created_at)}
                </span>
              ),
            },
            {
              key: "device",
              header: "Device",
              render: (event) => event.device_name,
            },
            {
              key: "action",
              header: "Action",
              render: (event) => titleCaseAction(event.action),
            },
            {
              key: "source",
              header: "Source",
              render: (event) => titleCaseSource(event.source),
            },
            {
              key: "status",
              header: "Status",
              render: (event) => <EventStatusBadge status={event.status} />,
            },
            {
              key: "duration",
              header: "Duration",
              render: (event) => formatDuration(event.duration_ms),
            },
          ]}
        />
      )}
    </>
  );
}
