import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const csproj = readFileSync(path.join(root, "windows/src/Mote.Windows/Mote.Windows.csproj"), "utf8");
const match = csproj.match(/<Version>([^<]+)<\/Version>/);
if (!match) {
  console.error("Windows project is missing a Version element.");
  process.exit(1);
}

const version = match[1].trim();
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error(`Windows release version is malformed: ${version}`);
  process.exit(1);
}

process.stdout.write(`${version}\n`);
