import type { EnvConfig } from "./config/env.js";
import { CommandRouter } from "./commands/commandRouter.js";
import { CommandService } from "./commands/commandService.js";
import { LastSeenTracker } from "./commands/lastSeenTracker.js";
import { PendingCommands } from "./commands/pendingCommands.js";
import { DeviceRepository } from "./devices/deviceRepository.js";
import { DeviceService } from "./devices/deviceService.js";
import { TokenRepository } from "./devices/tokenRepository.js";
import type { MoteDatabase } from "./storage/database.js";
import { SlidingWindowRateLimiter } from "./utils/rateLimit.js";
import { ConnectionRegistry } from "./websocket/connectionRegistry.js";

export type AppContext = {
  config: EnvConfig;
  db: MoteDatabase;
  ready: boolean;
  devices: DeviceService;
  deviceRepository: DeviceRepository;
  tokenRepository: TokenRepository;
  connections: ConnectionRegistry;
  pending: PendingCommands;
  commandRouter: CommandRouter;
  commands: CommandService;
  rateLimiter: SlidingWindowRateLimiter;
  lastSeen: LastSeenTracker;
};

export function createAppContext(config: EnvConfig, db: MoteDatabase): AppContext {
  const deviceRepository = new DeviceRepository(db);
  const tokenRepository = new TokenRepository(db);
  const devices = new DeviceService(deviceRepository, tokenRepository);
  const connections = new ConnectionRegistry();
  const pending = new PendingCommands();
  const commandRouter = new CommandRouter(connections);
  const lastSeen = new LastSeenTracker(config.lastSeenPersistMs);
  const rateLimiter = new SlidingWindowRateLimiter(config.rateLimitMax, config.rateLimitWindowMs);
  const commands = new CommandService(
    config,
    devices,
    commandRouter,
    pending,
    (deviceId) => connections.isOnline(deviceId),
    {
      info: () => undefined,
      warn: () => undefined,
    },
  );

  return {
    config,
    db,
    ready: true,
    devices,
    deviceRepository,
    tokenRepository,
    connections,
    pending,
    commandRouter,
    commands,
    rateLimiter,
    lastSeen,
  };
}

export function bindCommandLogger(
  ctx: AppContext,
  log: { info: (obj: Record<string, unknown>, msg: string) => void; warn: (obj: Record<string, unknown>, msg: string) => void },
): void {
  ctx.commands = new CommandService(
    ctx.config,
    ctx.devices,
    ctx.commandRouter,
    ctx.pending,
    (deviceId) => ctx.connections.isOnline(deviceId),
    log,
  );
}
