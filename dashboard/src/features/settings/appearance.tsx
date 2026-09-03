import { useTranslation } from "react-i18next";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { ThemeSwitch } from "../../components/theme-switch.js";

export function SettingsAppearancePage() {
  const { t } = useTranslation();
  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>{t("settings.appearance")}</CardTitle>
        <CardDescription>{t("settings.appearanceDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        <ThemeSwitch />
      </CardContent>
    </Card>
  );
}
