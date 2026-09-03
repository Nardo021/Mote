import { useState, type FormEvent } from "react";
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
import { SignOutDialog } from "../../components/sign-out-dialog.js";
import { useAuth } from "../../hooks/useAuth.js";
import { translateError } from "../../lib/errors.js";

export function SettingsAccountPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [changing, setChanging] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false);

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

  return (
    <>
      <Card className="w-full">
        <CardHeader>
          <CardTitle>{t("settings.account")}</CardTitle>
          <CardDescription>{t("settings.accountDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
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
      <SignOutDialog open={confirmSignOut} onOpenChange={setConfirmSignOut} />
    </>
  );
}
