import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(rel) {
  return readFileSync(path.join(root, rel), "utf8");
}

const pbx = read("macos/Mote.xcodeproj/project.pbxproj");
const marketing = [...pbx.matchAll(/MARKETING_VERSION = ([^;]+);/g)].map((match) => match[1].trim());
if (new Set(marketing).size !== 1) {
  console.error(`MARKETING_VERSION values differ: ${marketing.join(", ")}`);
  process.exit(1);
}

const csproj = read("windows/src/Mote.Windows/Mote.Windows.csproj");
const windows = csproj.match(/<Version>([^<]+)<\/Version>/)?.[1].trim();
const mac = marketing[0];
if (!/^\d+\.\d+\.\d+$/.test(mac) || mac !== windows) {
  console.error(`Product versions differ or are malformed: mac=${mac} windows=${windows}`);
  process.exit(1);
}

const catalogue = JSON.parse(read("protocol/catalogue.json"));
if (catalogue.version !== 1) {
  console.error(`Protocol version must stay 1, found ${catalogue.version}`);
  process.exit(1);
}

const builds = [...pbx.matchAll(/CURRENT_PROJECT_VERSION = ([^;]+);/g)].map((match) => match[1].trim());
if (new Set(builds).size !== 1 || !/^\d+$/.test(builds[0]) || builds[0] === String(catalogue.version)) {
  console.error(`Mac build number must be one integer and must not equal the protocol version: ${builds.join(", ")}`);
  process.exit(1);
}

const tag = process.argv[2];
if (tag !== undefined && tag !== `v${mac}`) {
  console.error(`Tag ${tag} does not match product version ${mac}.`);
  process.exit(1);
}

process.stdout.write(`${mac}\n`);
