import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";

import { listDevices, lockDevice } from "../api/devices.js";
import { useSearch } from "../context/search-provider.js";
import { translateError } from "../lib/errors.js";
import type { AdminDevice } from "../types/device.js";
import { ConfirmDialog } from "./ConfirmDialog.js";

const PAGES = [
  { to: "/", key: "nav.overview" },
  { to: "/devices", key: "nav.devices" },
  { to: "/activity", key: "nav.activity" },
  { to: "/tokens", key: "nav.tokens" },
  { to: "/settings", key: "nav.settings" },
] as const;

export function CommandMenu() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { open, setOpen } = useSearch();
  const [devices, setDevices] = useState<AdminDevice[]>([]);
  const [lockTarget, setLockTarget] = useState<AdminDevice | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }
    void listDevices()
      .then((result) => setDevices(result.devices))
      .catch(() => setDevices([]));
  }, [open]);

  const run = useCallback(
    (action: () => void) => {
      setOpen(false);
      action();
    },
    [setOpen],
  );

  const lockable = devices.filter((device) => device.enabled && device.online);

  return (
    <>
      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title={t("common.commandPalette")}
        description={t("command.placeholder")}
      >
        <Command>
          <CommandInput placeholder={t("command.placeholder")} />
          <CommandList>
            <CommandEmpty>{t("command.empty")}</CommandEmpty>
            <CommandGroup heading={t("command.pages")}>
              {PAGES.map((page) => (
                <CommandItem
                  key={page.to}
                  value={t(page.key)}
                  onSelect={() => run(() => navigate(page.to))}
                >
                  {t(page.key)}
                </CommandItem>
              ))}
            </CommandGroup>
            {lockable.length > 0 ? (
              <>
                <CommandSeparator />
                <CommandGroup heading={t("command.devices")}>
                  {lockable.map((device) => (
                    <CommandItem
                      key={device.id}
                      value={`${t("command.lock", { name: device.name })} ${device.name}`}
                      onSelect={() =>
                        run(() => {
                          setLockTarget(device);
                        })
                      }
                    >
                      {t("command.lock", { name: device.name })}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            ) : null}
          </CommandList>
        </Command>
      </CommandDialog>
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
    </>
  );
}
