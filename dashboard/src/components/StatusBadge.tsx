import {
  devicePresence,
  devicePresenceLabel,
  type DevicePresence,
} from "../lib/status.js";
import { titleCaseStatus } from "../lib/format.js";

type DeviceProps = {
  device: { enabled: boolean; online: boolean };
};

export function DeviceStatusBadge({ device }: DeviceProps) {
  const presence = devicePresence(device);
  return <PresenceBadge presence={presence} />;
}

export function PresenceBadge({ presence }: { presence: DevicePresence }) {
  const label = devicePresenceLabel(presence);
  const tone =
    presence === "online"
      ? "online"
      : presence === "disabled"
        ? "disabled"
        : "offline";
  const empty = presence !== "online";
  return (
    <span className={`status status-${tone}`}>
      <span
        className={`status-dot${empty ? " empty" : ""}`}
        aria-hidden="true"
      />
      {label}
    </span>
  );
}

export function EventStatusBadge({ status }: { status: string }) {
  const tone =
    status === "completed"
      ? "online"
      : status === "failed" || status === "timeout"
        ? "error"
        : "neutral";
  return (
    <span className={`status status-${tone}`}>{titleCaseStatus(status)}</span>
  );
}

export function RelayStatusBadge({
  status,
}: {
  status: "operational" | "unavailable";
}) {
  const online = status === "operational";
  return (
    <span className={`status ${online ? "status-online" : "status-error"}`}>
      <span
        className={`status-dot${online ? "" : " empty"}`}
        aria-hidden="true"
      />
      {online ? "Operational" : "Unavailable"}
    </span>
  );
}
