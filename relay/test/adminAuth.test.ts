import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { AdminRepository } from "../src/admin/adminRepository.js";
import { AdminService } from "../src/admin/adminService.js";
import { SessionRepository } from "../src/admin/sessionRepository.js";
import { SessionService } from "../src/admin/sessionService.js";
import { hashPassword, verifyPassword } from "../src/admin/passwordHash.js";
import { openMemoryDatabase } from "../src/storage/database.js";
import { AppError, ErrorCode } from "../src/utils/errors.js";
import { hashSecret } from "../src/auth/tokenHash.js";

const PASSWORD = "correct-horse-admin";

function setup() {
  const db = openMemoryDatabase();
  const adminRepository = new AdminRepository(db);
  const sessionRepository = new SessionRepository(db);
  const admins = new AdminService(adminRepository);
  const sessions = new SessionService(sessionRepository, adminRepository);
  return { db, adminRepository, sessionRepository, admins, sessions };
}

describe("admin authentication", () => {
  it("creates an administrator and verifies the password", () => {
    const { db, admins } = setup();
    const created = admins.create("admin", PASSWORD);
    assert.equal(created.username, "admin");
    const admin = admins.authenticate("admin", PASSWORD);
    assert.equal(admin.id, created.id);
    db.close();
  });

  it("stores an Argon2id hash rather than the password", () => {
    const hash = hashPassword(PASSWORD);
    assert.match(hash, /^argon2id\$/);
    assert.equal(hash.includes(PASSWORD), false);
    assert.equal(verifyPassword(PASSWORD, hash), true);
    assert.equal(verifyPassword("wrong-password-12", hash), false);
  });

  it("rejects an invalid password", () => {
    const { db, admins } = setup();
    admins.create("admin", PASSWORD);
    assert.throws(
      () => admins.authenticate("admin", "wrong-password-12"),
      (error: unknown) =>
        error instanceof AppError && error.code === ErrorCode.UNAUTHORIZED,
    );
    db.close();
  });

  it("rejects a disabled administrator", () => {
    const { db, admins } = setup();
    admins.create("admin", PASSWORD);
    admins.setEnabled("admin", false);
    assert.throws(
      () => admins.authenticate("admin", PASSWORD),
      (error: unknown) =>
        error instanceof AppError && error.code === ErrorCode.ADMIN_DISABLED,
    );
    db.close();
  });

  it("creates and verifies a session", () => {
    const { db, admins, sessions, sessionRepository } = setup();
    const admin = admins.create("admin", PASSWORD);
    const created = sessions.create(admin.id);
    const authenticated = sessions.authenticate(created.token);
    assert.equal(authenticated.username, "admin");
    const stored = sessionRepository.findByTokenHash(hashSecret(created.token));
    assert.ok(stored);
    assert.notEqual(stored.tokenHash, created.token);
    db.close();
  });

  it("revokes a session on logout", () => {
    const { db, admins, sessions } = setup();
    const admin = admins.create("admin", PASSWORD);
    const created = sessions.create(admin.id);
    sessions.revoke(created.sessionId);
    assert.throws(
      () => sessions.authenticate(created.token),
      (error: unknown) =>
        error instanceof AppError && error.code === ErrorCode.UNAUTHORIZED,
    );
    db.close();
  });

  it("rejects an expired session", () => {
    const { db, admins, sessions } = setup();
    const admin = admins.create("admin", PASSWORD);
    const created = sessions.create(
      admin.id,
      Date.now() - 8 * 24 * 60 * 60 * 1000,
    );
    assert.throws(
      () => sessions.authenticate(created.token),
      (error: unknown) =>
        error instanceof AppError && error.code === ErrorCode.SESSION_EXPIRED,
    );
    db.close();
  });
});
