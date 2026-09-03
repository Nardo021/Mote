import type { FastifyInstance } from "fastify";

import type { AppContext } from "../appContext.js";
import { isUuid } from "../utils/ids.js";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderShortcutSetupPage(
  publicUrl: string,
  deviceId: string,
  icloudUrl: string | null,
): string {
  const id = isUuid(deviceId) ? deviceId : deviceId;
  const commandUrl = `${publicUrl.replace(/\/$/, "")}/v1/devices/${id}/commands`;
  const addShortcut = icloudUrl
    ? `<p><a href="${escapeHtml(icloudUrl)}">Add Shortcut</a> — paste the Device ID when asked. Leave the token blank until you create one in Tokens.</p>`
    : "";
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Mote Shortcut Setup</title>
  <style>
    :root { color-scheme: light dark; }
    body { font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 2rem auto; max-width: 40rem; padding: 0 1.25rem; }
    h1 { font-size: 1.25rem; font-weight: 600; }
    code, .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.86em; word-break: break-all; }
    label { display: block; color: #666; font-size: 0.8rem; margin: 1rem 0 0.25rem; }
    p { margin: 0.75rem 0; }
    .box { padding: 0.65rem 0.75rem; border: 1px solid color-mix(in srgb, currentColor 18%, transparent); border-radius: 8px; }
  </style>
</head>
<body>
  <h1>Add a Lock Shortcut</h1>
  <p>Create an Apple Shortcut that POSTs to Mote Relay. The Device ID is filled in below. The shortcut token is never included on this page — create one in the Dashboard Tokens page and paste it yourself.</p>
  <label>Device ID</label>
  <div class="box mono">${escapeHtml(id)}</div>
  <label>Command URL</label>
  <div class="box mono">${escapeHtml(commandUrl)}</div>
  <label>JSON body</label>
  <div class="box mono">{"action":"lock"}</div>
  <p>Add an Authorization header with the token from the Dashboard Tokens page. Do not put that value in the URL.</p>
  ${addShortcut}
</body>
</html>`;
}

export async function registerShortcutSetupPage(
  app: FastifyInstance,
  ctx: AppContext,
): Promise<void> {
  app.get("/s/:deviceId", async (request, reply) => {
    const params = request.params as { deviceId: string };
    return reply
      .type("text/html; charset=utf-8")
      .header("Cache-Control", "no-store")
      .send(
        renderShortcutSetupPage(
          ctx.config.publicUrl,
          params.deviceId,
          ctx.config.shortcutIcloudUrl,
        ),
      );
  });
}
