import type { AdminDevice, CommandResult } from "../types/device.js";
import { apiRequest } from "./client.js";

export function listDevices(): Promise<{ devices: AdminDevice[] }> {
  return apiRequest<{ devices: AdminDevice[] }>("/admin/api/devices");
}

export function getDevice(id: string): Promise<AdminDevice> {
  return apiRequest<AdminDevice>(`/admin/api/devices/${id}`);
}

export function lockDevice(id: string): Promise<CommandResult> {
  return apiRequest<CommandResult>(`/admin/api/devices/${id}/commands`, {
    method: "POST",
    body: { action: "lock" },
  });
}

export function rotateDeviceCredential(
  id: string,
): Promise<{ credential: string }> {
  return apiRequest<{ credential: string }>(
    `/admin/api/devices/${id}/credential/rotate`,
    {
      method: "POST",
      body: {},
    },
  );
}

export function disableDevice(id: string): Promise<AdminDevice> {
  return apiRequest<AdminDevice>(`/admin/api/devices/${id}/disable`, {
    method: "POST",
    body: {},
  });
}

export function enableDevice(id: string): Promise<AdminDevice> {
  return apiRequest<AdminDevice>(`/admin/api/devices/${id}/enable`, {
    method: "POST",
    body: {},
  });
}
