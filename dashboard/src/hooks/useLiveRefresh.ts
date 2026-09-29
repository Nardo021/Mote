import { useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { useAdminEvents } from "../events/AdminEventsProvider.js";
import { livePollInterval, type AdminEventTopic } from "../events/topics.js";
import { translateError } from "../lib/errors.js";
import { usePolling } from "./usePolling.js";

export function useLiveRefresh(
  refresh: () => Promise<void>,
  options: {
    topics: readonly AdminEventTopic[];
    errorKey: string;
    ready: boolean;
    offlinePollMs?: number;
  },
): void {
  const { t } = useTranslation();
  const { topics, errorKey, ready, offlinePollMs = 5_000 } = options;

  useEffect(() => {
    void refresh().catch((cause: unknown) => {
      toast.error(translateError(cause, t, errorKey));
    });
  }, [errorKey, refresh, t]);

  const silentRefresh = useCallback(() => {
    void refresh().catch(() => undefined);
  }, [refresh]);
  const { live } = useAdminEvents(topics, silentRefresh);
  usePolling(silentRefresh, livePollInterval(live, offlinePollMs), ready);
}
