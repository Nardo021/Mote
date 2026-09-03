import type { ActivityEvent } from "../types/activity.js";
import { apiRequest } from "./client.js";

export type ActivityQuery = {
  limit?: number;
  offset?: number;
  device_id?: string;
  status?: string;
  source?: string;
  action?: string;
};

export function listActivity(
  query: ActivityQuery = {},
): Promise<{ events: ActivityEvent[] }> {
  const params = new URLSearchParams();
  if (query.limit !== undefined) {
    params.set("limit", String(query.limit));
  }
  if (query.offset !== undefined) {
    params.set("offset", String(query.offset));
  }
  if (query.device_id) {
    params.set("device_id", query.device_id);
  }
  if (query.status) {
    params.set("status", query.status);
  }
  if (query.source) {
    params.set("source", query.source);
  }
  if (query.action) {
    params.set("action", query.action);
  }
  const suffix = params.size > 0 ? `?${params.toString()}` : "";
  return apiRequest<{ events: ActivityEvent[] }>(
    `/admin/api/activity${suffix}`,
  );
}
