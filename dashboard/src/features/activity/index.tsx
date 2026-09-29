import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { ColumnDef } from "@tanstack/react-table";

import { Button } from "@/components/ui/button";

import { listActivity } from "../../api/activity.js";
import { listDevices, sendDeviceCommand } from "../../api/devices.js";
import { DataTable } from "../../components/data-table/index.js";
import { DataTableColumnHeader } from "../../components/data-table/column-header.js";
import {
  arrayIncludesFilter,
  useLocalTable,
} from "../../components/data-table/use-local-table.js";
import {
  DashboardPage,
  dashboardListClass,
} from "../../components/layout/dashboard-page.js";
import { PageHeading } from "../../components/layout/page-heading.js";
import { EventStatusBadge } from "../../components/StatusBadge.js";
import { useLiveRefresh } from "../../hooks/useLiveRefresh.js";
import { useLocaleFormat } from "../../hooks/useLocaleFormat.js";
import { translateError } from "../../lib/errors.js";
import { formatDuration } from "../../lib/format.js";
import { isRetryableStatus } from "../../lib/retry.js";
import type { ActivityEvent } from "../../types/activity.js";
import type { AdminDevice } from "../../types/device.js";

const ACTIVITY_EVENT_TOPICS = ["activity"] as const;

function statusGroup(status: string): string {
  if (status === "failed" || status === "timeout" || status === "expired") {
    return "failed";
  }
  return status;
}

export function ActivityPage() {
  const { t } = useTranslation();
  const format = useLocaleFormat();
  const [events, setEvents] = useState<ActivityEvent[] | null>(null);
  const [devices, setDevices] = useState<AdminDevice[]>([]);

  const refresh = useCallback(async () => {
    const [activity, deviceResult] = await Promise.all([
      listActivity({ limit: 50 }),
      listDevices(),
    ]);
    setEvents(activity.events);
    setDevices(deviceResult.devices);
  }, []);

  useLiveRefresh(refresh, {
    topics: ACTIVITY_EVENT_TOPICS,
    errorKey: "activity.loadFailed",
    ready: events !== null,
    offlinePollMs: 8_000,
  });

  const onlineIds = useMemo(
    () =>
      new Set(
        devices
          .filter((device) => device.enabled && device.online)
          .map((device) => device.id),
      ),
    [devices],
  );

  const onRetry = useCallback(
    (event: ActivityEvent) => {
      void sendDeviceCommand(event.device_id, event.action)
        .then(async () => {
          toast.success(t("detail.retried"));
          await refresh();
        })
        .catch((cause: unknown) => {
          toast.error(translateError(cause, t, "activity.retryFailed"));
        });
    },
    [refresh, t],
  );

  const columns = useMemo<ColumnDef<ActivityEvent>[]>(
    () => [
      {
        accessorKey: "created_at",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t("activity.time")} />
        ),
        cell: ({ row }) => (
          <span className="tabular">
            {format.formatAbsoluteTime(row.original.created_at)}
          </span>
        ),
      },
      {
        accessorKey: "device_name",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t("activity.device")} />
        ),
        filterFn: arrayIncludesFilter,
      },
      {
        accessorKey: "action",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t("activity.action")} />
        ),
        cell: ({ row }) => format.action(row.original.action),
      },
      {
        accessorKey: "source",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t("activity.source")} />
        ),
        cell: ({ row }) => format.source(row.original.source),
        filterFn: arrayIncludesFilter,
      },
      {
        id: "status",
        accessorFn: (event) => statusGroup(event.status),
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t("activity.status")} />
        ),
        cell: ({ row }) => (
          <span className="flex flex-col gap-1">
            <EventStatusBadge status={row.original.status} />
            {row.original.error_code
              ? format.errorCode(row.original.error_code)
              : null}
          </span>
        ),
        filterFn: arrayIncludesFilter,
      },
      {
        accessorKey: "duration_ms",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t("activity.duration")} />
        ),
        cell: ({ row }) => formatDuration(row.original.duration_ms),
      },
      {
        id: "actions",
        header: t("devices.actions"),
        enableSorting: false,
        enableHiding: false,
        cell: ({ row }) =>
          isRetryableStatus(row.original.status) &&
          onlineIds.has(row.original.device_id) ? (
            <Button
              type="button"
              size="sm"
              onClick={() => onRetry(row.original)}
            >
              {t("common.retry")}
            </Button>
          ) : (
            "—"
          ),
      },
    ],
    [format, onRetry, onlineIds, t],
  );

  const table = useLocalTable(events ?? [], columns);

  return (
    <>
      <DashboardPage ready={events !== null} className={dashboardListClass}>
        {events === null ? null : (
        <>
        <PageHeading title={t("activity.title")} />
        <DataTable
          table={table}
          emptyTitle={t("activity.empty")}
          searchKey="device_name"
          searchPlaceholder={t("activity.device")}
          filters={[
            {
              columnId: "status",
              title: t("activity.status"),
              options: [
                { label: t("activity.completed"), value: "completed" },
                { label: t("activity.failed"), value: "failed" },
              ],
            },
            {
              columnId: "device_name",
              title: t("activity.device"),
              options: devices.map((device) => ({
                label: device.name,
                value: device.name,
              })),
            },
            {
              columnId: "source",
              title: t("activity.source"),
              options: [
                { label: format.source("dashboard"), value: "dashboard" },
                { label: format.source("shortcut"), value: "shortcut" },
              ],
            },
          ]}
        />
        </>
        )}
      </DashboardPage>
    </>
  );
}
