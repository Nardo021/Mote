import { useTranslation } from "react-i18next";

export function DevicePlatform({
  platform,
}: {
  platform: "macos" | "windows" | null;
}) {
  const { t } = useTranslation();
  if (platform === "macos") {
    return t("devices.platformMacos");
  }
  if (platform === "windows") {
    return t("devices.platformWindows");
  }
  return "—";
}
