import type { FastifyInstance } from "fastify";

import type { AppContext } from "../appContext.js";
import { authenticateShortcutRequest } from "../auth/shortcutAuth.js";
import type { DeviceStatus } from "../devices/deviceTypes.js";

export async function registerDeviceRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  app.get("/v1/devices/:deviceId/status", async (request) => {
    authenticateShortcutRequest(request, ctx.tokenRepository);
    const params = request.params as { deviceId: string };
    const device = ctx.devices.requireDevice(params.deviceId);
    const status: DeviceStatus = {
      device_id: device.id,
      name: device.name,
      online: ctx.connections.isOnline(device.id),
      last_seen_at: device.lastSeenAt,
    };
    return status;
  });
}
