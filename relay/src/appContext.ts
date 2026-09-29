import { ActivityRepository } from "./activity/activityRepository.js";
import { ActivityService } from "./activity/activityService.js";
import { AdminEventBus } from "./admin/eventBus.js";
import { AdminRepository } from "./admin/adminRepository.js";
import { AdminService } from "./admin/adminService.js";
import { SessionRepository } from "./admin/sessionRepository.js";
import { SessionService } from "./admin/sessionService.js";
import {
  ADMIN_LOGIN_RATE_LIMIT_MAX,
  ADMIN_LOGIN_RATE_LIMIT_WINDOW_MS,
} from "./config/constants.js";
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
import { nowMs } from "./utils/time.js";
import { PairRequestRepository } from "./pairing/pairRepository.js";
import { PairSocketRegistry } from "./pairing/pairRegistry.js";
import { PairService } from "./pairing/pairService.js";
import { ConnectionRegistry } from "./websocket/connectionRegistry.js";

export type AppContext = {
  config: EnvConfig;
  db: MoteDatabase;
  ready: boolean;
  startedAt: number;
  devices: DeviceService;
  deviceRepository: DeviceRepository;
  tokenRepository: TokenRepository;
  admins: AdminService;
  sessions: SessionService;
  activity: ActivityService;
  connections: ConnectionRegistry;
  pending: PendingCommands;
  commandRouter: CommandRouter;
  commands: CommandService;
  rateLimiter: SlidingWindowRateLimiter;
  adminLoginRateLimiter: SlidingWindowRateLimiter;
  lastSeen: LastSeenTracker;
  pairing: PairService;
  pairSockets: PairSocketRegistry;
  pairDeviceRateLimiter: SlidingWindowRateLimiter;
  pairIpRateLimiter: SlidingWindowRateLimiter;
  adminEvents: AdminEventBus;
  securityLog: {
    info: (obj: Record<string, unknown>, msg: string) => void;
    warn: (obj: Record<string, unknown>, msg: string) => void;
  };
};

export function createAppContext(
  config: EnvConfig,
  db: MoteDatabase,
): AppContext {
  const deviceRepository = new DeviceRepository(db);
  const tokenRepository = new TokenRepository(db);
  const devices = new DeviceService(deviceRepository, tokenRepository);
  const adminRepository = new AdminRepository(db);
  const sessionRepository = new SessionRepository(db);
  const admins = new AdminService(adminRepository);
  const sessions = new SessionService(sessionRepository, adminRepository);
  const activity = new ActivityService(new ActivityRepository(db));
  const connections = new ConnectionRegistry();
  const pending = new PendingCommands();
  const commandRouter = new CommandRouter(connections);
  const lastSeen = new LastSeenTracker(config.lastSeenPersistMs);
  const rateLimiter = new SlidingWindowRateLimiter(
    config.rateLimitMax,
    config.rateLimitWindowMs,
  );
  const adminLoginRateLimiter = new SlidingWindowRateLimiter(
    ADMIN_LOGIN_RATE_LIMIT_MAX,
    ADMIN_LOGIN_RATE_LIMIT_WINDOW_MS,
  );
  const adminEvents = new AdminEventBus();
  const commands = new CommandService(
    config,
    devices,
    commandRouter,
    pending,
    (deviceId) => {
      const connection = connections.get(deviceId);
      return connection === undefined ? undefined : { actions: connection.actions };
    },
    activity,
    {
      info: () => undefined,
      warn: () => undefined,
    },
    adminEvents,
  );
  sessions.purgeExpired();
  const pairSockets = new PairSocketRegistry();
  const pairDeviceRateLimiter = new SlidingWindowRateLimiter(
    config.pairRateLimitMax,
    config.pairRateLimitWindowMs,
  );
  const pairIpRateLimiter = new SlidingWindowRateLimiter(
    config.pairIpRateLimitMax,
    config.pairIpRateLimitWindowMs,
  );
  const pairing = new PairService(
    new PairRequestRepository(db),
    devices,
    pairSockets,
    config.pairTtlMs,
    pairDeviceRateLimiter,
    pairIpRateLimiter,
    adminEvents,
  );

  return {
    config,
    db,
    ready: true,
    startedAt: nowMs(),
    devices,
    deviceRepository,
    tokenRepository,
    admins,
    sessions,
    activity,
    connections,
    pending,
    commandRouter,
    commands,
    rateLimiter,
    adminLoginRateLimiter,
    lastSeen,
    pairing,
    pairSockets,
    pairDeviceRateLimiter,
    pairIpRateLimiter,
    adminEvents,
    securityLog: {
      info: () => undefined,
      warn: () => undefined,
    },
  };
}
