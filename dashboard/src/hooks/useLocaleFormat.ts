import { useTranslation } from "react-i18next";

import { localeTag } from "../i18n/index.js";
import {
  formatAbsoluteTime,
  formatDate,
  formatRelativeTime,
  titleCaseAction,
  titleCaseSource,
  titleCaseStatus,
} from "../lib/format.js";
import type { DevicePresence } from "../lib/status.js";

export function useLocaleFormat() {
  const { t, i18n } = useTranslation();
  const locale = localeTag(i18n.language);
  const copy = {
    justNow: t("time.justNow"),
    secondsAgo: (count: number) => t("time.secondsAgo", { count }),
    minuteAgo: t("time.minuteAgo"),
    minutesAgo: (count: number) => t("time.minutesAgo", { count }),
    hourAgo: t("time.hourAgo"),
    hoursAgo: (count: number) => t("time.hoursAgo", { count }),
  };

  return {
    locale,
    formatAbsoluteTime: (timestamp: number | null | undefined) =>
      formatAbsoluteTime(timestamp, locale),
    formatDate: (timestamp: number | null | undefined) =>
      formatDate(timestamp, locale),
    formatRelativeTime: (timestamp: number | null | undefined) =>
      formatRelativeTime(timestamp, Date.now(), locale, copy),
    action: (value: string) =>
      t(`action.${value}`, { defaultValue: titleCaseAction(value) }),
    status: (value: string) =>
      t(`status.${value}`, { defaultValue: titleCaseStatus(value) }),
    source: (value: string) =>
      t(`source.${value}`, { defaultValue: titleCaseSource(value) }),
    presence: (value: DevicePresence) => t(`presence.${value}`),
    errorCode: (code: string | null | undefined) =>
      code === null || code === undefined || code === ""
        ? null
        : t(`errors.${code}`, { defaultValue: code }),
  };
}
