import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

import { listActivity, type ActivityQuery } from "../../api/activity.js";
import { listDevices, sendDeviceCommand } from "../../api/devices.js";
import { DataTable } from "../../components/DataTable.js";
import { LoadingState } from "../../components/LoadingState.js";
import { PageHeading, PageShell } from "../../components/page-shell.js";
import { EventStatusBadge } from "../../components/StatusBadge.js";
import { useLocaleFormat } from "../../hooks/useLocaleFormat.js";
import { usePolling } from "../../hooks/usePolling.js";
import { translateError } from "../../lib/errors.js";
import { formatDuration } from "../../lib/format.js";
import { isRetryableStatus } from "../../lib/retry.js";
import type { ActivityEvent } from "../../types/activity.js";
import type { AdminDevice } from "../../types/device.js";

type StatusFilter = "all" | "completed" | "failed";

export function ActivityPage() {
  const { t } = useTranslation();
  const format = useLocaleFormat();
  const [events, setEvents] = useState<ActivityEvent[] | null>(null);
  const [devices, setDevices] = useState<AdminDevice[]>([]);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [deviceId, setDeviceId] = useState("all");
  const [source, setSource] = useState("all");

  const refresh = useCallback(async () => {
    const filters = (): ActivityQuery => {
      const query: ActivityQuery = { limit: 50 };
      if (deviceId !== "all") {
        query.device_id = deviceId;
      }
      if (source !== "all") {
        query.source = source;
      }
      return query;
    };
    if (status === "failed") {
      const [failed, timeout, expired, deviceResult] = await Promise.all([
        listActivity({ ...filters(), status: "failed" }),
        listActivity({ ...filters(), status: "timeout" }),
        listActivity({ ...filters(), status: "expired" }),
        listDevices(),
      ]);
      const merged = [
        ...failed.events,
        ...timeout.events,
        ...expired.events,
      ].sort((left, right) => right.created_at - left.created_at);
      setEvents(merged.slice(0, 50));
      setDevices(deviceResult.devices);
      return;
    }
    const query = filters();
    if (status === "completed") {
      query.status = "completed";
    }
    const [activity, deviceResult] = await Promise.all([
      listActivity(query),
      listDevices(),
    ]);
    setEvents(activity.events);
    setDevices(deviceResult.devices);
  }, [deviceId, source, status]);

  useEffect(() => {
    void refresh().catch((cause: unknown) => {
      toast.error(translateError(cause, t, "activity.loadFailed"));
    });
  }, [refresh, t]);
  usePolling(() => refresh().catch(() => undefined), 8_000, events !== null);

  if (events === null) {
    return (
      <PageShell>
        <LoadingState label={t("common.loading")} />
      </PageShell>
    );
  }

  const onlineIds = new Set(
    devices.filter((device) => device.enabled && device.online).map((d) => d.id),
  );

  return (
    <PageShell>
      <PageHeading
        title={t("activity.title")}
        description={t("activity.subtitle")}
      />
      <div className="flex flex-wrap items-center gap-3">
        <ToggleGroup
          multiple={false}
          value={[status]}
          onValueChange={(next) => {
            const selected = next[0];
            if (selected === "all" || selected === "completed" || selected === "failed") {
              setStatus(selected);
            }
          }}
        >
          <ToggleGroupItem value="all">{t("activity.all")}</ToggleGroupItem>
          <ToggleGroupItem value="completed">
            {t("activity.completed")}
          </ToggleGroupItem>
          <ToggleGroupItem value="failed">{t("activity.failed")}</ToggleGroupItem>
        </ToggleGroup>
        <Select value={deviceId} onValueChange={(value) => setDeviceId(String(value))}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="all">{t("activity.allDevices")}</SelectItem>
              {devices.map((device) => (
                <SelectItem key={device.id} value={device.id}>
                  {device.name}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <Select value={source} onValueChange={(value) => setSource(String(value))}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="all">{t("activity.allSources")}</SelectItem>
              <SelectItem value="dashboard">{format.source("dashboard")}</SelectItem>
              <SelectItem value="shortcut">{format.source("shortcut")}</SelectItem>
              <SelectItem value="ios">{format.source("ios")}</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
      <DataTable
        rows={events}
        getRowKey={(event) => event.id}
        emptyTitle={t("activity.empty")}
        columns={[
          {
            key: "time",
            header: t("activity.time"),
            render: (event) => (
              <span className="tabular">
                {format.formatAbsoluteTime(event.created_at)}
              </span>
            ),
          },
          {
            key: "device",
            header: t("activity.device"),
            render: (event) => event.device_name,
          },
          {
            key: "action",
            header: t("activity.action"),
            render: (event) => format.action(event.action),
          },
          {
            key: "source",
            header: t("activity.source"),
            render: (event) => format.source(event.source),
          },
          {
            key: "status",
            header: t("activity.status"),
            render: (event) => (
              <span className="flex flex-col gap-1">
                <EventStatusBadge status={event.status} />
                {event.error_code ? format.errorCode(event.error_code) : null}
              </span>
            ),
          },
          {
            key: "duration",
            header: t("activity.duration"),
            render: (event) => formatDuration(event.duration_ms),
          },
          {
            key: "retry",
            header: t("devices.actions"),
            render: (event) =>
              isRetryableStatus(event.status) && onlineIds.has(event.device_id) ? (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    void sendDeviceCommand(event.device_id, event.action)
                      .then(async () => {
                        toast.success(t("detail.retried"));
                        await refresh();
                      })
                      .catch((cause: unknown) => {
                        toast.error(
                          translateError(cause, t, "activity.retryFailed"),
                        );
                      });
                  }}
                >
                  {t("common.retry")}
                </Button>
              ) : (
                "—"
              ),
          },
        ]}
      />
    </PageShell>
  );
}
