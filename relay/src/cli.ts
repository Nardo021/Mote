import { stdin as input, stdout as output } from "node:process";

import { AdminRepository } from "./admin/adminRepository.js";
import { AdminService } from "./admin/adminService.js";
import { SessionRepository } from "./admin/sessionRepository.js";
import { SessionService } from "./admin/sessionService.js";
import { loadConfig, loadLocalEnvFiles } from "./config/env.js";
import { DeviceRepository } from "./devices/deviceRepository.js";
import { DeviceService } from "./devices/deviceService.js";
import { TokenRepository } from "./devices/tokenRepository.js";
import { openDatabase } from "./storage/database.js";
import { AppError } from "./utils/errors.js";

const SECRET_WARNING = "This credential will not be shown again.";

type Flags = Map<string, string>;

function parseArgv(argv: string[]): { positional: string[]; flags: Flags } {
  const positional: string[] = [];
  const flags: Flags = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) {
      continue;
    }
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[index + 1];
      if (next === undefined || next.startsWith("--")) {
        flags.set(key, "true");
      } else {
        flags.set(key, next);
        index += 1;
      }
      continue;
    }
    positional.push(arg);
  }
  return { positional, flags };
}

function requiredFlag(flags: Flags, name: string): string {
  const value = flags.get(name);
  if (value === undefined || value.trim() === "") {
    throw new Error(`Missing --${name}`);
  }
  return value;
}

function printHelp(): void {
  const text = `Mote Relay CLI

Usage:
  node dist/cli.js device create --name "MacBook Pro" [--id <uuid>]
  node dist/cli.js device list
  node dist/cli.js device disable <device-id>
  node dist/cli.js device rotate <device-id>
  node dist/cli.js token create --name "Leo iPhone"
  node dist/cli.js token list
  node dist/cli.js token disable <token-id>
  node dist/cli.js token rotate <token-id>
  node dist/cli.js admin create --username admin
  node dist/cli.js admin list
  node dist/cli.js admin password --username admin
  node dist/cli.js admin disable --username admin
  node dist/cli.js admin enable --username admin

The CLI uses the same SQLite database as the server (MOTE_DATABASE_PATH).
Generated secrets are printed once. ${SECRET_WARNING}

Admin passwords are prompted interactively when a TTY is available.
For non-interactive use, pipe the password:

  printf '%s\\n' "$PASSWORD" | docker compose exec -T relay \\
    node dist/cli.js admin create --username admin --password-stdin

Do not pass passwords as command-line flags.
`;
  process.stdout.write(text);
}

function createServices() {
  loadLocalEnvFiles();
  const config = loadConfig();
  const db = openDatabase(config.databasePath);
  const devices = new DeviceService(
    new DeviceRepository(db),
    new TokenRepository(db),
  );
  const adminRepository = new AdminRepository(db);
  const admins = new AdminService(adminRepository);
  const sessions = new SessionService(
    new SessionRepository(db),
    adminRepository,
  );
  return { db, devices, admins, sessions };
}

function printDeviceCreated(id: string, credential: string): void {
  process.stdout.write(`Device created.
Device ID:
${id}
Device credential:
${credential}
Save this credential into Mote for Mac.
It will not be displayed again.
`);
}

function printTokenCreated(token: string): void {
  process.stdout.write(`Shortcut token created.
Token:
${token}
Permission:
send_command
Save this token in Apple Shortcuts.
It will not be displayed again.
`);
}

async function promptHidden(label: string): Promise<string> {
  if (!input.isTTY || !output.isTTY) {
    throw new Error(
      "Interactive password prompt requires a TTY. Use --password-stdin.",
    );
  }
  return new Promise((resolve, reject) => {
    output.write(label);
    const wasRaw = input.isRaw;
    input.setRawMode(true);
    let value = "";
    const onData = (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      if (text === "\n" || text === "\r" || text === "\u0004") {
        cleanup();
        output.write("\n");
        resolve(value);
        return;
      }
      if (text === "\u0003") {
        cleanup();
        reject(new Error("Cancelled"));
        return;
      }
      if (text === "\u007f" || text === "\b") {
        value = value.slice(0, -1);
        return;
      }
      if (text.charCodeAt(0) >= 32) {
        value += text;
      }
    };
    const cleanup = () => {
      input.off("data", onData);
      input.setRawMode(wasRaw ?? false);
    };
    input.on("data", onData);
  });
}

async function readStdinPassword(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of input) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks)
    .toString("utf8")
    .replace(/\r?\n$/, "");
}

async function readPassword(flags: Flags, confirm: boolean): Promise<string> {
  if (flags.has("password-stdin")) {
    const password = await readStdinPassword();
    if (password === "") {
      throw new Error("Password is required on stdin.");
    }
    return password;
  }
  const password = await promptHidden("Password: ");
  if (confirm) {
    const again = await promptHidden("Confirm password: ");
    if (password !== again) {
      throw new Error("Passwords do not match.");
    }
  }
  return password;
}

