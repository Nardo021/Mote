import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { useTranslation } from "react-i18next";

import { CopyButton } from "./CopyButton.js";

type SecretDialogProps = {
  title: string;
  secret: string;
  description?: string;
  onClose: () => void;
};

export function SecretDialog({
  title,
  secret,
  description,
  onClose,
}: SecretDialogProps) {
  const { t } = useTranslation();
  const [visible] = useState(secret);

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {description ?? t("tokens.secretHint")}
          </DialogDescription>
        </DialogHeader>
        <pre className="overflow-x-auto rounded-lg bg-muted px-3 py-2 font-mono text-xs break-all whitespace-pre-wrap">
          {visible}
        </pre>
        <DialogFooter>
          <CopyButton value={visible} />
          <Button type="button" onClick={onClose}>
            {t("common.done")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
