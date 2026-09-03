import { useEffect, useState, type FormEvent, type ReactNode } from "react";
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
import { Spinner } from "@/components/ui/spinner";

import { changePassword } from "../../api/auth.js";
import { getSystem } from "../../api/system.js";
import { ConfirmDialog } from "../../components/ConfirmDialog.js";
import { LoadingState } from "../../components/LoadingState.js";
import { PageHeading, PageShell } from "../../components/page-shell.js";
import { useAuth } from "../../hooks/useAuth.js";
import { translateError } from "../../lib/errors.js";
import { formatUptime } from "../../lib/format.js";
import type { SystemResponse } from "../../types/activity.js";

export function SettingsPage() {
  const { t } = useTranslation();
  const { user, signOut } = useAuth();
  const [system, setSystem] = useState<SystemResponse | null>(null);
  const [changing, setChanging] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false);

  useEffect(() => {
    void getSystem()
      .then(setSystem)
      .catch((cause: unknown) => {
        toast.error(translateError(cause, t, "settings.loadFailed"));
      });
  }, [t]);

  async function onChangePassword(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await changePassword(currentPassword, newPassword);
      setChanging(false);
      setCurrentPassword("");
      setNewPassword("");
      toast.success(t("settings.passwordChanged"));
    } catch (cause) {
      toast.error(translateError(cause, t, "settings.passwordFailed"));
    } finally {
      setBusy(false);
    }
  }

  if (system === null) {
    return (
      <PageShell>
        <LoadingState label={t("common.loading")} />
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeading
        title={t("settings.title")}
        description={t("settings.subtitle")}
      />
      <Card>
        <CardHeader>
          <CardTitle>{t("settings.relay")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Info label={t("settings.publicUrl")}>{system.public_url}</Info>
          <Info label={t("settings.protocol")}>
            Mote Protocol v{system.protocol_version}
          </Info>
          <Info label={t("settings.environment")}>
            <span className="capitalize">{system.environment}</span>
          </Info>
          <Info label={t("settings.database")}>SQLite</Info>
          <Info label={t("settings.commandTtl")}>
            {t("settings.seconds", { count: system.command_ttl_ms / 1000 })}
          </Info>
          <Info label={t("settings.heartbeat")}>
            {t("settings.seconds", { count: system.heartbeat_stale_ms / 1000 })}
          </Info>
          <Info label={t("settings.uptime")}>
            {formatUptime(system.uptime_ms)}
          </Info>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t("settings.account")}</CardTitle>
          <CardDescription>{t("settings.username")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Info label={t("settings.username")}>{user?.username ?? "—"}</Info>
          <p className="text-muted-foreground">
            {t("settings.passwordHint")}
            <br />
            <span className="mono">
              docker compose exec relay node dist/cli.js admin password
              --username {user?.username ?? "admin"}
            </span>
          </p>
        </CardContent>
        <CardFooter className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => setChanging(true)}>
            {t("settings.changePassword")}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setConfirmSignOut(true)}
          >
            {t("common.signOut")}
          </Button>
        </CardFooter>
      </Card>
      <Dialog
        open={changing}
        onOpenChange={(open) => {
          if (!open && !busy) {
            setChanging(false);
          }
        }}
      >
        <DialogContent>
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => void onChangePassword(event)}
          >
            <DialogHeader>
              <DialogTitle>{t("settings.changePassword")}</DialogTitle>
            </DialogHeader>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="current-password">
                  {t("settings.currentPassword")}
                </FieldLabel>
                <Input
                  id="current-password"
                  type="password"
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="new-password">
                  {t("settings.newPassword")}
                </FieldLabel>
                <Input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  required
                  minLength={12}
                />
              </Field>
            </FieldGroup>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setChanging(false)}
                disabled={busy}
              >
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? <Spinner data-icon="inline-start" /> : null}
                {t("settings.changePassword")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {confirmSignOut ? (
        <ConfirmDialog
          title={t("settings.signOutTitle")}
          description={t("settings.signOutDescription")}
          confirmLabel={t("common.signOut")}
          onCancel={() => setConfirmSignOut(false)}
          onConfirm={() => {
            void signOut();
          }}
        />
      ) : null}
    </PageShell>
  );
}

function Info({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-1 sm:grid-cols-[200px_1fr]">
      <span className="text-muted-foreground">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