async function run(argv: string[]): Promise<number> {
  const { positional, flags } = parseArgv(argv);
  const [group, action, target] = positional;

  if (group === undefined || group === "help" || flags.has("help")) {
    printHelp();
    return 0;
  }

  const { db, devices, admins, sessions } = createServices();
  try {
    if (group === "device" && action === "create") {
      const created = devices.createDevice(
        requiredFlag(flags, "name"),
        flags.get("id"),
      );
      printDeviceCreated(created.id, created.credential);
      return 0;
    }
    if (group === "device" && action === "list") {
      const rows = devices.listDevices();
      if (rows.length === 0) {
        process.stdout.write("No devices.\n");
        return 0;
      }
      for (const device of rows) {
        process.stdout.write(
          `${device.id}\t${device.name}\tenabled=${device.enabled ? "yes" : "no"}\tlast_seen_at=${device.lastSeenAt ?? "-"}\n`,
        );
      }
      return 0;
    }
    if (group === "device" && action === "disable") {
      if (target === undefined) {
        throw new Error("Missing device id");
      }
      const device = devices.disableDevice(target);
      process.stdout.write(`Device ${device.id} disabled.\n`);
      return 0;
    }
    if (group === "device" && action === "rotate") {
      if (target === undefined) {
        throw new Error("Missing device id");
      }
      const rotated = devices.rotateDeviceCredential(target);
      process.stdout.write(`Device credential rotated.
Device ID:
${rotated.device.id}
Device credential:
${rotated.credential}
Save this credential into Mote for Mac.
It will not be displayed again.
`);
      return 0;
    }
    if (group === "token" && action === "create") {
      const created = devices.createShortcutToken(requiredFlag(flags, "name"));
      printTokenCreated(created.token);
      return 0;
    }
    if (group === "token" && action === "list") {
      const rows = devices.listTokens();
      if (rows.length === 0) {
        process.stdout.write("No tokens.\n");
        return 0;
      }
      for (const token of rows) {
        process.stdout.write(
          `${token.id}\t${token.name}\t${token.permission}\tenabled=${token.enabled ? "yes" : "no"}\n`,
        );
      }
      return 0;
    }
    if (group === "token" && action === "disable") {
      if (target === undefined) {
        throw new Error("Missing token id");
      }
      const token = devices.disableToken(target);
      process.stdout.write(`Token ${token.id} disabled.\n`);
      return 0;
    }
    if (group === "token" && action === "rotate") {
      if (target === undefined) {
        throw new Error("Missing token id");
      }
      const rotated = devices.rotateShortcutToken(target);
      printTokenCreated(rotated.token);
      return 0;
    }
    if (group === "admin" && action === "create") {
      const username = requiredFlag(flags, "username");
      const password = await readPassword(flags, true);
      const created = admins.create(username, password);
      process.stdout.write(`Administrator created.
Username:
${created.username}
Sign in at the Mote Relay Dashboard.
`);
      return 0;
    }
    if (group === "admin" && action === "list") {
      const rows = admins.list();
      if (rows.length === 0) {
        process.stdout.write(
          "No administrators. Create one with: node dist/cli.js admin create --username admin\n",
        );
        return 0;
      }
      for (const admin of rows) {
        process.stdout.write(
          `${admin.username}\tenabled=${admin.enabled ? "yes" : "no"}\tlast_login_at=${admin.lastLoginAt ?? "-"}\n`,
        );
      }
      return 0;
    }
    if (group === "admin" && action === "password") {
      const username = requiredFlag(flags, "username");
      const admin = admins.requireByUsername(username);
      const password = await readPassword(flags, true);
      admins.setPassword(admin.id, password);
      sessions.revokeAllForAdmin(admin.id);
      process.stdout.write(
        `Password updated for ${admin.username}. Existing sessions were signed out.\n`,
      );
      return 0;
    }
    if (group === "admin" && action === "disable") {
      const username = requiredFlag(flags, "username");
      const admin = admins.setEnabled(username, false);
      sessions.revokeAllForAdmin(admin.id);
      process.stdout.write(`Administrator ${admin.username} disabled.\n`);
      return 0;
    }
    if (group === "admin" && action === "enable") {
      const username = requiredFlag(flags, "username");
      const admin = admins.setEnabled(username, true);
      process.stdout.write(`Administrator ${admin.username} enabled.\n`);
      return 0;
    }
    throw new Error("Unknown command. Use --help.");
  } finally {
    db.close();
  }
}

async function main(): Promise<void> {
  try {
    process.exitCode = await run(process.argv.slice(2));
  } catch (error) {
    const message =
      error instanceof AppError || error instanceof Error
        ? error.message
        : "CLI failed";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}

void main();
