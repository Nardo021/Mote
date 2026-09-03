import { useEffect, useId, useRef, useState } from "react";

import { CopyButton } from "./CopyButton.js";

type SecretDialogProps = {
  title: string;
  secret: string;
  onClose: () => void;
};

export function SecretDialog({ title, secret, onClose }: SecretDialogProps) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const [visible] = useState(secret);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="dialog-backdrop">
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <h2 id={titleId}>{title}</h2>
        <p>
          Copy this secret now. It will not be shown again. Treat it as a
          credential.
        </p>
        <div className="secret-box mono">{visible}</div>
        <div className="dialog-actions">
          <CopyButton value={visible} />
          <button
            type="button"
            className="btn btn-primary"
            ref={closeRef}
            onClick={onClose}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
