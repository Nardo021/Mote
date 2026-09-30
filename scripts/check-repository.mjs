import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

function fail(message) {
  failures.push(message);
}

function read(rel) {
  return readFileSync(path.join(root, rel), "utf8");
}

function relFrom(full) {
  return path.relative(root, full).split(path.sep).join("/");
}

const skipDirs = new Set([
  "node_modules",
  "dist",
  ".git",
  "DerivedData",
  "coverage",
  ".wrangler",
  "bin",
  "obj",
  "TestResults",
]);
const textExt = new Set([
  ".swift",
  ".cs",
  ".csproj",
  ".xaml",
  ".ts",
  ".tsx",
  ".js",
  ".mjs",
  ".json",
  ".md",
  ".yml",
  ".yaml",
  ".plist",
  ".entitlements",
  ".pbxproj",
  ".xcscheme",
  ".xctestplan",
  ".jsonc",
  ".example",
]);

function walk(dir, acc = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (skipDirs.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, acc);
      continue;
    }
    if (!textExt.has(path.extname(entry.name))) continue;
    if (entry.name === "package-lock.json" || entry.name === "worker-configuration.d.ts") continue;
    acc.push(full);
  }
  return acc;
}

const pbx = read("macos/Mote.xcodeproj/project.pbxproj");
const bundleIDs = [...pbx.matchAll(/PRODUCT_BUNDLE_IDENTIFIER = ([^;]+);/g)].map((match) =>
  match[1].trim(),
);
const bundleSet = new Set(bundleIDs);
const expectedBundles = new Set(["com.nardo021.mote", "com.nardo021.mote.tests"]);
if (bundleSet.size !== expectedBundles.size || [...bundleSet].some((id) => !expectedBundles.has(id))) {
  fail(`PRODUCT_BUNDLE_IDENTIFIER set is ${[...bundleSet].join(", ")}`);
}

const marketing = [...pbx.matchAll(/MARKETING_VERSION = ([^;]+);/g)].map((match) => match[1].trim());
if (new Set(marketing).size !== 1) {
  fail(`MARKETING_VERSION values differ: ${marketing.join(", ")}`);
}
if (marketing[0] === "1") {
  fail("MARKETING_VERSION must stay distinct from Protocol v1.");
}

const builds = [...pbx.matchAll(/CURRENT_PROJECT_VERSION = ([^;]+);/g)].map((match) => match[1].trim());
if (new Set(builds).size !== 1) {
  fail(`CURRENT_PROJECT_VERSION values differ: ${builds.join(", ")}`);
}

if (!pbx.includes("ENABLE_HARDENED_RUNTIME = YES") || pbx.includes("ENABLE_HARDENED_RUNTIME = NO")) {
  fail("Hardened Runtime must stay enabled.");
}
if (!pbx.includes("ENABLE_APP_SANDBOX = NO") || pbx.includes("ENABLE_APP_SANDBOX = YES")) {
  fail("App Sandbox must stay disabled.");
}
if (pbx.includes("disable-library-validation")) {
  fail("Hardened Runtime library validation must not be disabled.");
}

const entitlements = read("macos/Mote/Resources/Mote.entitlements");
if (!entitlements.includes("com.apple.security.app-sandbox") || !entitlements.includes("<false/>")) {
  fail("Entitlements must keep App Sandbox false.");
}
if (entitlements.includes("disable-library-validation") || entitlements.includes("<true/>")) {
  fail("Entitlements must stay minimal: sandbox off, no extra exceptions.");
}

const info = read("macos/Mote/Resources/Info.plist");
if (!info.includes("$(PRODUCT_BUNDLE_IDENTIFIER)") || !info.includes("$(MARKETING_VERSION)")) {
  fail("Info.plist must take bundle ID and version from the Xcode project.");
}

const identity = read("macos/Mote/Utilities/AppIdentity.swift");
for (const line of [
  'static let bundleID = "com.nardo021.mote"',
  'static let legacyBundleID = "com.example.mote"',
  "static let keychainService = bundleID",
  "static let legacyKeychainService = legacyBundleID",
  "static let logSubsystem = bundleID",
]) {
  if (!identity.includes(line)) {
    fail(`AppIdentity is missing ${line}`);
  }
}
if (!read("macos/Mote/Utilities/Logger.swift").includes("AppIdentity.logSubsystem")) {
  fail("OSLog subsystem must come from AppIdentity.");
}

const catalogue = JSON.parse(read("protocol/catalogue.json"));
if (catalogue.version !== 1) {
  fail("Protocol catalogue version must stay 1.");
}

const scheme = read("macos/Mote.xcodeproj/xcshareddata/xcschemes/Mote.xcscheme");
const safeAt = scheme.indexOf("Mote-Safe.xctestplan");
const sideAt = scheme.indexOf("Mote-SideEffect.xctestplan");
const plansEnd = scheme.indexOf("</TestPlans>");
if (safeAt < 0 || sideAt < 0 || plansEnd < sideAt) {
  fail("Mote scheme must reference the safe and side-effect test plans.");
} else if (!scheme.slice(safeAt, sideAt).includes('default = "YES"')) {
  fail("Mote-Safe.xctestplan must be the default test plan.");
} else if (scheme.slice(sideAt, plansEnd).includes('default = "YES"')) {
  fail("Mote-SideEffect.xctestplan must not be the default test plan.");
}

