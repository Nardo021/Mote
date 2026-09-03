import { ADMIN_PASSWORD_MIN_LENGTH } from "../config/constants.js";
import { AppError, ErrorCode, invalidRequest } from "../utils/errors.js";
import { createId } from "../utils/ids.js";
import { nowMs } from "../utils/time.js";
import type { AdminRepository } from "./adminRepository.js";
import {
  toAdminPublic,
  type AdminPublic,
  type AdminRecord,
} from "./adminTypes.js";
import { hashPassword, verifyPassword } from "./passwordHash.js";

const USERNAME_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;

export class AdminService {
  constructor(private readonly admins: AdminRepository) {}

  hasAny(): boolean {
    return this.admins.count() > 0;
  }

  create(username: string, password: string): AdminPublic {
    const normalized = normalizeUsername(username);
    validatePassword(password);
    if (this.admins.findByUsername(normalized)) {
      throw new AppError(
        ErrorCode.INVALID_REQUEST,
        "Administrator username already exists.",
        409,
      );
    }
    const createdAt = nowMs();
    const record: AdminRecord = {
      id: createId(),
      username: normalized,
      passwordHash: hashPassword(password),
      enabled: true,
      createdAt,
      updatedAt: createdAt,
      lastLoginAt: null,
    };
    this.admins.insert(record);
    return toAdminPublic(record);
  }

  list(): AdminPublic[] {
    return this.admins.list().map(toAdminPublic);
  }

  requireByUsername(username: string): AdminRecord {
    const admin = this.admins.findByUsername(normalizeUsername(username));
    if (!admin) {
      throw new AppError(
        ErrorCode.INVALID_REQUEST,
        "Administrator not found.",
        404,
      );
    }
    return admin;
  }

  requireById(id: string): AdminRecord {
    const admin = this.admins.findById(id);
    if (!admin) {
      throw new AppError(
        ErrorCode.INVALID_REQUEST,
        "Administrator not found.",
        404,
      );
    }
    return admin;
  }

  authenticate(username: string, password: string): AdminRecord {
    const admin = this.admins.findByUsername(normalizeUsername(username));
    if (!admin || !verifyPassword(password, admin.passwordHash)) {
      throw new AppError(
        ErrorCode.UNAUTHORIZED,
        "Invalid username or password.",
        401,
      );
    }
    if (!admin.enabled) {
      throw new AppError(
        ErrorCode.ADMIN_DISABLED,
        "Administrator is disabled.",
        403,
      );
    }
    return admin;
  }

  verifyCurrentPassword(admin: AdminRecord, password: string): void {
    if (!verifyPassword(password, admin.passwordHash)) {
      throw new AppError(
        ErrorCode.UNAUTHORIZED,
        "Current password is incorrect.",
        401,
      );
    }
  }

  setPassword(id: string, password: string): AdminPublic {
    const admin = this.requireById(id);
    validatePassword(password);
    this.admins.updatePasswordHash(id, hashPassword(password));
    return { ...toAdminPublic(admin), updatedAt: nowMs() };
  }

  setEnabled(username: string, enabled: boolean): AdminPublic {
    const admin = this.requireByUsername(username);
    this.admins.setEnabled(admin.id, enabled);
    return { ...toAdminPublic(admin), enabled, updatedAt: nowMs() };
  }

  recordLogin(id: string, at: number = nowMs()): void {
    this.admins.updateLastLogin(id, at);
  }
}

export function normalizeUsername(username: string): string {
  const trimmed = username.trim();
  if (trimmed === "" || !USERNAME_PATTERN.test(trimmed)) {
    throw invalidRequest(
      "Username must be 1–64 letters, numbers, dots, underscores, or hyphens.",
    );
  }
  return trimmed;
}

export function validatePassword(password: string): void {
  if (password.length < ADMIN_PASSWORD_MIN_LENGTH) {
    throw invalidRequest(
      `Password must be at least ${ADMIN_PASSWORD_MIN_LENGTH} characters.`,
    );
  }
  if (password.length > 256) {
    throw invalidRequest("Password is too long.");
  }
}
