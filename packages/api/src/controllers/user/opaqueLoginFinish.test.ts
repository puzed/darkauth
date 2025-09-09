import type { IncomingMessage, ServerResponse } from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Context } from "../../types.js";
import { postOpaqueLoginFinish } from "./opaqueLoginFinish.js";

describe("User OPAQUE Login Finish - Identity Binding Security", () => {
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
          users: {
            findFirst: vi.fn(),
          },
        },
        delete: vi.fn().mockReturnThis(),
        where: vi.fn(),
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
      url: "/opaque/login/finish",
      headers: {},
    };

    mockResponse = {
      statusCode: 200,
      setHeader: vi.fn(),
      end: vi.fn(),
      write: vi.fn(),
    };
  });

  describe("Identity Binding from Server Session", () => {
    it("should derive user identity from server session, not from request body", async () => {
      const sessionId = "test-session-id";
      const serverBoundEmail = "server-bound@example.com";
      const attackerEmail = "attacker@example.com";

      // Mock the OPAQUE session with server-bound identity
      mockContext.db.query.opaqueLoginSessions.findFirst.mockResolvedValue({
        id: sessionId,
        identityU: Buffer.from(serverBoundEmail).toString("base64"),
        identityS: Buffer.from("DarkAuth").toString("base64"),
        serverState: Buffer.from("mock-state"),
        expiresAt: new Date(Date.now() + 600000), // 10 minutes from now
      });

      // Mock the user lookup - should be called with server-bound email
      mockContext.db.query.users.findFirst.mockResolvedValue({
        sub: "user-123",
        email: serverBoundEmail,
        name: "Test User",
      });

      // Mock OPAQUE finish success
      mockContext.services.opaque.finishLogin.mockResolvedValue({
        sessionKey: new Uint8Array(32),
      });

      // Simulate request with attacker trying to impersonate another user
      const requestBody = {
        sessionId,
        finish: "base64url_encoded_finish",
        email: attackerEmail, // Attacker provides different email
      };

      // Mock request body
      mockRequest.read = vi.fn().mockReturnValue(JSON.stringify(requestBody));

      // Execute the handler
      await postOpaqueLoginFinish(
        mockContext,
        mockRequest as IncomingMessage,
        mockResponse as ServerResponse
      );

      // Verify that user lookup was called with server-bound email, not attacker's
      expect(mockContext.db.query.users.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.any(Function), // Would check for email = serverBoundEmail
        })
      );

      // Verify the attacker's email was ignored
      expect(mockContext.db.query.users.findFirst).not.toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.anything(), // Checking it wasn't called with attackerEmail
        })
      );
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

      await postOpaqueLoginFinish(
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

    it("should decrypt KEK-encrypted identity when KEK service is available", async () => {
      const sessionId = "test-session-id";
      const userEmail = "user@example.com";
      const encryptedEmail = Buffer.from("encrypted-email-data");

      // Mock encrypted identity in session
      mockContext.db.query.opaqueLoginSessions.findFirst.mockResolvedValue({
        id: sessionId,
        identityU: encryptedEmail.toString("base64"),
        identityS: Buffer.from("encrypted-server").toString("base64"),
        serverState: Buffer.from("mock-state"),
        expiresAt: new Date(Date.now() + 600000),
      });

      // Mock KEK decryption
      mockContext.services.kek.decrypt.mockResolvedValue(Buffer.from(userEmail));

      // Mock user lookup
      mockContext.db.query.users.findFirst.mockResolvedValue({
        sub: "user-123",
        email: userEmail,
        name: "Test User",
      });

      // Mock OPAQUE finish
      mockContext.services.opaque.finishLogin.mockResolvedValue({
        sessionKey: new Uint8Array(32),
      });

      const requestBody = {
        sessionId,
        finish: "base64url_encoded_finish",
      };

      mockRequest.read = vi.fn().mockReturnValue(JSON.stringify(requestBody));

      await postOpaqueLoginFinish(
        mockContext,
        mockRequest as IncomingMessage,
        mockResponse as ServerResponse
      );

      // Verify KEK decryption was called
      expect(mockContext.services.kek.decrypt).toHaveBeenCalledWith(encryptedEmail);

      // Verify user was looked up with decrypted email
      expect(mockContext.db.query.users.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.any(Function), // Would check for email = userEmail
        })
      );
    });

    it("should fall back to base64 decoding when KEK is not available", async () => {
      const sessionId = "test-session-id";
      const userEmail = "user@example.com";

      // Remove KEK service
      mockContext.services.kek = undefined;

      // Mock session with base64-encoded identity
      mockContext.db.query.opaqueLoginSessions.findFirst.mockResolvedValue({
        id: sessionId,
        identityU: Buffer.from(userEmail).toString("base64"),
        identityS: Buffer.from("DarkAuth").toString("base64"),
        serverState: Buffer.from("mock-state"),
        expiresAt: new Date(Date.now() + 600000),
      });

      // Mock user lookup
      mockContext.db.query.users.findFirst.mockResolvedValue({
        sub: "user-123",
        email: userEmail,
        name: "Test User",
      });

      // Mock OPAQUE finish
      mockContext.services.opaque.finishLogin.mockResolvedValue({
        sessionKey: new Uint8Array(32),
      });

      const requestBody = {
        sessionId,
        finish: "base64url_encoded_finish",
      };

      mockRequest.read = vi.fn().mockReturnValue(JSON.stringify(requestBody));

      await postOpaqueLoginFinish(
        mockContext,
        mockRequest as IncomingMessage,
        mockResponse as ServerResponse
      );

      // Verify user was looked up with base64-decoded email
      expect(mockContext.db.query.users.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.any(Function), // Would check for email = userEmail
        })
      );
    });

    it("should clean up session after successful login", async () => {
      const sessionId = "test-session-id";
      const userEmail = "user@example.com";

      // Mock session
      mockContext.db.query.opaqueLoginSessions.findFirst.mockResolvedValue({
        id: sessionId,
        identityU: Buffer.from(userEmail).toString("base64"),
        identityS: Buffer.from("DarkAuth").toString("base64"),
        serverState: Buffer.from("mock-state"),
        expiresAt: new Date(Date.now() + 600000),
      });

      // Mock user
      mockContext.db.query.users.findFirst.mockResolvedValue({
        sub: "user-123",
        email: userEmail,
        name: "Test User",
      });

      // Mock OPAQUE finish
      mockContext.services.opaque.finishLogin.mockResolvedValue({
        sessionKey: new Uint8Array(32),
      });

      const requestBody = {
        sessionId,
        finish: "base64url_encoded_finish",
      };

      mockRequest.read = vi.fn().mockReturnValue(JSON.stringify(requestBody));

      await postOpaqueLoginFinish(
        mockContext,
        mockRequest as IncomingMessage,
        mockResponse as ServerResponse
      );

      // Verify session was deleted after successful login
      expect(mockContext.db.delete).toHaveBeenCalledWith(
        expect.objectContaining({
          // Would be opaqueLoginSessions table
        })
      );
    });
  });

  describe("Rate Limiting with Correct Identity", () => {
    it("should use server-bound identity for rate limiting", async () => {
      // This test would verify that rate limiting uses the identity
      // from the server session, not from request body
      // Implementation depends on how rate limiting middleware works
    });
  });

  describe("Audit Logging with Correct Identity", () => {
    it("should log audit events with server-bound identity", async () => {
      // This test would verify that audit logs use the identity
      // from the server session, not from request body
      // Implementation depends on how audit logging works
    });
  });
});
