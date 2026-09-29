import { useTranslation } from "react-i18next";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { InfoRow } from "../../components/InfoRow.js";
import { useAuth } from "../../hooks/useAuth.js";

export function SettingsProfilePage() {
  const { t } = useTranslation();
  const { user } = useAuth();

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>{t("settings.profile")}</CardTitle>
        <CardDescription>{t("settings.profileDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <InfoRow label={t("settings.username")}>{user?.username ?? "—"}</InfoRow>
      </CardContent>
    </Card>
  );
}
