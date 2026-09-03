import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

import { usePairing } from "../pairing/PairingProvider.js";

export function PairingBanner() {
  const { t } = useTranslation();
  const { requests } = usePairing();
  const first = requests[0];
  if (first === undefined) {
    return null;
  }

  return (
    <div className="px-4 pt-2 md:px-6">
      <Alert>
        <AlertTitle>{t("pair.bannerTitle")}</AlertTitle>
        <AlertDescription>
          {t("pair.bannerDescription", { name: first.device_name })}
        </AlertDescription>
        <AlertAction>
          <Button size="sm" render={<Link to="/devices" />}>
            {t("pair.review")}
          </Button>
        </AlertAction>
      </Alert>
    </div>
  );
}