const safePlan = JSON.parse(
  read("macos/Mote.xcodeproj/xcshareddata/xctestplans/Mote-Safe.xctestplan"),
);
const safeTarget = safePlan.testTargets?.[0] ?? {};
if (safeTarget.selectedTests) {
  fail("The safe test plan must run the MoteTests target, not a hand-picked subset.");
}
if (!safeTarget.skippedTests?.includes("LockActionLiveTests")) {
  fail("The safe test plan must skip LockActionLiveTests.");
}
const safeEnv = safePlan.defaultOptions?.environmentVariableEntries ?? [];
if (!safeEnv.some((entry) => entry.key === "MOTE_RUN_SIDE_EFFECT_TESTS" && entry.value === "0")) {
  fail("The safe test plan must set MOTE_RUN_SIDE_EFFECT_TESTS=0.");
}

const sidePlan = JSON.parse(
  read("macos/Mote.xcodeproj/xcshareddata/xctestplans/Mote-SideEffect.xctestplan"),
);
const selected = sidePlan.testTargets?.[0]?.selectedTests ?? [];
if (selected.length !== 1 || selected[0] !== "LockActionLiveTests") {
  fail("The side-effect test plan must select only LockActionLiveTests.");
}

const liveTests = read("macos/MoteTests/LockActionLiveTests.swift");
if (!liveTests.includes("MOTE_RUN_SIDE_EFFECT_TESTS") || !liveTests.includes("XCTSkipUnless")) {
  fail("LockActionLiveTests must skip unless MOTE_RUN_SIDE_EFFECT_TESTS=1.");
}
if (liveTests.includes("lockImmediate") || liveTests.includes("postLockKeyEvents")) {
  fail("LockActionLiveTests must not call the real lock.");
}

const forbiddenInSafeTests = [
  "LoginSession.lockImmediate",
  "postLockKeyEvents",
  "SACLockScreenImmediate",
  "LoginItemService.setEnabled",
  "setStartAtLogin(",
];
for (const file of readdirSync(path.join(root, "macos", "MoteTests"))) {
  if (!file.endsWith(".swift") || file === "LockActionLiveTests.swift") continue;
  const text = read(`macos/MoteTests/${file}`);
  for (const needle of forbiddenInSafeTests) {
    if (text.includes(needle)) {
      fail(`${file} is in the safe target but contains ${needle}`);
    }
  }
}

const legacyContext = /legacy|旧|历史|占位|迁移|一次性|migration|one-way|placeholder/i;
for (const file of walk(root)) {
  const rel = relFrom(file);
  if (rel === "scripts/check-repository.mjs") continue;
  const text = readFileSync(file, "utf8");
  if (text.includes("\0")) continue;

  if (rel.startsWith("macos/Mote/") && text.includes("relay.example.com")) {
    fail(`${rel} compiles relay.example.com into the Mac app.`);
  }
  if (rel.startsWith("windows/src/") && text.includes("relay.example.com")) {
    fail(`${rel} compiles relay.example.com into the Windows app.`);
  }
  if (rel.startsWith("relay/src/") && text.includes("relay.example.com")) {
    fail(`${rel} compiles relay.example.com into Relay.`);
  }
  if (
    rel.startsWith("dashboard/src/") &&
    !rel.endsWith(".test.ts") &&
    text.includes("relay.example.com")
  ) {
    fail(`${rel} compiles relay.example.com into the Dashboard.`);
  }
  const exampleLabel = /示例|占位|placeholder|URL 形状|example host/i;
  if (rel.endsWith(".md") && text.includes("relay.example.com") && !exampleLabel.test(text)) {
    fail(`${rel} uses relay.example.com without labelling it as an example.`);
  }
  if (text.includes("com.example.mote")) {
    const lines = text.split(/\r?\n/);
    lines.forEach((line, index) => {
      if (!line.includes("com.example.mote")) return;
      const window = lines.slice(Math.max(0, index - 3), index + 1).join("\n");
      if (!legacyContext.test(window)) {
        fail(`${rel}:${index + 1} uses com.example.mote outside a legacy migration context.`);
      }
    });
  }
}

for (const rel of [
  "README.md",
  "macos/README.md",
  "docs/security.md",
  "docs/architecture.md",
  "SECURITY.md",
  "CONTRIBUTING.md",
]) {
  if (!read(rel).includes("com.nardo021.mote")) {
    fail(`${rel} must name the canonical bundle ID com.nardo021.mote.`);
  }
}

if (!read(".gitignore").includes("relay/worker-configuration.d.ts")) {
  fail(".gitignore must ignore relay/worker-configuration.d.ts.");
}

try {
  execFileSync("git", ["check-ignore", "-q", "relay/worker-configuration.d.ts"], { cwd: root });
} catch {
  fail("relay/worker-configuration.d.ts is not ignored.");
}

