import type { OverviewResponse } from "../types/activity.js";
import { apiRequest } from "./client.js";

export function getOverview(): Promise<OverviewResponse> {
  return apiRequest<OverviewResponse>("/admin/api/overview");
}
