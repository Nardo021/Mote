import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import { titleCaseStatus } from "../lib/format.js";
import {
  activityTone,
  devicePresence,
  devicePresenceLabel,
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

function StatusDot({ empty }: { empty: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "size-1.5 rounded-full",
        empty ? "border border-current" : "bg-current",
      )}
    />
  );
}

function ToneBadge({
  tone,
  showDot,
  children,
}: {
  tone: Tone;
  showDot?: boolean;
  children: string;
}) {
  return (
    <Badge variant="outline" className={TONE_CLASS[tone]}>
      {showDot ? <StatusDot empty={tone !== "online"} /> : null}
      {children}
    </Badge>
  );
}

export function DeviceStatusBadge({ device }: DeviceProps) {
  const presence = devicePresence(device);
  return <PresenceBadge presence={presence} />;
}

export function PresenceBadge({ presence }: { presence: DevicePresence }) {
  return (
    <ToneBadge tone={presence} showDot>
      {devicePresenceLabel(presence)}
    </ToneBadge>
  );
}

export function EventStatusBadge({ status }: { status: string }) {
  return (
    <ToneBadge tone={activityTone(status)}>{titleCaseStatus(status)}</ToneBadge>
  );
}

export function RelayStatusBadge({
  status,
}: {
  status: "operational" | "unavailable";
}) {
  const online = status === "operational";
  return (
    <ToneBadge tone={online ? "online" : "error"} showDot>
      {online ? "Operational" : "Unavailable"}
    </ToneBadge>
  );
}