const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: root })
  .toString()
  .split("\0")
  .filter(Boolean);
for (const file of tracked) {
  const base = path.posix.basename(file);
  if (
    file === "relay/worker-configuration.d.ts" ||
    base === ".env" ||
    base === ".dev.vars" ||
    base.endsWith(".p12") ||
    base.endsWith(".pfx") ||
    base.endsWith(".p8") ||
    base.endsWith(".pem")
  ) {
    fail(`Tracked file must not be committed: ${file}`);
  }
}

const ci = read(".github/workflows/ci.yml");
if (/wrangler deploy(?![^\n]*--dry-run)/.test(ci) || /\bnpx wrangler deploy\s*$/m.test(ci)) {
  fail("CI must not deploy the Worker.");
}
if (!ci.includes("Mote-Safe") || !ci.includes("MOTE_RUN_SIDE_EFFECT_TESTS")) {
  fail("macOS CI must run the safe test plan with side-effect tests disabled.");
}
if (!ci.includes("runs-on: windows-latest") || !ci.includes("dotnet test")) {
  fail("CI must restore, build, and test the Windows agent on a Windows runner.");
}
if (ci.includes("LockWorkStation")) {
  fail("CI must not invoke LockWorkStation.");
}
if (!ci.includes("build-windows-release.yml")) {
  fail("CI must build the Windows release artifact.");
}

const deploy = read(".github/workflows/deploy-cloudflare.yml");
if (!deploy.includes("workflow_run") || !deploy.includes('workflows: ["CI"]')) {
  fail("Cloudflare deploy must wait for the CI workflow.");
}
if (!deploy.includes("secrets.CLOUDFLARE_API_TOKEN") || !deploy.includes("secrets.CLOUDFLARE_ACCOUNT_ID")) {
  fail("Cloudflare deploy must read credentials from GitHub Secrets.");
}
if (/CLOUDFLARE_API_TOKEN:\s*["']?[A-Za-z0-9_-]{20,}/.test(deploy)) {
  fail("Cloudflare deploy workflow contains a literal API token.");
}

const release = read(".github/workflows/release-macos.yml");
if (!release.includes("workflow_call") || release.includes("branches: [main]")) {
  fail("macOS release must be called by the product release workflow, not a push to main.");
}
if (!release.includes("notarytool")) {
  fail("macOS release workflow must include notarization.");
}
if (release.includes("gh release create") || /tags:\s*\n/.test(release)) {
  fail("macOS release workflow must not publish a GitHub Release or own version tags.");
}
if (!release.includes("MARKETING_VERSION")) {
  fail("macOS release workflow must check MARKETING_VERSION.");
}

const productRelease = read(".github/workflows/release.yml");
if (!productRelease.includes("workflow_dispatch") || !productRelease.includes("v[0-9]+.[0-9]+.[0-9]+")) {
  fail("Product release must be manual or triggered by one vX.Y.Z tag.");
}
if (!productRelease.includes("contents: read") || !productRelease.includes("contents: write")) {
  fail("Product release must keep read on the workflow and write only for publication.");
}
const releaseCreates = productRelease.split("gh release create").length - 1;
if (releaseCreates !== 1) {
  fail("Exactly one job may create the GitHub Release.");
}
if (!productRelease.includes("release-macos.yml") || !productRelease.includes("build-windows-release.yml")) {
  fail("Product release must build both platform artifacts.");
}
if (!productRelease.includes("PRODUCTION_SIGNED") || !productRelease.includes("PUBLIC_RELEASE_BLOCKED_WINDOWS_SIGNING")) {
  fail("Product release must fail closed without a production-signed Windows artifact.");
}
if (productRelease.includes("id-token:")) {
  fail("Product release must not grant OIDC until a signing provider requires it.");
}

const windowsRelease = read(".github/workflows/build-windows-release.yml");
if (!windowsRelease.includes("workflow_dispatch") || !windowsRelease.includes("workflow_call")) {
  fail("Windows release workflow must be manually triggerable and reusable.");
}
if (!windowsRelease.includes("contents: read") || windowsRelease.includes("contents: write")) {
  fail("Windows release workflow must use contents: read and must not publish a release.");
}
if (
  windowsRelease.includes("v[0-9]+.[0-9]+.[0-9]+") ||
  windowsRelease.includes("gh release create") ||
  /tags:\s*\n/.test(windowsRelease)
) {
  fail("Windows release workflow must not claim generic version tags or create a GitHub Release.");
}
if (windowsRelease.includes("LockWorkStation")) {
  fail("Windows release workflow must not invoke LockWorkStation.");
}
if (!windowsRelease.includes("win-x64") || !windowsRelease.includes("--self-contained true")) {
  fail("Windows release workflow must publish self-contained win-x64.");
}

try {
  const version = execFileSync(process.execPath, ["scripts/check-product-version.mjs"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    fail(`Product version is malformed: ${version}`);
  }
} catch (error) {
  fail(`Product version check failed: ${error instanceof Error ? error.message : String(error)}`);
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(failure);
  }
  process.exit(1);
}

console.log("Repository consistency checks passed.");
