import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Monitor, CheckCircle2, CircleAlert, Wifi } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

import { listDevices, lockDevice } from "../../api/devices.js";
import { getOverview } from "../../api/overview.js";
import { ConfirmDialog } from "../../components/ConfirmDialog.js";
import { LoadingState } from "../../components/LoadingState.js";
import { PageHeading, PageShell } from "../../components/page-shell.js";
import {
  DeviceStatusBadge,
  EventStatusBadge,
  RelayStatusBadge,
} from "../../components/StatusBadge.js";
import { useLocaleFormat } from "../../hooks/useLocaleFormat.js";
import { usePolling } from "../../hooks/usePolling.js";
import { translateError } from "../../lib/errors.js";
import type { OverviewResponse } from "../../types/activity.js";
import type { AdminDevice } from "../../types/device.js";

export function OverviewPage() {
  const { t } = useTranslation();
  const format = useLocaleFormat();
  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [devices, setDevices] = useState<AdminDevice[]>([]);
  const [lockTarget, setLockTarget] = useState<AdminDevice | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const [nextOverview, nextDevices] = await Promise.all([
      getOverview(),
      listDevices(),
    ]);
    setOverview(nextOverview);
    setDevices(nextDevices.devices);
  }, []);

  useEffect(() => {
    void refresh().catch((cause: unknown) => {
      toast.error(translateError(cause, t, "errors.unknown"));
    });
  }, [refresh, t]);
  usePolling(
    () => refresh().catch(() => undefined),
    5_000,
    overview !== null,
  );

  if (overview === null) {
    return (
      <PageShell>
        <LoadingState label={t("common.loading")} />
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeading
        title={t("overview.title")}
        description={t("overview.subtitle")}
        action={<RelayStatusBadge status={overview.relay.status} />}
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title={t("overview.onlineDevices")}
          value={String(overview.devices.online)}
          icon={Wifi}
        />
        <StatCard
          title={t("overview.totalDevices")}
          value={String(overview.devices.total)}
          icon={Monitor}
        />
        <StatCard
          title={t("overview.completed24h")}
          value={String(overview.commands.completed_24h)}
          icon={CheckCircle2}
        />
        <StatCard
          title={t("overview.failed24h")}
          value={String(overview.commands.failed_24h)}
          icon={CircleAlert}
        />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-7">
        <Card className="lg:col-span-4">
          <CardHeader>
            <CardTitle>{t("overview.devices")}</CardTitle>
            <CardDescription>{t("overview.devicesDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            {devices.length === 0 ? (
              <Empty>
                <EmptyHeader>
                  <EmptyTitle>{t("overview.emptyDevices")}</EmptyTitle>
                  <EmptyDescription>
                    {t("overview.emptyDevicesHint")}
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("devices.name")}</TableHead>
                    <TableHead>{t("devices.status")}</TableHead>
                    <TableHead>{t("devices.lastCommand")}</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {devices.map((device) => (
                    <TableRow key={device.id}>
                      <TableCell>
                        <Link className="hover:underline" to={`/devices/${device.id}`}>
                          {device.name}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <DeviceStatusBadge device={device} />
                      </TableCell>
                      <TableCell>
                        {device.last_command
                          ? `${format.action(device.last_command.action)} · ${format.status(device.last_command.status)}`
                          : "—"}
                      </TableCell>
                      <TableCell>
                        <LockButton
                          device={device}
                          onLock={() => setLockTarget(device)}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>{t("overview.recent")}</CardTitle>
            <CardDescription>{t("overview.recentDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            {overview.recent_activity.length === 0 ? (
              <Empty>
                <EmptyHeader>
                  <EmptyTitle>{t("overview.emptyActivity")}</EmptyTitle>
                </EmptyHeader>
              </Empty>
            ) : (
              <div className="flex flex-col divide-y">
                {overview.recent_activity.map((event) => (
                  <div key={event.id} className="flex flex-col gap-1 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{event.device_name}</span>
                      <EventStatusBadge status={event.status} />
                    </div>
                    <div className="text-muted-foreground">
                      {format.action(event.action)}
                      {event.error_code
                        ? ` · ${format.errorCode(event.error_code)}`
                        : null}
                    </div>
                    <div className="tabular text-muted-foreground">
                      {format.formatAbsoluteTime(event.created_at)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      {lockTarget ? (
        <ConfirmDialog
          title={t("detail.lockTitle", { name: lockTarget.name })}
          description={t("detail.lockDescription")}
          confirmLabel={t("common.lock")}
          busy={busy}
          onCancel={() => setLockTarget(null)}
          onConfirm={() => {
            void (async () => {
              setBusy(true);
              try {
                await lockDevice(lockTarget.id);
                toast.success(t("detail.locked"));
                setLockTarget(null);
                await refresh();
              } catch (cause) {
                toast.error(translateError(cause, t, "detail.actionFailed"));
                setLockTarget(null);
              } finally {
                setBusy(false);
              }
            })();
          }}
        />
      ) : null}
    </PageShell>
  );
}

function StatCard({
  title,
  value,
  icon: Icon,
}: {
  title: string;
  value: string;
  icon: typeof Wifi;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <CardAction>
          <Icon className="text-muted-foreground" />
        </CardAction>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}

function LockButton({
  device,
  onLock,
}: {
  device: AdminDevice;
  onLock: () => void;
}) {
  const { t } = useTranslation();
  const disabled = !device.enabled || !device.online;
  const button = (
    <Button
      type="button"
      size="sm"
      disabled={disabled}
      onClick={onLock}
    >
      {t("overview.lock", { name: device.name })}
    </Button>
  );
  if (!disabled) {
    return button;
  }
  return (
    <Tooltip>
      <TooltipTrigger render={<span className="inline-flex" />}>
        {button}
      </TooltipTrigger>
      <TooltipContent>{t("overview.offlineHint")}</TooltipContent>
    </Tooltip>
  );
}
