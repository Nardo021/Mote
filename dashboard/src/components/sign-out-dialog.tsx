import { useTranslation } from "react-i18next";

import { useAuth } from "../hooks/useAuth.js";
import { ConfirmDialog } from "./ConfirmDialog.js";

export function SignOutDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const { signOut } = useAuth();

  if (!open) {
    return null;
  }

  return (
    <ConfirmDialog
      title={t("settings.signOutTitle")}
      description={t("settings.signOutDescription")}
      confirmLabel={t("common.signOut")}
      onCancel={() => onOpenChange(false)}
      onConfirm={() => {
        void signOut();
      }}
    />
  );
}
