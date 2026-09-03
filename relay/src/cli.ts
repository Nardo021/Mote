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

The CLI uses the same SQLite database as the server (MOTE_DATABASE_PATH).
Generated secrets are printed once. ${SECRET_WARNING}
`;
  process.stdout.write(text);
}

function createServices() {
  loadLocalEnvFiles();
  const config = loadConfig();
  const db = openDatabase(config.databasePath);
  const devices = new DeviceService(new DeviceRepository(db), new TokenRepository(db));
  return { db, devices };
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

function run(argv: string[]): number {
  const { positional, flags } = parseArgv(argv);
  const [group, action, target] = positional;

  if (group === undefined || group === "help" || flags.has("help")) {
    printHelp();
    return 0;
  }

  const { db, devices } = createServices();
  try {
    if (group === "device" && action === "create") {
      const created = devices.createDevice(requiredFlag(flags, "name"), flags.get("id"));
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
    throw new Error("Unknown command. Use --help.");
  } finally {
    db.close();
  }
}

function main(): void {
  try {
    process.exitCode = run(process.argv.slice(2));
  } catch (error) {
    const message = error instanceof AppError || error instanceof Error ? error.message : "CLI failed";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}

main();
