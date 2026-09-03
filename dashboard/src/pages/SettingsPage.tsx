import { useEffect, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

import { changePassword } from "../api/auth.js";
import { getSystem } from "../api/system.js";
import { ConfirmDialog } from "../components/ConfirmDialog.js";
import { ErrorBanner } from "../components/ErrorBanner.js";
import { LoadingState } from "../components/LoadingState.js";
import {
  PropertyList,
  PropertyRow,
  Section,
} from "../components/Section.js";
import { TopBar } from "../components/TopBar.js";
import { useAuth } from "../hooks/useAuth.js";
import { friendlyError } from "../lib/errors.js";
import { formatUptime } from "../lib/format.js";
import type { SystemResponse } from "../types/activity.js";

export function SettingsPage() {
  const { user, signOut } = useAuth();
  const [system, setSystem] = useState<SystemResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [changing, setChanging] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false);

  useEffect(() => {
    void getSystem()
      .then(setSystem)
      .catch((cause: unknown) =>
        setError(friendlyError(cause, "Could not load settings.")),
      );
  }, []);

  async function onChangePassword(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await changePassword(currentPassword, newPassword);
      setChanging(false);
      setCurrentPassword("");
      setNewPassword("");
    } catch (cause) {
      setError(friendlyError(cause, "Could not change the password."));
    } finally {
      setBusy(false);
    }
  }

  if (system === null && error === null) {
    return <LoadingState />;
  }

  return (
    <>
      <TopBar title="Settings" />
      {error ? <ErrorBanner message={error} /> : null}
      {system ? (
        <Section title="Relay">
          <PropertyList>
            <PropertyRow label="Public URL">{system.public_url}</PropertyRow>
            <PropertyRow label="Protocol">
              Mote Protocol v{system.protocol_version}
            </PropertyRow>
            <PropertyRow label="Environment">
              <span className="capitalize">{system.environment}</span>
            </PropertyRow>
            <PropertyRow label="Database">SQLite</PropertyRow>
            <PropertyRow label="Command TTL">
              {system.command_ttl_ms / 1000} seconds
            </PropertyRow>
            <PropertyRow label="Heartbeat stale threshold">
              {system.heartbeat_stale_ms / 1000} seconds
            </PropertyRow>
            <PropertyRow label="Uptime">
              {formatUptime(system.uptime_ms)}
            </PropertyRow>
          </PropertyList>
        </Section>
      ) : null}
      <Section title="Administrator">
        <PropertyList>
          <PropertyRow label="Username">{user?.username ?? "—"}</PropertyRow>
        </PropertyList>
        <div className="mt-3 flex gap-2">
          <Button type="button" variant="outline" onClick={() => setChanging(true)}>
            Change Password
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setConfirmSignOut(true)}
          >
            Sign Out
          </Button>
        </div>
        <p className="mt-4 text-muted-foreground">
          Password recovery is not available in the Dashboard. Use the Relay CLI
          on the server:
          <br />
          <span className="mono">
            docker compose exec relay node dist/cli.js admin password --username{" "}
            {user?.username ?? "admin"}
          </span>
        </p>
      </Section>
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
              <DialogTitle>Change Password</DialogTitle>
            </DialogHeader>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="current-password">
                  Current password
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
                <FieldLabel htmlFor="new-password">New password</FieldLabel>
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
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? <Spinner data-icon="inline-start" /> : null}
                Change Password
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {confirmSignOut ? (
        <ConfirmDialog
          title="Sign out?"
          description="This ends the current Dashboard session."
          confirmLabel="Sign Out"
          onCancel={() => setConfirmSignOut(false)}
          onConfirm={() => {
            void signOut();
          }}
        />
      ) : null}
    </>
  );
}
