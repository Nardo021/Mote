import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { useAuth } from "../hooks/useAuth.js";
import {
  ADMIN_EVENT_TOPICS,
  isAdminEventTopic,
  parseAdminEventPayload,
  type AdminEventTopic,
} from "./topics.js";

type AdminEventsContextValue = {
  live: boolean;
  subscribe: (
    topics: readonly AdminEventTopic[],
    onEvent: () => void,
  ) => () => void;
};

const AdminEventsContext = createContext<AdminEventsContextValue | undefined>(
  undefined,
);

type Subscriber = {
  topics: ReadonlySet<AdminEventTopic>;
  onEvent: () => void;
};

export function AdminEventsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [live, setLive] = useState(false);
  const [generation, setGeneration] = useState(0);
  const sourceRef = useRef<EventSource | null>(null);
  const subscribersRef = useRef(new Set<Subscriber>());

  const dispatch = useCallback((topics: readonly AdminEventTopic[]) => {
    for (const subscriber of subscribersRef.current) {
      if (topics.some((topic) => subscriber.topics.has(topic))) {
        subscriber.onEvent();
      }
    }
  }, []);

  const subscribe = useCallback(
    (topics: readonly AdminEventTopic[], onEvent: () => void) => {
      const subscriber: Subscriber = {
        topics: new Set(topics),
        onEvent,
      };
      subscribersRef.current.add(subscriber);
      return () => {
        subscribersRef.current.delete(subscriber);
      };
    },
    [],
  );

  useEffect(() => {
    if (user === null) {
      sourceRef.current?.close();
      sourceRef.current = null;
      setLive(false);
      return;
    }

    const source = new EventSource("/admin/api/events", {
      withCredentials: true,
    });
    sourceRef.current = source;

    source.onopen = () => {
      setLive(true);
    };
    source.onerror = () => {
      setLive(false);
    };
    source.onmessage = (event: MessageEvent<string>) => {
      const topics = parseAdminEventPayload(event.data);
      if (topics !== null) {
        dispatch(topics);
      }
    };

    return () => {
      source.close();
      if (sourceRef.current === source) {
        sourceRef.current = null;
      }
      setLive(false);
    };
  }, [dispatch, generation, user]);

  useEffect(() => {
    if (user === null) {
      return;
    }
    const onVisibility = () => {
      if (document.hidden) {
        return;
      }
      const source = sourceRef.current;
      if (source === null || source.readyState !== EventSource.OPEN) {
        setGeneration((current) => current + 1);
        dispatch(ADMIN_EVENT_TOPICS);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [dispatch, user]);

  const value = useMemo(() => ({ live, subscribe }), [live, subscribe]);

  return (
    <AdminEventsContext.Provider value={value}>
      {children}
    </AdminEventsContext.Provider>
  );
}

export function useAdminEvents(
  topics: readonly AdminEventTopic[],
  refresh: () => void,
): { live: boolean } {
  const value = useContext(AdminEventsContext);
  if (value === undefined) {
    throw new Error("useAdminEvents must be used within AdminEventsProvider");
  }
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  const topicKey = topics.join(",");

  useEffect(() => {
    const wanted = topicKey.split(",").filter(isAdminEventTopic);
    if (wanted.length === 0) {
      return;
    }
    return value.subscribe(wanted, () => {
      refreshRef.current();
    });
  }, [topicKey, value]);

  return { live: value.live };
}
