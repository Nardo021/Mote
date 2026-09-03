import type { FastifyInstance } from "fastify";

import { registerAdminRoutes } from "../admin/routes.js";
import type { AppContext } from "../appContext.js";
import { registerCommandRoutes } from "./commands.js";
import { registerDashboardStatic } from "./dashboard.js";
import { registerDeviceRoutes } from "./devices.js";
import { registerHealthRoutes } from "./health.js";
import { registerSecurityHeaders } from "./securityHeaders.js";

export async function registerRoutes(
  app: FastifyInstance,
  ctx: AppContext,
): Promise<void> {
  await registerSecurityHeaders(app);
  await registerHealthRoutes(app, ctx);
  await registerDeviceRoutes(app, ctx);
  await registerCommandRoutes(app, ctx);
  await registerAdminRoutes(app, ctx);
  await registerDashboardStatic(app, ctx);
}
