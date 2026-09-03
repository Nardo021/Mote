import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { ColumnDef } from "@tanstack/react-table";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

import { listDevices, renameDevice, sendDeviceCommand } from "../../api/devices.js";
import { DataTable } from "../../components/data-table/index.js";
import { DataTableColumnHeader } from "../../components/data-table/column-header.js";
import {
  arrayIncludesFilter,
  useLocalTable,
} from "../../components/data-table/use-local-table.js";
import { AppHeader } from "../../components/layout/app-header.js";
import { Main } from "../../components/layout/main.js";
import { PageHeading } from "../../components/layout/page-heading.js";
import { LoadingState } from "../../components/LoadingState.js";
import { DeviceStatusBadge, EventStatusBadge } from "../../components/StatusBadge.js";
import { useLocaleFormat } from "../../hooks/useLocaleFormat.js";
import { usePolling } from "../../hooks/usePolling.js";
import { translateError } from "../../lib/errors.js";
import { shortenId } from "../../lib/format.js";
import { isRetryableStatus } from "../../lib/retry.js";
import { usePairing } from "../../pairing/PairingProvider.js";
import type { AdminDevice } from "../../types/device.js";
import type { PairRequest } from "../../types/pair.js";

function devicePresence(device: AdminDevice): "online" | "offline" | "disabled" {
  if (!device.enabled) {
    return "disabled";
  }
  return device.online ? "online" : "offline";
}

