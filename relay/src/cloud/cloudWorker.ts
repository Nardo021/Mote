/**
 * Isolated hosted Cloud Worker module.
 *
 * Deliberately NOT the personal worker at relay/src/worker/index.ts.
 * The default handler is separate from the Durable Object export so Node's
 * offline HTTP tests can import stagingWorker without cloudflare:workers.
 */
export { default } from "./stagingWorker.js";
export { MoteCloudTenant } from "./tenantDurableObject.js";
