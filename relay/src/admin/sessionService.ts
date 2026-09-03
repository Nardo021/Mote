import { ADMIN_SESSION_TTL_MS } from "../config/constants.js";
import { hashSecret } from "../auth/tokenHash.js";
import { AppError, ErrorCode } from "../utils/errors.js";
import { createId, createSecret } from "../utils/ids.js";
import { nowMs } from "../utils/time.js";
import type { AdminRepository } from "./adminRepository.js";
import type { AuthenticatedAdmin } from "./adminTypes.js";
import type { SessionRepository } from "./sessionRepository.js";

export class SessionService {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly admins: AdminRepository,
  ) {}

  create(
    adminId: string,
    now: number = nowMs(),
  ): { sessionId: string; token: string; expiresAt: number } {
    this.purgeExpired(now);
    const token = createSecret();
    const sessionId = createId();
    const expiresAt = now + ADMIN_SESSION_TTL_MS;
    this.sessions.insert({
      id: sessionId,
      adminId,
      tokenHash: hashSecret(token),
      createdAt: now,
      expiresAt,
      lastSeenAt: now,
    });
    return { sessionId, token, expiresAt };
  }

  authenticate(
    token: string | undefined,
    now: number = nowMs(),
  ): AuthenticatedAdmin {
    if (token === undefined || token === "") {
      throw new AppError(
        ErrorCode.UNAUTHORIZED,
        "Administrator session required.",
        401,
      );
    }
    const record = this.sessions.findByTokenHash(hashSecret(token));
    if (!record) {
      throw new AppError(
        ErrorCode.UNAUTHORIZED,
        "Administrator session required.",
        401,
      );
    }
    if (record.expiresAt <= now) {
      this.sessions.deleteById(record.id);
      throw new AppError(
        ErrorCode.SESSION_EXPIRED,
        "Administrator session expired.",
        401,
      );
    }
    const admin = this.admins.findById(record.adminId);
    if (!admin) {
      this.sessions.deleteById(record.id);
      throw new AppError(
        ErrorCode.UNAUTHORIZED,
        "Administrator session required.",
        401,
      );
    }
    if (!admin.enabled) {
      this.sessions.deleteByAdminId(admin.id);
      throw new AppError(
        ErrorCode.ADMIN_DISABLED,
        "Administrator is disabled.",
        403,
      );
    }
    this.sessions.touch(record.id, now);
    return {
      sessionId: record.id,
      adminId: admin.id,
      username: admin.username,
    };
  }

  revoke(sessionId: string): void {
    this.sessions.deleteById(sessionId);
  }

  revokeAllForAdmin(adminId: string, exceptSessionId?: string): void {
    this.sessions.deleteByAdminId(adminId, exceptSessionId);
  }

  purgeExpired(now: number = nowMs()): number {
    return this.sessions.deleteExpired(now);
  }
}
