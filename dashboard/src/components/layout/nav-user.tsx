import { ChevronsUpDown, Languages, LogOut } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

import { useAuth } from "../../hooks/useAuth.js";
import { changeAppLocale, type AppLocale } from "../../i18n/index.js";
import { ConfirmDialog } from "../ConfirmDialog.js";

export function NavUser() {
  const { t, i18n } = useTranslation();
  const { user, signOut } = useAuth();
  const { isMobile } = useSidebar();
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const username = user?.username ?? "—";
  const current = i18n.language.startsWith("zh") ? "zh" : "en";
  const initials = username.slice(0, 2).toUpperCase();

  async function onLocale(locale: AppLocale) {
    await changeAppLocale(locale);
  }

  return (
    <>
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <SidebarMenuButton
                  size="lg"
                  className="data-popup-open:bg-sidebar-accent data-popup-open:text-sidebar-accent-foreground"
                />
              }
            >
              <Avatar className="size-8 rounded-lg">
                <AvatarFallback className="rounded-lg">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-start text-sm leading-tight">
                <span className="truncate font-semibold">{username}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {t("common.administrator")}
                </span>
              </div>
              <ChevronsUpDown />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              side={isMobile ? "bottom" : "right"}
              align="end"
              className="min-w-56"
            >
              <DropdownMenuGroup>
                <DropdownMenuLabel>{t("language.label")}</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => void onLocale("zh")}>
                  <Languages />
                  {t("language.zh")}
                  {current === "zh" ? " ·" : null}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => void onLocale("en")}>
                  <Languages />
                  {t("language.en")}
                  {current === "en" ? " ·" : null}
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => setConfirmSignOut(true)}
                >
                  <LogOut />
                  {t("common.signOut")}
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>
      {confirmSignOut ? (
        <ConfirmDialog
          title={t("settings.signOutTitle")}
          description={t("settings.signOutDescription")}
          confirmLabel={t("common.signOut")}
          onCancel={() => setConfirmSignOut(false)}
          onConfirm={() => {
            void signOut();
          }}
        />
      ) : null}
    </>
  );
}
