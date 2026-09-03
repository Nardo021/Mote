import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { SearchIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

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
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Input } from "@/components/ui/input";

import { listDevices, renameDevice, sendDeviceCommand } from "../../api/devices.js";
import { DataTable } from "../../components/DataTable.js";
import { LoadingState } from "../../components/LoadingState.js";
import { PageHeading, PageShell } from "../../components/page-shell.js";
import { DeviceStatusBadge, EventStatusBadge } from "../../components/StatusBadge.js";
import { useLocaleFormat } from "../../hooks/useLocaleFormat.js";
import { usePolling } from "../../hooks/usePolling.js";
import { translateError } from "../../lib/errors.js";
import { shortenId } from "../../lib/format.js";
import { isRetryableStatus } from "../../lib/retry.js";
import { usePairing } from "../../pairing/PairingProvider.js";
import type { AdminDevice } from "../../types/device.js";
import type { PairRequest } from "../../types/pair.js";

export function DevicesPage() {
  const { t } = useTranslation();
  const format = useLocaleFormat();
  const pairing = usePairing();
  const [devices, setDevices] = useState<AdminDevice[] | null>(null);
  const [query, setQuery] = useState("");
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

  const filtered = useMemo(() => {
    const rows = devices ?? [];
    const needle = query.trim().toLowerCase();
    if (needle === "") {
      return rows;
    }
    return rows.filter((device) => {
      return (
        device.name.toLowerCase().includes(needle) ||
        device.id.toLowerCase().includes(needle) ||
        shortenId(device.id).toLowerCase().includes(needle)
      );
    });
  }, [devices, query]);

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

  async function onRetry(device: AdminDevice) {
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
      <PageShell>
        <LoadingState label={t("common.loading")} />
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeading
        title={t("devices.title")}
        description={t("devices.subtitle")}
      />
      <InputGroup className="max-w-sm">
        <InputGroupAddon>
          <SearchIcon />
        </InputGroupAddon>
        <InputGroupInput
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("devices.search")}
        />
      </InputGroup>
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
      {filtered.length === 0 && query === "" && pairing.requests.length === 0 ? (
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
          rows={filtered}
          getRowKey={(device) => device.id}
          emptyTitle={t("devices.emptyTitle")}
          emptyDescription={t("devices.search")}
          columns={[
            {
              key: "name",
              header: t("devices.name"),
              render: (device) => (
                <Link className="hover:underline" to={`/devices/${device.id}`}>
                  {device.name}
                </Link>
              ),
            },
            {
              key: "status",
              header: t("devices.status"),
              render: (device) => <DeviceStatusBadge device={device} />,
            },
            {
              key: "id",
              header: t("devices.deviceId"),
              render: (device) => (
                <span className="mono" title={device.id}>
                  {shortenId(device.id)}
                </span>
              ),
            },
            {
              key: "version",
              header: t("devices.version"),
              render: (device) => (
                <span className="mono">{device.app_version ?? "—"}</span>
              ),
            },
            {
              key: "seen",
              header: t("devices.lastSeen"),
              render: (device) => format.formatRelativeTime(device.last_seen_at),
            },
            {
              key: "command",
              header: t("devices.lastCommand"),
              render: (device) =>
                device.last_command ? (
                  <span className="flex flex-col gap-1">
                    <span>
                      {format.action(device.last_command.action)} ·{" "}
                      <EventStatusBadge status={device.last_command.status} />
                    </span>
                    {device.last_command.error_code
                      ? format.errorCode(device.last_command.error_code)
                      : null}
                  </span>
                ) : (
                  "—"
                ),
            },
            {
              key: "actions",
              header: t("devices.actions"),
              render: (device) => (
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
              ),
            },
          ]}
        />
      )}
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
    </PageShell>
  );
}
