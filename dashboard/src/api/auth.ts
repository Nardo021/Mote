import type { SessionResponse } from "../types/api.js";
import { apiRequest } from "./client.js";

export function getSession(): Promise<SessionResponse> {
  return apiRequest<SessionResponse>("/admin/api/session", {
    allowUnauthorized: true,
  });
}

export function signIn(
  username: string,
  password: string,
): Promise<SessionResponse> {
  return apiRequest<SessionResponse>("/admin/api/session", {
    method: "POST",
    body: { username, password },
    allowUnauthorized: true,
  });
}

export function signOut(): Promise<{ authenticated: boolean }> {
  return apiRequest<{ authenticated: boolean }>("/admin/api/session", {
    method: "DELETE",
    allowUnauthorized: true,
  });
}

export function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<{ ok: boolean }> {
  return apiRequest<{ ok: boolean }>("/admin/api/account/password", {
    method: "POST",
    body: {
      current_password: currentPassword,
      new_password: newPassword,
    },
  });
}
