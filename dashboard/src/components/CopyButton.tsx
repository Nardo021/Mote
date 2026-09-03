import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";

export function CopyButton({
  value,
  label,
}: {
  value: string;
  label?: string;
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const idle = label ?? t("common.copy");

  return (
    <Button
      type="button"
      variant="outline"
      onClick={() => {
        void (async () => {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        })();
      }}
    >
      {copied ? t("common.copied") : idle}
    </Button>
  );
}
