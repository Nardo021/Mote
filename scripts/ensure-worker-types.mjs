import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const wrangler = path.join(root, "node_modules", "wrangler", "bin", "wrangler.js");

if (!existsSync(wrangler)) {
  console.error("Wrangler is not installed. From the repository root, run: npm ci");
  process.exit(1);
}

const result = spawnSync(
  process.execPath,
  [
    wrangler,
    "types",
    "relay/worker-configuration.d.ts",
    "--env-interface",
    "CloudflareBindings",
  ],
  { cwd: root, stdio: "inherit" },
);

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
