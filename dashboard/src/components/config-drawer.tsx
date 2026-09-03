import { type ComponentType, type SVGProps } from "react";
import { CircleCheck, RotateCcw, Settings } from "lucide-react";
import { Radio as RadioPrimitive } from "@base-ui/react/radio";
import { useTheme } from "next-themes";
import { useTranslation } from "react-i18next";

import { IconLayoutCompact } from "@/assets/custom/icon-layout-compact";
import { IconLayoutDefault } from "@/assets/custom/icon-layout-default";
import { IconLayoutFull } from "@/assets/custom/icon-layout-full";
import { IconSidebarFloating } from "@/assets/custom/icon-sidebar-floating";
import { IconSidebarInset } from "@/assets/custom/icon-sidebar-inset";
import { IconSidebarSidebar } from "@/assets/custom/icon-sidebar-sidebar";
import { IconThemeDark } from "@/assets/custom/icon-theme-dark";
import { IconThemeLight } from "@/assets/custom/icon-theme-light";
import { IconThemeSystem } from "@/assets/custom/icon-theme-system";
import { Button } from "@/components/ui/button";
import { RadioGroup } from "@/components/ui/radio-group";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

import { type Collapsible, useLayout } from "../context/layout-provider.js";

type PreviewIcon = ComponentType<SVGProps<SVGSVGElement>>;

export function ConfigDrawer() {
  const { t } = useTranslation();
  const { setOpen } = useSidebar();
  const { setTheme } = useTheme();
  const { resetLayout } = useLayout();

  return (
    <Sheet>
      <SheetTrigger
        render={
          <Button
            size="icon"
            variant="ghost"
            aria-label={t("config.open")}
            className="rounded-full"
          />
        }
      >
        <Settings />
      </SheetTrigger>
      <SheetContent className="flex flex-col">
        <SheetHeader className="pb-0 text-start">
          <SheetTitle>{t("config.title")}</SheetTitle>
          <SheetDescription>{t("config.description")}</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-6 overflow-y-auto px-4">
          <ThemeConfig />
          <SidebarConfig />
          <LayoutConfig />
        </div>
        <SheetFooter className="gap-2">
          <Button
            variant="destructive"
            onClick={() => {
              setOpen(true);
              setTheme("system");
              resetLayout();
            }}
            aria-label={t("config.resetAll")}
          >
            {t("config.reset")}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function SectionTitle({
  title,
  showReset,
  onReset,
  resetLabel,
}: {
  title: string;
  showReset: boolean;
  onReset: () => void;
  resetLabel: string;
}) {
  return (
    <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
      {title}
      {showReset ? (
        <Button
          type="button"
          size="icon"
          variant="secondary"
          className="size-4 rounded-full"
          onClick={onReset}
          aria-label={resetLabel}
        >
          <RotateCcw className="size-3" />
        </Button>
      ) : null}
    </div>
  );
}

function PreviewRadio({
  value,
  label,
  icon: Icon,
  isTheme = false,
}: {
  value: string;
  label: string;
  icon: PreviewIcon;
  isTheme?: boolean;
}) {
  return (
    <RadioPrimitive.Root value={value} className="group outline-none" aria-label={label}>
      <div
        className={cn(
          "relative rounded-[6px] ring-1 ring-border transition duration-200",
          "group-data-checked:shadow-2xl group-data-checked:ring-primary",
          "group-focus-visible:ring-2",
        )}
      >
        <CircleCheck
          className={cn(
            "absolute top-0 right-0 size-6 translate-x-1/2 -translate-y-1/2 fill-primary stroke-white",
            "group-data-unchecked:hidden",
          )}
        />
        <Icon
          className={cn(
            !isTheme &&
              "fill-primary stroke-primary group-data-unchecked:fill-muted-foreground group-data-unchecked:stroke-muted-foreground",
          )}
        />
      </div>
      <div className="mt-1 text-xs">{label}</div>
    </RadioPrimitive.Root>
  );
}

function ThemeConfig() {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();
  const current = theme ?? "system";
  return (
    <div>
      <SectionTitle
        title={t("theme.label")}
        showReset={current !== "system"}
        onReset={() => setTheme("system")}
        resetLabel={t("config.resetTheme")}
      />
      <RadioGroup
        value={current}
        onValueChange={(value) => {
          if (typeof value === "string") {
            setTheme(value);
          }
        }}
        className="grid w-full max-w-md grid-cols-3 gap-4"
        aria-label={t("theme.label")}
      >
        <PreviewRadio
          value="system"
          label={t("theme.system")}
          icon={IconThemeSystem}
          isTheme
        />
        <PreviewRadio
          value="light"
          label={t("theme.light")}
          icon={IconThemeLight}
          isTheme
        />
        <PreviewRadio
          value="dark"
          label={t("theme.dark")}
          icon={IconThemeDark}
          isTheme
        />
      </RadioGroup>
    </div>
  );
}

function SidebarConfig() {
  const { t } = useTranslation();
  const { defaultVariant, variant, setVariant } = useLayout();
  return (
    <div className="max-md:hidden">
      <SectionTitle
        title={t("config.sidebar")}
        showReset={defaultVariant !== variant}
        onReset={() => setVariant(defaultVariant)}
        resetLabel={t("config.resetSidebar")}
      />
      <RadioGroup
        value={variant}
        onValueChange={(value) => {
          if (value === "inset" || value === "floating" || value === "sidebar") {
            setVariant(value);
          }
        }}
        className="grid w-full max-w-md grid-cols-3 gap-4"
        aria-label={t("config.sidebar")}
      >
        <PreviewRadio value="inset" label={t("config.inset")} icon={IconSidebarInset} />
        <PreviewRadio
          value="floating"
          label={t("config.floating")}
          icon={IconSidebarFloating}
        />
        <PreviewRadio
          value="sidebar"
          label={t("config.sidebarStyle")}
          icon={IconSidebarSidebar}
        />
      </RadioGroup>
    </div>
  );
}

function LayoutConfig() {
  const { t } = useTranslation();
  const { open, setOpen } = useSidebar();
  const { defaultCollapsible, collapsible, setCollapsible } = useLayout();
  const radioState = open ? "default" : collapsible;

  return (
    <div className="max-md:hidden">
      <SectionTitle
        title={t("config.layout")}
        showReset={radioState !== "default"}
        onReset={() => {
          setOpen(true);
          setCollapsible(defaultCollapsible);
        }}
        resetLabel={t("config.resetLayout")}
      />
      <RadioGroup
        value={radioState}
        onValueChange={(value) => {
          if (value === "default") {
            setOpen(true);
            return;
          }
          if (value === "icon" || value === "offcanvas" || value === "none") {
            setOpen(false);
            setCollapsible(value as Collapsible);
          }
        }}
        className="grid w-full max-w-md grid-cols-3 gap-4"
        aria-label={t("config.layout")}
      >
        <PreviewRadio
          value="default"
          label={t("config.layoutDefault")}
          icon={IconLayoutDefault}
        />
        <PreviewRadio
          value="icon"
          label={t("config.layoutCompact")}
          icon={IconLayoutCompact}
        />
        <PreviewRadio
          value="offcanvas"
          label={t("config.layoutFull")}
          icon={IconLayoutFull}
        />
      </RadioGroup>
    </div>
  );
}
