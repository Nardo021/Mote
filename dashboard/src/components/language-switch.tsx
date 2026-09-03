import { Languages } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { changeAppLocale, type AppLocale } from "../i18n/index.js";

export function LanguageSwitch() {
  const { t, i18n } = useTranslation();
  const current = i18n.language.startsWith("zh") ? "zh" : "en";

  async function onSelect(locale: AppLocale) {
    await changeAppLocale(locale);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button type="button" variant="ghost" size="icon" />
        }
        aria-label={t("language.label")}
      >
        <Languages />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          <DropdownMenuItem
            onClick={() => void onSelect("zh")}
            data-checked={current === "zh" ? true : undefined}
          >
            {t("language.zh")}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => void onSelect("en")}
            data-checked={current === "en" ? true : undefined}
          >
            {t("language.en")}
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
