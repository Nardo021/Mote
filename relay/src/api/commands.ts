import type { FastifyInstance } from "fastify";

import type { AppContext } from "../appContext.js";
import {
  authenticateShortcutRequest,
  maybeTouchTokenLastUsed,
} from "../auth/shortcutAuth.js";
import { rateLimited } from "../utils/errors.js";

export async function registerCommandRoutes(
  app: FastifyInstance,
  ctx: AppContext,
): Promise<void> {
  app.post("/v1/devices/:deviceId/commands", async (request, reply) => {
    const client = authenticateShortcutRequest(request, ctx.tokenRepository);
    if (!ctx.rateLimiter.consume(client.tokenId)) {
      request.log.warn({ token_id: client.tokenId }, "rate limit triggered");
      throw rateLimited();
    }
    maybeTouchTokenLastUsed(
      { id: client.tokenId },
      ctx.tokenRepository,
      ctx.config,
    );
    const params = request.params as { deviceId: string };
    const result = await ctx.commands.submit(
      params.deviceId,
      request.body,
      "shortcut",
    );
    return reply.code(result.httpStatus).send(result.payload);
  });
}
