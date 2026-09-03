import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { ColumnDef } from "@tanstack/react-table";

import { Button } from "@/components/ui/button";
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

import {
  createToken,
  disableToken,
  enableToken,
  listTokens,
  rotateToken,
} from "../../api/tokens.js";
import { ConfirmDialog } from "../../components/ConfirmDialog.js";
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
import { SecretDialog } from "../../components/SecretDialog.js";
import { useLocaleFormat } from "../../hooks/useLocaleFormat.js";
import { translateError } from "../../lib/errors.js";
import type { AdminToken } from "../../types/token.js";

type Pending = { type: "rotate" | "disable"; token: AdminToken } | null;

export function TokensPage() {
  const { t } = useTranslation();
  const format = useLocaleFormat();
  const [tokens, setTokens] = useState<AdminToken[] | null>(null);
  const [creating, setCreating] = useState(false);
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

  const columns = useMemo<ColumnDef<AdminToken>[]>(
    () => [
      {
        accessorKey: "name",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t("tokens.name")} />
        ),
      },
      {
        accessorKey: "permission",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t("tokens.permission")} />
        ),
      },
      {
        id: "enabled",
        accessorFn: (token) => (token.enabled ? "enabled" : "disabled"),
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t("devices.status")} />
        ),
        cell: ({ row }) =>
          row.original.enabled
            ? t("tokenStatus.enabled")
            : t("tokenStatus.disabled"),
        filterFn: arrayIncludesFilter,
      },
      {
        accessorKey: "created_at",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t("tokens.created")} />
        ),
        cell: ({ row }) => format.formatDate(row.original.created_at),
      },
      {
        accessorKey: "last_used_at",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t("tokens.lastUsed")} />
        ),
        cell: ({ row }) => format.formatAbsoluteTime(row.original.last_used_at),
      },
      {
        id: "actions",
        header: t("tokens.actions"),
        enableSorting: false,
        enableHiding: false,
        cell: ({ row }) => {
          const token = row.original;
          return (
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
          );
        },
      },
    ],
    [format, refresh, t],
  );

  const table = useLocalTable(tokens ?? [], columns);

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const created = await createToken(name);
      setName("");
      setCreating(false);
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
      <>
        <AppHeader fixed />
        <Main>
          <LoadingState label={t("common.loading")} />
        </Main>
      </>
    );
  }

  return (
    <>
      <AppHeader fixed />
      <Main className="flex flex-1 flex-col gap-4 sm:gap-6">
        <PageHeading
          title={t("tokens.title")}
          action={
            <Button type="button" onClick={() => setCreating(true)}>
              {t("tokens.create")}
            </Button>
          }
        />
        <DataTable
          table={table}
          emptyTitle={t("tokens.empty")}
          emptyDescription={t("tokens.emptyDescription")}
          searchKey="name"
          searchPlaceholder={t("tokens.name")}
          filters={[
            {
              columnId: "enabled",
              title: t("devices.status"),
              options: [
                { label: t("tokenStatus.enabled"), value: "enabled" },
                { label: t("tokenStatus.disabled"), value: "disabled" },
              ],
            },
          ]}
        />
      </Main>
      <Dialog
        open={creating}
        onOpenChange={(open) => {
          if (!open && !busy) {
            setCreating(false);
          }
        }}
      >
        <DialogContent>
          <form className="flex flex-col gap-4" onSubmit={(event) => void onCreate(event)}>
            <DialogHeader>
              <DialogTitle>{t("tokens.create")}</DialogTitle>
            </DialogHeader>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="token-name">{t("tokens.name")}</FieldLabel>
                <Input
                  id="token-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                />
              </Field>
            </FieldGroup>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreating(false)}
                disabled={busy}
              >
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? <Spinner data-icon="inline-start" /> : null}
                {t("tokens.create")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
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
    </>
  );
}
