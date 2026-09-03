import { useTranslation } from "react-i18next";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

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
        <Info label={t("settings.username")}>{user?.username ?? "—"}</Info>
      </CardContent>
    </Card>
  );
}

function Info({
  label,
  children,
}: {
  label: string;
  children: string;
}) {
  return (
    <div className="grid gap-1 sm:grid-cols-[200px_1fr]">
      <span className="text-muted-foreground">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
