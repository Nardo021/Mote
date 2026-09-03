import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  approvePairRequest,
  listPairRequests,
  rejectPairRequest,
} from "../api/pair.js";
import { useAuth } from "../hooks/useAuth.js";
import { usePolling } from "../hooks/usePolling.js";
import type { PairRequest } from "../types/pair.js";

type PairingContextValue = {
  requests: PairRequest[];
  refresh: () => Promise<void>;
  approve: (request: PairRequest) => Promise<void>;
  reject: (request: PairRequest) => Promise<void>;
  busyId: string | null;
};

const PairingContext = createContext<PairingContextValue | undefined>(
  undefined,
);

export function PairingProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [requests, setRequests] = useState<PairRequest[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (user === null) {
      setRequests([]);
      return;
    }
    const result = await listPairRequests();
    setRequests(result.requests);
  }, [user]);

  useEffect(() => {
    void refresh().catch(() => {
      setRequests([]);
    });
  }, [refresh]);

  usePolling(
    () => refresh().catch(() => undefined),
    requests.length > 0 ? 2_000 : 5_000,
    user !== null,
  );

  const approve = useCallback(async (request: PairRequest) => {
    setBusyId(request.id);
    try {
      await approvePairRequest(request.id);
      await refresh();
    } finally {
      setBusyId(null);
    }
  }, [refresh]);

  const reject = useCallback(async (request: PairRequest) => {
    setBusyId(request.id);
    try {
      await rejectPairRequest(request.id);
      await refresh();
    } finally {
      setBusyId(null);
    }
  }, [refresh]);

  const value = useMemo(
    () => ({ requests, refresh, approve, reject, busyId }),
    [approve, busyId, refresh, reject, requests],
  );

  return (
    <PairingContext.Provider value={value}>{children}</PairingContext.Provider>
  );
}

export function usePairing(): PairingContextValue {
  const value = useContext(PairingContext);
  if (value === undefined) {
    throw new Error("usePairing must be used within PairingProvider");
  }
  return value;
}
