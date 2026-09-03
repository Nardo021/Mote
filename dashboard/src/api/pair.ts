import type { PairApproval, PairRequest } from "../types/pair.js";
import { apiRequest } from "./client.js";

export function listPairRequests(): Promise<{ requests: PairRequest[] }> {
  return apiRequest<{ requests: PairRequest[] }>("/admin/api/pair-requests");
}

export function approvePairRequest(
  id: string,
  name?: string,
): Promise<PairApproval> {
  return apiRequest<PairApproval>(`/admin/api/pair-requests/${id}/approve`, {
    method: "POST",
    body: name === undefined ? {} : { name },
  });
}

export function rejectPairRequest(id: string): Promise<{ ok: boolean }> {
  return apiRequest<{ ok: boolean }>(`/admin/api/pair-requests/${id}/reject`, {
    method: "POST",
    body: {},
  });
}
