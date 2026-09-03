import { existsSync, readFileSync } from "node:fs";
import { join, sep } from "node:path";

import fastifyStatic from "@fastify/static";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import type { AppContext } from "../appContext.js";

const DASHBOARD_PATHS = new Set([
  "/",
  "/login",
  "/devices",
  "/tokens",
  "/activity",
  "/settings",
]);

export function isDashboardNavigation(url: string): boolean {
  const path = url.split("?")[0] ?? "";
  if (DASHBOARD_PATHS.has(path)) {
    return true;
  }
  if (!path.startsWith("/devices/")) {
    return false;
  }
  const rest = path.slice("/devices/".length);
  return rest.length > 0 && !rest.includes("/");
}

export function isApiStylePath(url: string): boolean {
  const path = url.split("?")[0] ?? "";
  return (
    path === "/health" ||
    path === "/ready" ||
    path.startsWith("/v1/") ||
    path.startsWith("/admin/api/")
  );
}

export async function registerDashboardStatic(
  app: FastifyInstance,
  ctx: AppContext,
): Promise<boolean> {
  const indexPath = join(ctx.config.dashboardDist, "index.html");
  if (!existsSync(indexPath)) {
    return false;
  }

  const indexHtml = readFileSync(indexPath);

  await app.register(fastifyStatic, {
    root: ctx.config.dashboardDist,
    prefix: "/",
    wildcard: false,
    index: false,
    decorateReply: false,
    setHeaders(reply, filePath) {
      if (filePath.endsWith(".html")) {
        reply.header("Cache-Control", "no-cache");
        return;
      }
      if (filePath.includes(`${sep}assets${sep}`)) {
        reply.header("Cache-Control", "public, max-age=31536000, immutable");
      }
    },
  });

  const serveIndex = async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply
      .type("text/html; charset=utf-8")
      .header("Cache-Control", "no-cache")
      .send(indexHtml);
  };

  for (const path of DASHBOARD_PATHS) {
    app.get(path, serveIndex);
  }
  app.get("/devices/:id", serveIndex);
  return true;
}
