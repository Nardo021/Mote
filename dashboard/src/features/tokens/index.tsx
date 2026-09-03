import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

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
} from "../../api/tokens.js";
import { ConfirmDialog } from "../../components/ConfirmDialog.js";
import { DataTable } from "../../components/DataTable.js";
import { LoadingState } from "../../components/LoadingState.js";
import { PageHeading, PageShell } from "../../components/page-shell.js";
import { SecretDialog } from "../../components/SecretDialog.js";
import { useLocaleFormat } from "../../hooks/useLocaleFormat.js";
import { translateError } from "../../lib/errors.js";
import type { AdminToken } from "../../types/token.js";

type Pending = { type: "rotate" | "disable"; token: AdminToken } | null;

export function TokensPage() {
  const { t } = useTranslation();
  const format = useLocaleFormat();
  const [tokens, setTokens] = useState<AdminToken[] | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Pending>(null);
  const [secret, setSecret] = useState<{ title: string; value: string } | null>(
    null,
  );

  const refresh = useCallback(async () => {
    setTokens((await listTokens()).tokens);
  }, []);

  useEffect(() => {
    void refresh().catch((cause: unknown) => {
      toast.error(translateError(cause, t, "tokens.loadFailed"));
    });
  }, [refresh, t]);

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const created = await createToken(name);
      setName("");
      setSecret({ title: t("tokens.createdSecret"), value: created.token });
      await refresh();
    } catch (cause) {
      toast.error(translateError(cause, t, "tokens.createFailed"));
    } finally {
      setBusy(false);
    }
  }

  if (tokens === null) {
    return (
      <PageShell>
        <LoadingState label={t("common.loading")} />
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeading
        title={t("tokens.title")}
        description={t("tokens.subtitle")}
      />
      <form onSubmit={(event) => void onCreate(event)}>
        <FieldGroup className="max-w-sm">
          <Field>
            <FieldLabel htmlFor="token-name">{t("tokens.name")}</FieldLabel>
            <Input
              id="token-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </Field>
          <Button type="submit" disabled={busy}>
            {busy ? <Spinner data-icon="inline-start" /> : null}
            {t("tokens.create")}
          </Button>
        </FieldGroup>
      </form>
      <DataTable
        rows={tokens}
        getRowKey={(token) => token.id}
        emptyTitle={t("tokens.empty")}
        emptyDescription={t("tokens.emptyDescription")}
        columns={[
          { key: "name", header: t("tokens.name"), render: (token) => token.name },
          {
            key: "permission",
            header: t("tokens.permission"),
            render: (token) => token.permission,
          },
          {
            key: "enabled",
            header: t("devices.status"),
            render: (token) =>
              token.enabled
                ? t("tokenStatus.enabled")
                : t("tokenStatus.disabled"),
          },
          {
            key: "created",
            header: t("tokens.created"),
            render: (token) => format.formatDate(token.created_at),
          },
          {
            key: "used",
            header: t("tokens.lastUsed"),
            render: (token) => format.formatAbsoluteTime(token.last_used_at),
          },
          {
            key: "actions",
            header: t("tokens.actions"),
            render: (token) => (
              <span className="inline-flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPending({ type: "rotate", token })}
                >
                  {t("tokens.rotate")}
                </Button>
                {token.enabled ? (
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() => setPending({ type: "disable", token })}
                  >
                    {t("common.disable")}
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      void enableToken(token.id)
                        .then(() => refresh())
                        .catch((cause: unknown) => {
                          toast.error(
                            translateError(cause, t, "tokens.enableFailed"),
                          );
                        });
                    }}
                  >
                    {t("common.enable")}
                  </Button>
                )}
              </span>
            ),
          },
        ]}
      />
      {pending?.type === "rotate" ? (
        <ConfirmDialog
          title={t("tokens.rotateTitle")}
          description={t("tokens.rotateDescription")}
          confirmLabel={t("tokens.rotate")}
          danger
          busy={busy}
          onCancel={() => setPending(null)}
          onConfirm={() => {
            void (async () => {
              setBusy(true);
              try {
                const rotated = await rotateToken(pending.token.id);
                setSecret({
                  title: t("tokens.rotatedSecret"),
                  value: rotated.token,
                });
                setPending(null);
                await refresh();
              } catch (cause) {
                toast.error(translateError(cause, t, "tokens.rotateFailed"));
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
          title={t("tokens.disableTitle")}
          description={t("tokens.disableDescription")}
          confirmLabel={t("common.disable")}
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
                toast.error(translateError(cause, t, "tokens.disableFailed"));
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
    </PageShell>
  );
}
