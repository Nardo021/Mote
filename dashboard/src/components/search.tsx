import { SearchIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { useSearch } from "../context/search-provider.js";

export function Search({ className }: { className?: string }) {
  const { t } = useTranslation();
  const { setOpen } = useSearch();

  return (
    <Button
      type="button"
      variant="outline"
      className={cn(
        "relative h-8 w-full justify-start font-normal text-muted-foreground sm:w-40 lg:w-52",
        className,
      )}
      aria-keyshortcuts="Meta+K Control+K"
      onClick={() => setOpen(true)}
    >
      <SearchIcon data-icon="inline-start" />
      <span>{t("common.search")}</span>
      <kbd className="pointer-events-none ms-auto hidden h-5 items-center rounded border bg-muted px-1.5 font-mono text-[10px] sm:flex">
        ⌘K
      </kbd>
    </Button>
  );
}
