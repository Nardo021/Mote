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
        "group relative h-8 w-full flex-1 justify-start bg-muted/25 font-normal text-muted-foreground shadow-none sm:w-40 sm:pe-12 md:flex-none lg:w-52 xl:w-64",
        className,
      )}
      aria-keyshortcuts="Meta+K Control+K"
      onClick={() => setOpen(true)}
    >
      <SearchIcon data-icon="inline-start" />
      <span>{t("common.search")}</span>
      <kbd className="pointer-events-none absolute inset-e-[0.3rem] top-[0.3rem] hidden h-5 items-center rounded border bg-muted px-1.5 font-mono text-[10px] sm:flex">
        ⌘K
      </kbd>
    </Button>
  );
}
