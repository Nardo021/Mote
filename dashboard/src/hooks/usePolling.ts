import { useEffect, useRef } from "react";

export function usePolling(
  callback: () => Promise<void> | void,
  intervalMs: number,
  enabled = true,
): void {
  const saved = useRef(callback);
  saved.current = callback;

  useEffect(() => {
    if (!enabled) {
      return;
    }
    let cancelled = false;
    const tick = async () => {
      if (cancelled || document.hidden) {
        return;
      }
      await saved.current();
    };
    const id = window.setInterval(() => {
      void tick();
    }, intervalMs);
    const onVisibility = () => {
      if (!document.hidden) {
        void tick();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled, intervalMs]);
}
