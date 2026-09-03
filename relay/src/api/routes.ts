import type { FastifyInstance } from "fastify";

import type { AppContext } from "../appContext.js";
import { registerCommandRoutes } from "./commands.js";
import { registerDeviceRoutes } from "./devices.js";
import { registerHealthRoutes } from "./health.js";

export async function registerRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  await registerHealthRoutes(app, ctx);
  await registerDeviceRoutes(app, ctx);
  await registerCommandRoutes(app, ctx);
}
