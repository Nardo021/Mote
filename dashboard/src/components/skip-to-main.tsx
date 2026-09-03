import { useTranslation } from "react-i18next";

export function SkipToMain() {
  const { t } = useTranslation();
  return (
    <a className="skip-link" href="#main">
      {t("common.skipToContent")}
    </a>
  );
}
