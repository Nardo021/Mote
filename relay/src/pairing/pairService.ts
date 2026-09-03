import type { AdminEventBus } from "../admin/eventBus.js";
import { hashSecret, verifySecret } from "../auth/tokenHash.js";
import type { DeviceService } from "../devices/deviceService.js";
import type { CreatedDevice } from "../devices/deviceTypes.js";
import {
  AppError,
  ErrorCode,
  invalidRequest,
  rateLimited,
  unauthorized,
} from "../utils/errors.js";
import { createId, createSecret, isUuid } from "../utils/ids.js";
import type { SlidingWindowRateLimiter } from "../utils/rateLimit.js";
import { nowMs } from "../utils/time.js";
import type { PairRequestRepository } from "./pairRepository.js";
import type { PairSocketRegistry } from "./pairRegistry.js";
import {
  PairRequestStatus,
  presentAdminPairRequest,
  type AdminPairRequest,
  type CreatedPairRequest,
  type PairRequestRecord,
} from "./pairTypes.js";

export class PairService {
  constructor(
    private readonly requests: PairRequestRepository,
    private readonly devices: DeviceService,
    private readonly sockets: PairSocketRegistry,
    private readonly pairTtlMs: number,
    private readonly deviceLimiter: SlidingWindowRateLimiter,
    private readonly ipLimiter: SlidingWindowRateLimiter,
    private readonly events: AdminEventBus,
  ) {}

  createRequest(
    deviceId: string,
    deviceName: string,
    sourceIp: string,
  ): CreatedPairRequest {
    this.expireStale();
    if (!isUuid(deviceId)) {
      throw invalidRequest("Device ID must be a UUID.");
    }
    const name = deviceName.trim();
    if (name === "") {
      throw invalidRequest("Device name is required.");
    }
    if (this.devices.getDevice(deviceId)) {
      throw new AppError(
        ErrorCode.INVALID_REQUEST,
        "Device ID already exists.",
        409,
      );
    }
    if (
      !this.deviceLimiter.consume(`pair:device:${deviceId}`) ||
      !this.ipLimiter.consume(`pair:ip:${sourceIp}`)
    ) {
      throw rateLimited("Too many pair requests.");
    }

    const existing = this.requests.findPendingByDeviceId(deviceId);
    if (existing) {
      this.requests.updateStatus(existing.id, PairRequestStatus.cancelled);
      this.sockets.send(existing.id, {
        type: "pair_expired",
        version: 1,
      });
      this.sockets.close(existing.id, 1000, "superseded");
    }

    const id = createId();
    const pairSecret = createSecret();
    const createdAt = nowMs();
    this.requests.insert({
      id,
      deviceId,
      deviceName: name,
      pairSecretHash: hashSecret(pairSecret),
      status: PairRequestStatus.pending,
      expiresAt: createdAt + this.pairTtlMs,
      createdAt,
    });
    this.events.publish("pairing");
    return { id, pairSecret, expiresAt: createdAt + this.pairTtlMs };
  }

  listPending(): AdminPairRequest[] {
    this.expireStale();
    return this.requests.listPending().map(presentAdminPairRequest);
  }

  approve(
    requestId: string,
    nameOverride?: string,
  ): { device: CreatedDevice; credential: string } {
    const request = this.requirePending(requestId);
    const name = nameOverride?.trim() || request.deviceName;
    const created = this.devices.createDevice(name, request.deviceId);
    this.requests.updateStatus(request.id, PairRequestStatus.approved);
    this.sockets.send(request.id, {
      type: "pair_approved",
      version: 1,
      device_id: created.id,
      credential: created.credential,
      name: created.name,
    });
    this.events.publish("pairing");
    this.events.publish("devices");
    return { device: created, credential: created.credential };
  }

  reject(requestId: string): void {
    const request = this.requirePending(requestId);
    this.requests.updateStatus(request.id, PairRequestStatus.rejected);
    this.sockets.send(request.id, {
      type: "pair_rejected",
      version: 1,
      error: "rejected",
    });
    this.events.publish("pairing");
  }

  cancel(requestId: string, pairSecret: string): void {
    const request = this.requirePending(requestId);
    if (!verifySecret(pairSecret, request.pairSecretHash)) {
      throw unauthorized("Invalid pair secret.");
    }
    this.requests.updateStatus(request.id, PairRequestStatus.cancelled);
    this.sockets.send(request.id, {
      type: "pair_rejected",
      version: 1,
      error: "cancelled",
    });
    this.events.publish("pairing");
  }

  authenticateSocket(requestId: string, pairSecret: string): PairRequestRecord {
    this.expireStale();
    const request = this.requests.findById(requestId);
    if (
      !request ||
      request.status !== PairRequestStatus.pending ||
      !verifySecret(pairSecret, request.pairSecretHash)
    ) {
      throw unauthorized("Invalid pair secret.");
    }
    return request;
  }

  expireStale(): PairRequestRecord[] {
    const expired = this.requests.expirePending(nowMs());
    for (const request of expired) {
      this.sockets.send(request.id, { type: "pair_expired", version: 1 });
      this.sockets.close(request.id, 1000, "expired");
    }
    if (expired.length > 0) {
      this.events.publish("pairing");
    }
    return expired;
  }

  private requirePending(requestId: string): PairRequestRecord {
    this.expireStale();
    const request = this.requests.findById(requestId);
    if (!request || request.status !== PairRequestStatus.pending) {
      throw new AppError(
        ErrorCode.DEVICE_NOT_FOUND,
        "Pair request not found.",
        404,
      );
    }
    return request;
  }
}
