import { useCallback, useEffect, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

import {
  createToken,
  disableToken,
  enableToken,
  listTokens,
  rotateToken,
} from "../api/tokens.js";
import { ConfirmDialog } from "../components/ConfirmDialog.js";
import { DataTable } from "../components/DataTable.js";
import { ErrorBanner } from "../components/ErrorBanner.js";
import { LoadingState } from "../components/LoadingState.js";
import { SecretDialog } from "../components/SecretDialog.js";
import { TopBar } from "../components/TopBar.js";
import { friendlyError } from "../lib/errors.js";
import { formatAbsoluteTime, formatDate } from "../lib/format.js";
import type { AdminToken } from "../types/token.js";

type Pending = { type: "rotate" | "disable"; token: AdminToken } | null;

export function TokensPage() {
  const [tokens, setTokens] = useState<AdminToken[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Pending>(null);
  const [secret, setSecret] = useState<{ title: string; value: string } | null>(
    null,
  );

  const refresh = useCallback(async () => {
    try {
      setTokens((await listTokens()).tokens);
      setError(null);
    } catch (cause) {
      setError(friendlyError(cause, "Could not load tokens."));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const created = await createToken(name);
      setName("");
      setSecret({ title: "Shortcut token created", value: created.token });
      await refresh();
    } catch (cause) {
      setError(friendlyError(cause, "Could not create the token."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <TopBar
        title="Tokens"
        subtitle="Shortcut tokens are shown only at creation or rotation."
      />
      <form
        onSubmit={(event) => void onCreate(event)}
        className="mb-5 flex items-end gap-2"
      >
        <FieldGroup className="max-w-[280px] flex-1">
          <Field>
            <FieldLabel htmlFor="token-name">Name</FieldLabel>
            <Input
              id="token-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </Field>
        </FieldGroup>
        <Button type="submit" disabled={busy}>
          {busy ? <Spinner data-icon="inline-start" /> : null}
          Create Token
        </Button>
      </form>
      {error && tokens === null ? (
        <ErrorBanner message={error} onRetry={() => void refresh()} />
      ) : tokens === null ? (
        <LoadingState />
      ) : (
        <DataTable
          rows={tokens}
          getRowKey={(token) => token.id}
          emptyTitle="No shortcut tokens"
          emptyDescription="Create a token for Apple Shortcuts."
          columns={[
            { key: "name", header: "Name", render: (token) => token.name },
            {
              key: "permission",
              header: "Permission",
              render: (token) => token.permission,
            },
            {
              key: "enabled",
              header: "Enabled",
              render: (token) => (token.enabled ? "Enabled" : "Disabled"),
            },
            {
              key: "created",
              header: "Created",
              render: (token) => formatDate(token.created_at),
            },
            {
              key: "used",
              header: "Last Used",
              render: (token) => formatAbsoluteTime(token.last_used_at),
            },
            {
              key: "actions",
              header: "Actions",
              render: (token) => (
                <span className="inline-flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setPending({ type: "rotate", token })}
                  >
                    Rotate
                  </Button>
                  {token.enabled ? (
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={() => setPending({ type: "disable", token })}
                    >
                      Disable
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        void enableToken(token.id).then(refresh);
                      }}
                    >
                      Enable
                    </Button>
                  )}
                </span>
              ),
            },
          ]}
        />
      )}
      {pending?.type === "rotate" ? (
        <ConfirmDialog
          title="Rotate this token?"
          description="The current Shortcut token will stop working. The replacement is shown only once."
          confirmLabel="Rotate Token"
          danger
          busy={busy}
          onCancel={() => setPending(null)}
          onConfirm={() => {
            void (async () => {
              setBusy(true);
              try {
                const rotated = await rotateToken(pending.token.id);
                setSecret({
                  title: "Shortcut token rotated",
                  value: rotated.token,
                });
                setPending(null);
                await refresh();
              } catch (cause) {
                setError(friendlyError(cause, "Could not rotate the token."));
                setPending(null);
              } finally {
                setBusy(false);
              }
            })();
          }}
        />
      ) : null}
      {pending?.type === "disable" ? (
        <ConfirmDialog
          title="Disable this token?"
          description="Apple Shortcuts using this token will no longer be able to send commands."
          confirmLabel="Disable Token"
          danger
          busy={busy}
          onCancel={() => setPending(null)}
          onConfirm={() => {
            void (async () => {
              setBusy(true);
              try {
                await disableToken(pending.token.id);
                setPending(null);
                await refresh();
              } catch (cause) {
                setError(friendlyError(cause, "Could not disable the token."));
                setPending(null);
              } finally {
                setBusy(false);
              }
            })();
          }}
        />
      ) : null}
      {secret ? (
        <SecretDialog
          title={secret.title}
          secret={secret.value}
          onClose={() => setSecret(null)}
        />
      ) : null}
    </>
  );
}
