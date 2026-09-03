import type { FastifyInstance } from "fastify";

import type { AppContext } from "../appContext.js";
import { invalidRequest } from "../utils/errors.js";

function parseObjectBody(body: unknown): Record<string, unknown> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw invalidRequest("JSON object body is required.");
  }
  return body as Record<string, unknown>;
}

function requiredString(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  if (typeof value !== "string") {
    throw invalidRequest(`${key} is required.`);
  }
  return value;
}

export async function registerPairRoutes(
  app: FastifyInstance,
  ctx: AppContext,
): Promise<void> {
  app.post("/v1/pair/requests", async (request) => {
    const body = parseObjectBody(request.body);
    const deviceId = requiredString(body, "device_id");
    const created = ctx.pairing.createRequest(
      deviceId,
      requiredString(body, "device_name"),
      request.ip,
    );
    request.log.info(
      { pair_request_id: created.id, device_id: deviceId },
      "pair request created",
    );
    return {
      request_id: created.id,
      pair_secret: created.pairSecret,
      expires_at: created.expiresAt,
    };
  });

  app.post("/v1/pair/requests/:id/cancel", async (request) => {
    const params = request.params as { id: string };
    const body = parseObjectBody(request.body);
    ctx.pairing.cancel(params.id, requiredString(body, "pair_secret"));
    request.log.info({ pair_request_id: params.id }, "pair request cancelled");
    return { ok: true };
  });
}

export function parseOptionalName(body: unknown): string | undefined {
  if (body === undefined || body === null || body === "") {
    return undefined;
  }
  const parsed = parseObjectBody(body);
  const value = parsed.name;
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw invalidRequest("name must be a string.");
  }
  return value;
}
