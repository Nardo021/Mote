import type { FastifyInstance } from "fastify";

import type { AppContext } from "../appContext.js";

export async function registerHealthRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  app.get("/health", async () => ({ status: "ok" }));

  app.get("/ready", async (_request, reply) => {
    if (!ctx.ready) {
      return reply.code(503).send({ status: "not_ready" });
    }
    try {
      ctx.db.prepare("SELECT 1").get();
    } catch {
      return reply.code(503).send({ status: "not_ready" });
    }
    return { status: "ok" };
  });
}
