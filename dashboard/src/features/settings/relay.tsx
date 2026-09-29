import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { getSystem } from "../../api/system.js";
import { InfoRow } from "../../components/InfoRow.js";
import { LoadingState } from "../../components/LoadingState.js";
import { translateError } from "../../lib/errors.js";
import { formatUptime } from "../../lib/format.js";
import type { SystemResponse } from "../../types/activity.js";

export function SettingsRelayPage() {
  const { t } = useTranslation();
  const [system, setSystem] = useState<SystemResponse | null>(null);

  useEffect(() => {
    void getSystem()
      .then(setSystem)
      .catch((cause: unknown) => {
        toast.error(translateError(cause, t, "settings.loadFailed"));
      });
  }, [t]);

  if (system === null) {
    return <LoadingState label={t("common.loading")} />;
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>{t("settings.relay")}</CardTitle>
        <CardDescription>{t("settings.relayDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <InfoRow label={t("settings.publicUrl")}>{system.public_url}</InfoRow>
        <InfoRow label={t("settings.protocol")}>
          Mote Protocol v{system.protocol_version}
        </InfoRow>
        <InfoRow label={t("settings.environment")}>
          <span className="capitalize">{system.environment}</span>
        </InfoRow>
        <InfoRow label={t("settings.database")}>SQLite</InfoRow>
        <InfoRow label={t("settings.commandTtl")}>
          {t("settings.seconds", { count: system.command_ttl_ms / 1000 })}
        </InfoRow>
        <InfoRow label={t("settings.heartbeat")}>
          {t("settings.seconds", { count: system.heartbeat_stale_ms / 1000 })}
        </InfoRow>
        <InfoRow label={t("settings.uptime")}>{formatUptime(system.uptime_ms)}</InfoRow>
      </CardContent>
    </Card>
  );
}
