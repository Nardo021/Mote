import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
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
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

import {
  disableDevice,
  enableDevice,
  getDevice,
  lockDevice,
  renameDevice,
  rotateDeviceCredential,
  sendDeviceCommand,
} from "../../api/devices.js";
import { getSystem } from "../../api/system.js";
import { ConfirmDialog } from "../../components/ConfirmDialog.js";
import { CopyButton } from "../../components/CopyButton.js";
import { LoadingState } from "../../components/LoadingState.js";
import { AppHeader } from "../../components/layout/app-header.js";
import { Main } from "../../components/layout/main.js";
import { PageHeading } from "../../components/layout/page-heading.js";
import { DeviceStatusBadge, EventStatusBadge } from "../../components/StatusBadge.js";
import { useLocaleFormat } from "../../hooks/useLocaleFormat.js";
import { usePolling } from "../../hooks/usePolling.js";
import { translateError } from "../../lib/errors.js";
import {
  commandUrl,
  formatDuration,
  shortenId,
  shortcutSetupUrl,
} from "../../lib/format.js";
import { isRetryableStatus } from "../../lib/retry.js";
import type { AdminDevice } from "../../types/device.js";

type Pending = "lock" | "rotate" | "disable" | null;

export function DeviceDetailPage() {
  const { id } = useParams();
  const { t } = useTranslation();
  const format = useLocaleFormat();
  const [device, setDevice] = useState<AdminDevice | null>(null);
  const [publicUrl, setPublicUrl] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  const [busy, setBusy] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");

  const refresh = useCallback(async () => {
    if (id === undefined) {
      return;
    }
    const [loaded, system] = await Promise.all([getDevice(id), getSystem()]);
    setDevice(loaded);
    setPublicUrl(system.public_url);
  }, [id]);

  useEffect(() => {
    void refresh().catch((cause: unknown) => {
      toast.error(translateError(cause, t, "detail.loadFailed"));
    });
  }, [refresh, t]);
  usePolling(() => refresh().catch(() => undefined), 5_000, device !== null);

  if (device === null) {
    return (
      <>
        <AppHeader fixed />
        <Main>
          <LoadingState label={t("common.loading")} />
        </Main>
      </>
    );
  }

  const current = device;
  const canRetry =
    current.last_command !== null &&
    isRetryableStatus(current.last_command.status) &&
    current.enabled &&
    current.online;

  async function runPending(action: Exclude<Pending, null>) {
    setBusy(true);
    try {
      switch (action) {
        case "lock":
          await lockDevice(current.id);
          toast.success(t("detail.locked"));
          break;
        case "rotate":
          await rotateDeviceCredential(current.id);
          toast.success(t("detail.rotateDone"));
          break;
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
      toast.error(translateError(cause, t, "detail.actionFailed"));
      setPending(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <AppHeader fixed />
      <Main className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-fit"
          render={<Link to="/devices" />}
        >
          ← {t("detail.back")}
        </Button>
        <PageHeading
          title={device.name}
          description={shortenId(device.id)}
          action={<DeviceStatusBadge device={device} />}
        />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("detail.overview")}</CardTitle>
            <CardDescription>{t("detail.overviewDescription")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <InfoRow label={t("devices.deviceId")}>
              <span className="flex flex-wrap items-center gap-2">
                <span className="mono" title={device.id}>
                  {shortenId(device.id)}
                </span>
                <CopyButton value={device.id} label={t("detail.copyId")} />
              </span>
            </InfoRow>
            <InfoRow label={t("devices.status")}>
              <DeviceStatusBadge device={device} />
            </InfoRow>
            <InfoRow label={t("devices.version")}>
              <span className="mono">{device.app_version ?? "—"}</span>
            </InfoRow>
            <InfoRow label={t("devices.lastSeen")}>
              {format.formatRelativeTime(device.last_seen_at)}
            </InfoRow>
            <InfoRow label={t("detail.connectedSince")}>
              {device.online
                ? format.formatAbsoluteTime(device.connected_at)
                : "—"}
            </InfoRow>
            <InfoRow label={t("detail.connection")}>
              {device.online ? t("detail.websocket") : "—"}
            </InfoRow>
            <InfoRow label={t("detail.heartbeat")}>
              {device.online
                ? format.formatRelativeTime(device.last_heartbeat_at)
                : "—"}
            </InfoRow>
          </CardContent>
          <CardFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setRenameValue(device.name);
                setRenaming(true);
              }}
            >
              {t("detail.rename")}
            </Button>
          </CardFooter>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("detail.lastCommand")}</CardTitle>
            <CardDescription>
              {t("detail.lastCommandDescription")}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {device.last_command ? (
              <>
                <InfoRow label={t("activity.action")}>
                  {format.action(device.last_command.action)}
                </InfoRow>
                <InfoRow label={t("activity.status")}>
                  <EventStatusBadge status={device.last_command.status} />
                </InfoRow>
                {device.last_command.error_code ? (
                  <InfoRow label={t("detail.failureReason")}>
                    {format.errorCode(device.last_command.error_code)}
                  </InfoRow>
                ) : null}
                <InfoRow label={t("activity.duration")}>
                  {formatDuration(device.last_command.duration_ms)}
                </InfoRow>
                <InfoRow label={t("activity.time")}>
                  {format.formatAbsoluteTime(device.last_command.created_at)}
                </InfoRow>
              </>
            ) : (
              <p className="text-muted-foreground">{t("detail.noCommand")}</p>
            )}
          </CardContent>
          {canRetry ? (
            <CardFooter>
              <Button
                type="button"
                onClick={() => {
                  void (async () => {
                    if (device.last_command === null) {
                      return;
                    }
                    try {
                      await sendDeviceCommand(
                        device.id,
                        device.last_command.action,
                      );
                      toast.success(t("detail.retried"));
                      await refresh();
                    } catch (cause) {
                      toast.error(
                        translateError(cause, t, "devices.retryFailed"),
                      );
                    }
                  })();
                }}
              >
                {t("common.retry")}
              </Button>
            </CardFooter>
          ) : null}
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{t("detail.shortcuts")}</CardTitle>
          <CardDescription>{t("detail.shortcutsDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <InfoRow label={t("detail.setupLink")}>
            <span className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="mono break-all">
                {publicUrl ? shortcutSetupUrl(publicUrl, device.id) : "—"}
              </span>
              {publicUrl ? (
                <CopyButton
                  value={shortcutSetupUrl(publicUrl, device.id)}
                  label={t("detail.copySetup")}
                />
              ) : null}
            </span>
          </InfoRow>
          <InfoRow label={t("detail.commandUrl")}>
            <span className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="mono break-all">
                {publicUrl ? commandUrl(publicUrl, device.id) : "—"}
              </span>
              {publicUrl ? (
                <CopyButton
                  value={commandUrl(publicUrl, device.id)}
                  label={t("detail.copyCommand")}
                />
              ) : null}
            </span>
          </InfoRow>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t("detail.actions")}</CardTitle>
        </CardHeader>
        <CardFooter className="flex flex-wrap gap-2">
          <Button
            type="button"
            disabled={!device.enabled || !device.online}
            onClick={() => setPending("lock")}
          >
            {t("common.lock")}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setPending("rotate")}
          >
            {t("detail.rotate")}
          </Button>
          {device.enabled ? (
            <Button
              type="button"
              variant="destructive"
              onClick={() => setPending("disable")}
            >
              {t("detail.disable")}
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => {
                void enableDevice(device.id)
                  .then(setDevice)
                  .catch((cause: unknown) => {
                    toast.error(translateError(cause, t, "detail.actionFailed"));
                  });
              }}
            >
              {t("detail.enable")}
            </Button>
          )}
        </CardFooter>
      </Card>
      <Dialog
        open={renaming}
        onOpenChange={(open) => {
          if (!open && !busy) {
            setRenaming(false);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("devices.renameTitle")}</DialogTitle>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="rename-device">{t("devices.name")}</FieldLabel>
              <Input
                id="rename-device"
                value={renameValue}
                onChange={(event) => setRenameValue(event.target.value)}
              />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setRenaming(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              disabled={busy}
              onClick={() => {
                void (async () => {
                  setBusy(true);
                  try {
                    setDevice(await renameDevice(device.id, renameValue));
                    setRenaming(false);
                  } catch (cause) {
                    toast.error(translateError(cause, t, "devices.renameFailed"));
                  } finally {
                    setBusy(false);
                  }
                })();
              }}
            >
              {t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {pending === "lock" ? (
        <ConfirmDialog
          title={t("detail.lockTitle", { name: device.name })}
          description={t("detail.lockDescription")}
          confirmLabel={t("common.lock")}
          busy={busy}
          onCancel={() => setPending(null)}
          onConfirm={() => void runPending("lock")}
        />
      ) : null}
      {pending === "rotate" ? (
        <ConfirmDialog
          title={t("detail.rotateTitle")}
          description={t("detail.rotateDescription")}
          confirmLabel={t("detail.rotate")}
          danger
          busy={busy}
          onCancel={() => setPending(null)}
          onConfirm={() => void runPending("rotate")}
        />
      ) : null}
      {pending === "disable" ? (
        <ConfirmDialog
          title={t("detail.disableTitle", { name: device.name })}
          description={t("detail.disableDescription")}
          confirmLabel={t("detail.disable")}
          danger
          busy={busy}
          onCancel={() => setPending(null)}
          onConfirm={() => void runPending("disable")}
        />
      ) : null}
      </Main>
    </>
  );
}

function InfoRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-1 sm:grid-cols-[160px_1fr] sm:items-start">
      <span className="text-muted-foreground">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