export function DevicesPage() {
  const { t } = useTranslation();
  const format = useLocaleFormat();
  const pairing = usePairing();
  const [devices, setDevices] = useState<AdminDevice[] | null>(null);
  const [renameTarget, setRenameTarget] = useState<AdminDevice | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const result = await listDevices();
    setDevices(result.devices);
  }, []);

  useEffect(() => {
    void refresh().catch((cause: unknown) => {
      toast.error(translateError(cause, t, "devices.loadFailed"));
    });
  }, [refresh, t]);
  usePolling(() => refresh().catch(() => undefined), 5_000, devices !== null);

  const onRetry = useCallback(async (device: AdminDevice) => {
    const action = device.last_command?.action;
    if (action === undefined) {
      return;
    }
    try {
      await sendDeviceCommand(device.id, action);
      toast.success(t("detail.retried"));
      await refresh();
    } catch (cause) {
      toast.error(translateError(cause, t, "devices.retryFailed"));
    }
  }, [refresh, t]);

  const columns = useMemo<ColumnDef<AdminDevice>[]>(
    () => [
      {
        accessorKey: "name",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t("devices.name")} />
        ),
        cell: ({ row }) => (
          <Link className="hover:underline" to={`/devices/${row.original.id}`}>
            {row.original.name}
          </Link>
        ),
      },
      {
        id: "status",
        accessorFn: (device) => devicePresence(device),
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t("devices.status")} />
        ),
        cell: ({ row }) => <DeviceStatusBadge device={row.original} />,
        filterFn: arrayIncludesFilter,
      },
      {
        accessorKey: "id",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t("devices.deviceId")} />
        ),
        cell: ({ row }) => (
          <span className="mono" title={row.original.id}>
            {shortenId(row.original.id)}
          </span>
        ),
      },
      {
        accessorKey: "app_version",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t("devices.version")} />
        ),
        cell: ({ row }) => (
          <span className="mono">{row.original.app_version ?? "—"}</span>
        ),
      },
      {
        accessorKey: "last_seen_at",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t("devices.lastSeen")} />
        ),
        cell: ({ row }) => format.formatRelativeTime(row.original.last_seen_at),
      },
      {
        id: "lastCommand",
        accessorFn: (device) => device.last_command?.status ?? "",
        header: t("devices.lastCommand"),
        cell: ({ row }) =>
          row.original.last_command ? (
            <span className="flex flex-col gap-1">
              <span>
                {format.action(row.original.last_command.action)} ·{" "}
                <EventStatusBadge status={row.original.last_command.status} />
              </span>
              {row.original.last_command.error_code
                ? format.errorCode(row.original.last_command.error_code)
                : null}
            </span>
          ) : (
            "—"
          ),
        enableSorting: false,
      },
      {
        id: "actions",
        header: t("devices.actions"),
        enableSorting: false,
        enableHiding: false,
        cell: ({ row }) => {
          const device = row.original;
          return (
            <span className="inline-flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                render={<Link to={`/devices/${device.id}`} />}
              >
                {t("devices.open")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setRenameTarget(device);
                  setRenameValue(device.name);
                }}
              >
                {t("common.rename")}
              </Button>
              {device.last_command &&
              isRetryableStatus(device.last_command.status) &&
              device.enabled &&
              device.online ? (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void onRetry(device)}
                >
                  {t("common.retry")}
                </Button>
              ) : null}
            </span>
          );
        },
      },
    ],
    [format, onRetry, t],
  );

  const table = useLocalTable(devices ?? [], columns);

  async function onAllow(request: PairRequest) {
    try {
      await pairing.approve(request);
      toast.success(t("devices.approved"));
      await refresh();
    } catch (cause) {
      toast.error(translateError(cause, t, "devices.approveFailed"));
    }
  }

  async function onDeny(request: PairRequest) {
    try {
      await pairing.reject(request);
      toast.success(t("devices.denied"));
    } catch (cause) {
      toast.error(translateError(cause, t, "devices.denyFailed"));
    }
  }

  async function onRename() {
    if (renameTarget === null) {
      return;
    }
    setBusy(true);
    try {
      await renameDevice(renameTarget.id, renameValue);
      setRenameTarget(null);
      await refresh();
    } catch (cause) {
      toast.error(translateError(cause, t, "devices.renameFailed"));
    } finally {
      setBusy(false);
    }
  }

  if (devices === null) {
    return (
      <>
        <AppHeader fixed />
        <Main>
          <LoadingState label={t("common.loading")} />
        </Main>
      </>
    );
  }

  const empty =
    devices.length === 0 && pairing.requests.length === 0;

  return (
    <>
      <AppHeader fixed />
      <Main className="flex flex-1 flex-col gap-4 sm:gap-6">
        <PageHeading
          title={t("devices.title")}
          description={t("devices.subtitle")}
        />
        {pairing.requests.length > 0 ? (
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold">{t("devices.waiting")}</h2>
            {pairing.requests.map((request) => (
              <Card key={request.id}>
                <CardHeader>
                  <CardTitle>{request.device_name}</CardTitle>
                  <CardDescription>
                    <span className="mono" title={request.device_id}>
                      {shortenId(request.device_id)}
                    </span>
                    {" · "}
                    {format.formatRelativeTime(request.created_at)}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={pairing.busyId === request.id}
                    onClick={() => void onDeny(request)}
                  >
                    {t("common.deny")}
                  </Button>
                  <Button
                    type="button"
                    disabled={pairing.busyId === request.id}
                    onClick={() => void onAllow(request)}
                  >
                    {t("common.allow")}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </section>
        ) : null}
        {empty ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyTitle>{t("devices.emptyTitle")}</EmptyTitle>
              <EmptyDescription>{t("devices.emptyDescription")}</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <ol className="flex flex-col gap-1 text-start text-muted-foreground">
                <li>1. {t("devices.step1")}</li>
                <li>2. {t("devices.step2")}</li>
                <li>3. {t("devices.step3")}</li>
              </ol>
            </EmptyContent>
          </Empty>
        ) : (
          <DataTable
            table={table}
            emptyTitle={t("devices.emptyTitle")}
            emptyDescription={t("devices.search")}
            searchKey="name"
            searchPlaceholder={t("devices.search")}
            filters={[
              {
                columnId: "status",
                title: t("devices.status"),
                options: [
                  { label: t("presence.online"), value: "online" },
                  { label: t("presence.offline"), value: "offline" },
                  { label: t("presence.disabled"), value: "disabled" },
                ],
              },
            ]}
          />
        )}
      </Main>
      <Dialog
        open={renameTarget !== null}
        onOpenChange={(open) => {
          if (!open && !busy) {
            setRenameTarget(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("devices.renameTitle")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t("devices.renameDescription")}
          </p>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="device-name">{t("devices.name")}</FieldLabel>
              <Input
                id="device-name"
                value={renameValue}
                onChange={(event) => setRenameValue(event.target.value)}
              />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setRenameTarget(null)}
              disabled={busy}
            >
              {t("common.cancel")}
            </Button>
            <Button type="button" onClick={() => void onRename()} disabled={busy}>
              {t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
