import type { AppContext } from "../appContext.js";

export function relayOperationalStatus(
  ctx: AppContext,
): "operational" | "unavailable" {
  if (!ctx.ready) {
    return "unavailable";
  }
  try {
    ctx.db.prepare("SELECT 1").get();
  } catch {
    return "unavailable";
  }
  return "operational";
}
