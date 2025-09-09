import type { IncomingMessage, ServerResponse } from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Context } from "../../types.js";
import { postAdminOpaqueLoginFinish } from "./opaqueLoginFinish.js";

describe("Admin OPAQUE Login Finish - Identity Binding Security", () => {
  let mockContext: Context;
  let mockRequest: Partial<IncomingMessage>;
  let mockResponse: Partial<ServerResponse>;

  beforeEach(() => {
    // Setup mock context
    mockContext = {
      db: {
        query: {
          opaqueLoginSessions: {
            findFirst: vi.fn(),
          },
        },
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        delete: vi.fn().mockReturnThis(),
      },
      services: {
        opaque: {
          finishLogin: vi.fn(),
        },
        kek: {
          encrypt: vi.fn(),
          decrypt: vi.fn(),
        },
      },
      logger: {
        debug: vi.fn(),
        info: vi.fn(),
        error: vi.fn(),
      },
    } as unknown as Context;

    mockRequest = {
      method: "POST",
      url: "/admin/opaque/login/finish",
      headers: {},
    };

    mockResponse = {
      statusCode: 200,
      setHeader: vi.fn(),
      end: vi.fn(),
      write: vi.fn(),
    };
  });

  describe("Admin Identity Binding from Server Session", () => {
    it("should derive admin identity from server session, ignoring adminId in request", async () => {
      const sessionId = "admin-session-id";
      const serverBoundEmail = "admin@example.com";
      const attackerAdminId = "attacker-admin-id";

      // Mock the OPAQUE session with server-bound identity
      mockContext.db.query.opaqueLoginSessions.findFirst.mockResolvedValue({
        id: sessionId,
        identityU: Buffer.from(serverBoundEmail).toString("base64"),
        identityS: Buffer.from("DarkAuth").toString("base64"),
        serverState: Buffer.from("mock-state"),
        expiresAt: new Date(Date.now() + 600000),
      });

      // Mock admin lookup by email (from session)
      const getAdminByEmail = vi.fn().mockResolvedValue({
        id: "real-admin-id",
        email: serverBoundEmail,
        name: "Real Admin",
        role: "write",
      });

      // Mock module import
      vi.doMock("../../models/adminUsers.js", () => ({
        getAdminByEmail,
      }));

      // Mock OPAQUE finish success
      mockContext.services.opaque.finishLogin.mockResolvedValue({
        sessionKey: new Uint8Array(32),
      });

      // Simulate request with attacker trying to use different adminId
      const requestBody = {
        sessionId,
        finish: "base64url_encoded_finish",
        adminId: attackerAdminId, // This should be ignored
      };

      mockRequest.read = vi.fn().mockReturnValue(JSON.stringify(requestBody));

      await postAdminOpaqueLoginFinish(
        mockContext,
        mockRequest as IncomingMessage,
        mockResponse as ServerResponse
      );

      // Verify admin was looked up by email from session, not by adminId
      expect(getAdminByEmail).toHaveBeenCalledWith(mockContext, serverBoundEmail);

      // Verify response contains the real admin's info
      const responseData = JSON.parse(mockResponse.write.mock.calls[0][0]);
      expect(responseData.admin.id).toBe("real-admin-id");
      expect(responseData.admin.email).toBe(serverBoundEmail);
    });

    it("should work without adminId field in request", async () => {
      const sessionId = "admin-session-id";
      const adminEmail = "admin@example.com";

      // Mock session
      mockContext.db.query.opaqueLoginSessions.findFirst.mockResolvedValue({
        id: sessionId,
        identityU: Buffer.from(adminEmail).toString("base64"),
        identityS: Buffer.from("DarkAuth").toString("base64"),
        serverState: Buffer.from("mock-state"),
        expiresAt: new Date(Date.now() + 600000),
      });

      // Mock admin lookup
      const getAdminByEmail = vi.fn().mockResolvedValue({
        id: "admin-id",
        email: adminEmail,
        name: "Test Admin",
        role: "write",
      });

      vi.doMock("../../models/adminUsers.js", () => ({
        getAdminByEmail,
      }));

      // Mock OPAQUE finish
      mockContext.services.opaque.finishLogin.mockResolvedValue({
        sessionKey: new Uint8Array(32),
      });

      // Request without adminId field
      const requestBody = {
        sessionId,
        finish: "base64url_encoded_finish",
        // No adminId field
      };

      mockRequest.read = vi.fn().mockReturnValue(JSON.stringify(requestBody));

      await postAdminOpaqueLoginFinish(
        mockContext,
        mockRequest as IncomingMessage,
        mockResponse as ServerResponse
      );

      // Should succeed
      expect(mockResponse.statusCode).toBe(200);
      expect(getAdminByEmail).toHaveBeenCalledWith(mockContext, adminEmail);
    });

    it("should fail if session does not exist", async () => {
      const sessionId = "non-existent-session";

      // Mock no session found
      mockContext.db.query.opaqueLoginSessions.findFirst.mockResolvedValue(null);

      const requestBody = {
        sessionId,
        finish: "base64url_encoded_finish",
      };

      mockRequest.read = vi.fn().mockReturnValue(JSON.stringify(requestBody));

      await postAdminOpaqueLoginFinish(
        mockContext,
        mockRequest as IncomingMessage,
        mockResponse as ServerResponse
      );

      // Should return 401 Unauthorized
      expect(mockResponse.statusCode).toBe(401);
      expect(mockResponse.end).toHaveBeenCalledWith(
        expect.stringContaining("Invalid or expired login session")
      );
    });

    it("should fail if admin account does not exist for session email", async () => {
      const sessionId = "admin-session-id";
      const nonExistentEmail = "nonexistent@example.com";

      // Mock session with non-existent admin email
      mockContext.db.query.opaqueLoginSessions.findFirst.mockResolvedValue({
        id: sessionId,
        identityU: Buffer.from(nonExistentEmail).toString("base64"),
        identityS: Buffer.from("DarkAuth").toString("base64"),
        serverState: Buffer.from("mock-state"),
        expiresAt: new Date(Date.now() + 600000),
      });

      // Mock admin not found
      const getAdminByEmail = vi.fn().mockResolvedValue(null);

      vi.doMock("../../models/adminUsers.js", () => ({
        getAdminByEmail,
      }));

      const requestBody = {
        sessionId,
        finish: "base64url_encoded_finish",
      };

      mockRequest.read = vi.fn().mockReturnValue(JSON.stringify(requestBody));

      await postAdminOpaqueLoginFinish(
        mockContext,
        mockRequest as IncomingMessage,
        mockResponse as ServerResponse
      );

      // Should return 401 Unauthorized
      expect(mockResponse.statusCode).toBe(401);
      expect(mockResponse.end).toHaveBeenCalledWith(
        expect.stringContaining("Authentication failed")
      );
    });

    it("should handle KEK-encrypted identity in session", async () => {
      const sessionId = "admin-session-id";
      const adminEmail = "admin@example.com";
      const encryptedEmail = Buffer.from("encrypted-admin-email");

      // Mock encrypted identity in session
      mockContext.db.query.opaqueLoginSessions.findFirst.mockResolvedValue({
        id: sessionId,
        identityU: encryptedEmail.toString("base64"),
        identityS: Buffer.from("encrypted-server").toString("base64"),
        serverState: Buffer.from("mock-state"),
        expiresAt: new Date(Date.now() + 600000),
      });

      // Mock KEK decryption
      mockContext.services.kek.decrypt.mockResolvedValue(Buffer.from(adminEmail));

      // Mock admin lookup
      const getAdminByEmail = vi.fn().mockResolvedValue({
        id: "admin-id",
        email: adminEmail,
        name: "Test Admin",
        role: "write",
      });

      vi.doMock("../../models/adminUsers.js", () => ({
        getAdminByEmail,
      }));

      // Mock OPAQUE finish
      mockContext.services.opaque.finishLogin.mockResolvedValue({
        sessionKey: new Uint8Array(32),
      });

      const requestBody = {
        sessionId,
        finish: "base64url_encoded_finish",
      };

      mockRequest.read = vi.fn().mockReturnValue(JSON.stringify(requestBody));

      await postAdminOpaqueLoginFinish(
        mockContext,
        mockRequest as IncomingMessage,
        mockResponse as ServerResponse
      );

      // Verify KEK decryption was called
      expect(mockContext.services.kek.decrypt).toHaveBeenCalledWith(encryptedEmail);

      // Verify admin was looked up with decrypted email
      expect(getAdminByEmail).toHaveBeenCalledWith(mockContext, adminEmail);
    });
  });

  describe("Audit Logging", () => {
    it("should extract identity from session for audit logging", async () => {
      // This test would verify that the audit wrapper extracts
      // the correct identity from the server session for logging
      // Implementation depends on audit wrapper implementation
    });
  });

  describe("Session Cleanup", () => {
    it("should delete OPAQUE login session after successful authentication", async () => {
      const sessionId = "admin-session-id";
      const adminEmail = "admin@example.com";

      // Mock session
      mockContext.db.query.opaqueLoginSessions.findFirst.mockResolvedValue({
        id: sessionId,
        identityU: Buffer.from(adminEmail).toString("base64"),
        identityS: Buffer.from("DarkAuth").toString("base64"),
        serverState: Buffer.from("mock-state"),
        expiresAt: new Date(Date.now() + 600000),
      });

      // Mock admin
      const getAdminByEmail = vi.fn().mockResolvedValue({
        id: "admin-id",
        email: adminEmail,
        name: "Test Admin",
        role: "write",
      });

      vi.doMock("../../models/adminUsers.js", () => ({
        getAdminByEmail,
      }));

      // Mock OPAQUE finish
      mockContext.services.opaque.finishLogin.mockResolvedValue({
        sessionKey: new Uint8Array(32),
      });

      const requestBody = {
        sessionId,
        finish: "base64url_encoded_finish",
      };

      mockRequest.read = vi.fn().mockReturnValue(JSON.stringify(requestBody));

      await postAdminOpaqueLoginFinish(
        mockContext,
        mockRequest as IncomingMessage,
        mockResponse as ServerResponse
      );

      // Verify session cleanup was called
      expect(mockContext.db.delete).toHaveBeenCalled();
    });
  });
});
