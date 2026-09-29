import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outdir = path.join(root, "dist", "worker");
const failures = [];

function walk(dir, acc) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      walk(full, acc);
    } else if (name.endsWith(".js")) {
      acc.push(full);
    }
  }
  return acc;
}

if (!statSync(outdir, { throwIfNoEntry: false })?.isDirectory()) {
  console.error("Worker bundle is missing. Run: npm run worker:dry-run");
  process.exit(1);
}

const files = walk(outdir, []);
if (files.length === 0) {
  failures.push("Wrangler dry-run did not write a JavaScript bundle.");
}

const combined = files.map((file) => readFileSync(file, "utf8")).join("\n");
if (!combined.includes("MoteRelay")) {
  failures.push("Worker bundle does not contain the MoteRelay Durable Object.");
}

const forbidden = [
  "fastify",
  "relay.example.com",
  "src/cli.ts",
  "docker-compose",
  "MOTE_DATABASE_PATH",
];
for (const needle of forbidden) {
  if (combined.includes(needle)) {
    failures.push(`Worker bundle contains removed runtime marker: ${needle}`);
  }
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(failure);
  }
  process.exit(1);
}

console.log(`Worker bundle ok (${files.length} js file${files.length === 1 ? "" : "s"}).`);
