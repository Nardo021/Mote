import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import { useLocaleFormat } from "../hooks/useLocaleFormat.js";
import {
  activityTone,
  devicePresence,
  type DevicePresence,
} from "../lib/status.js";

type DeviceProps = {
  device: { enabled: boolean; online: boolean };
};

type Tone = "online" | "offline" | "disabled" | "error" | "neutral";

const TONE_CLASS: Record<Tone, string> = {
  online: "border-transparent bg-success/10 text-success",
  offline: "border-transparent bg-secondary text-offline",
  disabled: "border-transparent bg-secondary text-muted-foreground",
  error: "border-transparent bg-destructive/10 text-destructive",
  neutral: "border-transparent bg-secondary text-muted-foreground",
};

function StatusDot({
  empty,
  size = "default",
}: {
  empty: boolean;
  size?: "default" | "lg";
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "rounded-full",
        size === "lg" ? "size-2" : "size-1.5",
        empty ? "border border-current" : "bg-current",
      )}
    />
  );
}

function ToneBadge({
  tone,
  showDot,
  size = "default",
  children,
}: {
  tone: Tone;
  showDot?: boolean;
  size?: "default" | "lg";
  children: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn(
        TONE_CLASS[tone],
        size === "lg" && "h-7 gap-1.5 px-3 text-sm",
      )}
    >
      {showDot ? (
        <StatusDot empty={tone !== "online"} size={size} />
      ) : null}
      {children}
    </Badge>
  );
}

export function DeviceStatusBadge({ device }: DeviceProps) {
  const presence = devicePresence(device);
  return <PresenceBadge presence={presence} />;
}

export function PresenceBadge({ presence }: { presence: DevicePresence }) {
  const format = useLocaleFormat();
  return (
    <ToneBadge tone={presence} showDot>
      {format.presence(presence)}
    </ToneBadge>
  );
}

export function EventStatusBadge({ status }: { status: string }) {
  const format = useLocaleFormat();
  return (
    <ToneBadge tone={activityTone(status)}>{format.status(status)}</ToneBadge>
  );
}

export function RelayStatusBadge({
  status,
}: {
  status: "operational" | "unavailable";
}) {
  const { t } = useTranslation();
  const online = status === "operational";
  return (
    <ToneBadge tone={online ? "online" : "error"} showDot size="lg">
      {online
        ? t("relayStatus.operational")
        : t("relayStatus.unavailable")}
    </ToneBadge>
  );
}
