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

import { CopyButton } from "./CopyButton.js";

type SecretDialogProps = {
  title: string;
  secret: string;
  onClose: () => void;
};

export function SecretDialog({ title, secret, onClose }: SecretDialogProps) {
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
            Copy this secret now. It will not be shown again. Treat it as a
            credential.
          </DialogDescription>
        </DialogHeader>
        <pre className="overflow-x-auto rounded-lg bg-muted px-3 py-2 font-mono text-xs break-all whitespace-pre-wrap">
          {visible}
        </pre>
        <DialogFooter>
          <CopyButton value={visible} />
          <Button type="button" onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
