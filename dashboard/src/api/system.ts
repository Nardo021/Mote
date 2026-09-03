import type { SystemResponse } from "../types/activity.js";
import { apiRequest } from "./client.js";

export function getSystem(): Promise<SystemResponse> {
  return apiRequest<SystemResponse>("/admin/api/system");
}
