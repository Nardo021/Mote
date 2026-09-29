import type { AdminToken, CommandClientKind, CreatedToken } from "../types/token.js";
import { apiRequest } from "./client.js";

export type CreateTokenInput = {
  name: string;
  clientKind: CommandClientKind;
  deviceId: string;
};

export function listTokens(): Promise<{ tokens: AdminToken[] }> {
  return apiRequest<{ tokens: AdminToken[] }>("/admin/api/tokens");
}

export function createToken(input: CreateTokenInput): Promise<CreatedToken> {
  return apiRequest<CreatedToken>("/admin/api/tokens", {
    method: "POST",
    body: {
      name: input.name,
      client_kind: input.clientKind,
      device_id: input.deviceId,
    },
  });
}

export function rotateToken(id: string): Promise<CreatedToken> {
  return apiRequest<CreatedToken>(`/admin/api/tokens/${id}/rotate`, {
    method: "POST",
    body: {},
  });
}

export function disableToken(id: string): Promise<AdminToken> {
  return apiRequest<AdminToken>(`/admin/api/tokens/${id}/disable`, {
    method: "POST",
    body: {},
  });
}

export function enableToken(id: string): Promise<AdminToken> {
  return apiRequest<AdminToken>(`/admin/api/tokens/${id}/enable`, {
    method: "POST",
    body: {},
  });
}
