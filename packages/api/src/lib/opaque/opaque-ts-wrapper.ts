/**
 * RFC 9380 compliant OPAQUE implementation
 *
 * Provides password-authenticated key exchange where:
 * - Server never learns the password (essential for zero-knowledge auth)
 * - Export key is deterministic per user+password (enables consistent derived keys)
 * - Secure against offline attacks (passwords can't be brute-forced from stored data)
 */

import { webcrypto } from "node:crypto";

// Node.js Web Crypto API setup for opaque-ts compatibility
if (typeof globalThis.crypto === "undefined") {
  Object.defineProperty(globalThis, "crypto", {
    value: webcrypto,
    configurable: true,
  });
}

import { randomBytes } from "node:crypto";
import { generateKeyPair } from "@cloudflare/voprf-ts";
import type { AKEExportKeyPair, Config } from "opaque-ts";
import {
  OpaqueClient as CloudflareOpaqueClient,
  OpaqueServer as CloudflareOpaqueServer,
  KE1,
  KE2,
  KE3,
  OpaqueConfig,
  OpaqueID,
  RegistrationRecord,
  RegistrationRequest,
  RegistrationResponse,
} from "opaque-ts";
import type { Logger } from "../../types.js";
import { createSecureLogger } from "../secureLogger.js";

export function fromBase64Url(str: string): Uint8Array {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) {
    str += "=";
  }
  const binary = Buffer.from(str, "base64");
  return new Uint8Array(binary);
}

export function toBase64Url(bytes: Uint8Array): string {
  const base64 = Buffer.from(bytes).toString("base64");
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function generateOprfSeed(): number[] {
  return Array.from(randomBytes(32));
}

async function generateServerKeypair(): Promise<AKEExportKeyPair> {
  const serverKeyPair = await generateKeyPair("P256-SHA256");
  return {
    private_key: Array.from(serverKeyPair.privateKey),
    public_key: Array.from(serverKeyPair.publicKey),
  };
}

/**
 * OPAQUE server implementation (class-based, wrapped by functional interface)
 */
export class OpaqueServer {
  private server: CloudflareOpaqueServer | null = null;
  private config: Config;
  private oprfSeed: number[];
  private serverKeypair: AKEExportKeyPair | null = null;
  private serverIdentity: string;
  private activeSessions: Map<string, CloudflareOpaqueServer>;
  private secureLogger: ReturnType<typeof createSecureLogger>;

  constructor() {
    this.config = new OpaqueConfig(OpaqueID.OPAQUE_P256);
    this.serverIdentity = "DarkAuth";
    this.activeSessions = new Map();
    this.oprfSeed = [];
    this.secureLogger = createSecureLogger();
  }

  setLogger(logger?: Logger): void {
    this.secureLogger = createSecureLogger({
      logger,
      isDevelopment: process.env.NODE_ENV === "development",
    });
  }

  async initialize(): Promise<void> {
    if (!this.oprfSeed.length || !this.serverKeypair) {
      this.oprfSeed = generateOprfSeed();
      this.serverKeypair = await generateServerKeypair();
    }

    // Now initialize the CloudflareOpaqueServer
    this.server = new CloudflareOpaqueServer(
      this.config,
      this.oprfSeed,
      this.serverKeypair,
      this.serverIdentity
    );
  }

  setPersistedState(state: {
    oprfSeed: number[];
    serverKeypair: AKEExportKeyPair;
    serverIdentity?: string;
  }): void {
    this.oprfSeed = state.oprfSeed;
    this.serverKeypair = state.serverKeypair;
    if (state.serverIdentity) this.serverIdentity = state.serverIdentity;
  }

  getPersistableState(): {
    oprfSeed: number[];
    serverKeypair: AKEExportKeyPair;
    serverIdentity: string;
  } {
    if (!this.serverKeypair || !this.oprfSeed.length) {
      throw new Error("Server not initialized");
    }
    return {
      oprfSeed: this.oprfSeed,
      serverKeypair: this.serverKeypair,
      serverIdentity: this.serverIdentity,
    };
  }

  getServerSetup() {
    if (!this.serverKeypair) {
      throw new Error("Server not initialized. Call initialize() first.");
    }
    return {
      serverPublicKey: new Uint8Array(this.serverKeypair.public_key),
    };
  }

  async startRegistration(request: Uint8Array, _identityS: string, identityU: string) {
    // Validate request data
    this.secureLogger.logDebugInfo("server.startRegistration called", { hasRequest: !!request });
    if (!request || request.length === 0) {
      throw new Error("Registration request is empty");
    }

    const requestArray = Array.from(request);
    if (!requestArray.every((b) => Number.isInteger(b) && b >= 0 && b <= 255)) {
      throw new Error("Invalid byte values in registration request");
    }
    let req: RegistrationRequest;
    try {
      req = RegistrationRequest.deserialize(this.config, requestArray);
    } catch (error) {
      this.secureLogger.logSecureError("Failed to deserialize registration request", error);
      throw new Error(
        `Failed to deserialize registration request: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    if (!this.server) {
      throw new Error("Server not initialized. Call initialize() first.");
    }

    const response = await this.server.registerInit(req, identityU);
    if (response instanceof Error) {
      this.secureLogger.logOpaqueOperation("registration_start", {
        identityU,
        success: false,
        error: response.message,
      });
      throw new Error(`Registration failed: ${response.message}`);
    }

    this.secureLogger.logOpaqueOperation("registration_start", {
      identityU,
      success: true,
    });

    return {
      response: new Uint8Array(response.serialize()),
    };
  }

  async finishRegistration(upload: Uint8Array, _identityS: string, _identityU: string) {
    // Validate upload data
    if (!upload || upload.length === 0) {
      throw new Error("Upload data is empty");
    }

    const uploadArray = Array.from(upload);
    if (!uploadArray.every((b) => Number.isInteger(b) && b >= 0 && b <= 255)) {
      throw new Error("Invalid byte values in upload data");
    }

    // The upload IS the RegistrationRecord, not a CredentialFile
    let record: RegistrationRecord;
    try {
      record = RegistrationRecord.deserialize(this.config, uploadArray);
    } catch (error) {
      throw new Error(
        `Failed to deserialize registration record: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    if (!this.serverKeypair) {
      throw new Error("Server not initialized. Call initialize() first.");
    }

    this.secureLogger.logOpaqueOperation("registration_finish", {
      identityU: _identityU,
      success: true,
    });

    return {
      envelope: new Uint8Array(record.serialize()),
      serverPublicKey: new Uint8Array(this.serverKeypair.public_key),
    };
  }

  async startLogin(
    request: Uint8Array,
    envelope: Uint8Array,
    _serverPubkey: Uint8Array,
    _identityS: string,
    identityU: string
  ) {
    // Validate request data
    if (!request || request.length === 0) {
      throw new Error("Login request is empty");
    }

    // Convert to number array and validate each byte
    const requestArray = Array.from(request);
    if (!requestArray.every((b) => Number.isInteger(b) && b >= 0 && b <= 255)) {
      throw new Error("Invalid byte values in login request");
    }

    let ke1: KE1;
    try {
      ke1 = KE1.deserialize(this.config, requestArray);
    } catch (error) {
      let recovered: Uint8Array | null = null;
      try {
        const asText = Buffer.from(request).toString("utf8");
        const maybeB64 = asText.trim();
        if (maybeB64.length > 0 && /^[A-Za-z0-9_\-+=/]+$/.test(maybeB64)) {
          recovered = fromBase64Url(maybeB64);
        }
      } catch {}
      if (!recovered) {
        try {
          const asText = Buffer.from(request).toString("utf8");
          if (asText.startsWith("[") && asText.endsWith("]")) {
            const arr = JSON.parse(asText) as number[];
            if (Array.isArray(arr)) recovered = new Uint8Array(arr);
          }
        } catch {}
      }
      if (recovered) {
        try {
          ke1 = KE1.deserialize(this.config, Array.from(recovered));
        } catch (e2) {
          throw new Error(
            `Failed to deserialize KE1 (after recovery): ${e2 instanceof Error ? e2.message : String(e2)}`
          );
        }
      } else {
        throw new Error(
          `Failed to deserialize KE1: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    // Validate envelope data
    if (!envelope || envelope.length === 0) {
      throw new Error("Envelope is empty");
    }

    const envelopeArray = Array.from(envelope);
    if (!envelopeArray.every((b) => Number.isInteger(b) && b >= 0 && b <= 255)) {
      throw new Error("Invalid byte values in envelope");
    }

    let record: RegistrationRecord;
    try {
      record = RegistrationRecord.deserialize(this.config, envelopeArray);
    } catch (error) {
      throw new Error(
        `Failed to deserialize registration record: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    if (!this.server) {
      throw new Error("Server not initialized. Call initialize() first.");
    }
    // Create a per-session server instance to avoid concurrency issues
    if (!this.serverKeypair) {
      throw new Error("Server not initialized. Call initialize() first.");
    }
    const perServer = new CloudflareOpaqueServer(
      this.config,
      this.oprfSeed,
      this.serverKeypair,
      this.serverIdentity
    );
    const ke2 = await perServer.authInit(ke1, record, identityU, identityU);
    if (ke2 instanceof Error) {
      throw new Error(`Auth init failed: ${ke2.message}`);
    }

    // Generate our own opaque session id and keep mapping
    const sid = toBase64Url(randomBytes(16));
    this.activeSessions.set(sid, perServer);

    this.secureLogger.logOpaqueOperation("login_start", {
      identityU,
      sessionId: sid,
      success: true,
    });

    this.secureLogger.logSessionEvent("created", sid, {
      count: this.activeSessions.size,
    });

    return {
      response: new Uint8Array(ke2.serialize()),
      state: new Uint8Array(Buffer.from(sid)),
    };
  }

  async finishLogin(
    clientFinish: Uint8Array,
    _serverState: Uint8Array,
    _identityS: string,
    _identityU: string
  ) {
    this.secureLogger.logDebugInfo("finishLogin called");

    // Validate clientFinish data
    if (!clientFinish || clientFinish.length === 0) {
      this.secureLogger.logSecureError("Client finish data is empty");
      throw new Error("Client finish data is empty");
    }

    const finishArray = Array.from(clientFinish);
    if (!finishArray.every((b) => Number.isInteger(b) && b >= 0 && b <= 255)) {
      this.secureLogger.logSecureError("Invalid byte values in client finish data");
      throw new Error("Invalid byte values in client finish data");
    }

    let ke3: KE3;
    try {
      ke3 = KE3.deserialize(this.config, finishArray);
      this.secureLogger.logDebugInfo("Successfully deserialized KE3");
    } catch (error) {
      this.secureLogger.logSecureError("Failed to deserialize KE3", error);
      throw new Error(
        `Failed to deserialize KE3: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    const sid = Buffer.from(_serverState || []).toString();
    this.secureLogger.logDebugInfo("Looking up session", {
      hasSession: this.activeSessions.has(sid),
    });

    const perServer = this.activeSessions.get(sid);
    if (!perServer) {
      this.secureLogger.logSecureError("Session not found");
      throw new Error("Invalid or expired login session");
    }

    this.secureLogger.logDebugInfo("Calling authFinish on server");
    const result = perServer.authFinish(ke3);

    if (result instanceof Error) {
      this.secureLogger.logOpaqueOperation("login_finish", {
        identityU: _identityU,
        sessionId: sid,
        success: false,
        error: result.message,
      });
      throw new Error(`Auth finish failed: ${result.message}`);
    }

    this.secureLogger.logOpaqueOperation("login_finish", {
      identityU: _identityU,
      sessionId: sid,
      success: true,
    });

    this.secureLogger.logSessionEvent("deleted", sid, {
      count: this.activeSessions.size - 1,
    });

    const out = {
      sessionKey: new Uint8Array(result.session_key),
    };
    this.activeSessions.delete(sid);
    return out;
  }
}

/**
 * OPAQUE client implementation (class-based, wrapped by functional interface)
 */
export class OpaqueClient {
  private client: CloudflareOpaqueClient | null = null;
  private config: Config;

  constructor() {
    this.config = new OpaqueConfig(OpaqueID.OPAQUE_P256);
  }

  async initialize(): Promise<void> {
    // Client is created per operation
  }

  async startRegistration(password: string, _identityU: string) {
    try {
      this.client = new CloudflareOpaqueClient(this.config);
      const result = await this.client.registerInit(password);
      if (result instanceof Error) {
        throw new Error(`registerInit failed: ${result.message}`);
      }
      const serialized = result.serialize();

      // registerInit returns RegistrationRequest directly or throws
      return {
        request: new Uint8Array(serialized),
        state: new Uint8Array(), // Client state is managed internally
      };
    } catch (error) {
      throw new Error(
        `Registration init failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async finishRegistration(
    response: Uint8Array,
    _state: Uint8Array,
    _serverPublicKey: Uint8Array,
    identityS: string,
    identityU: string
  ) {
    if (!this.client) {
      throw new Error("Client not initialized");
    }

    try {
      let resp: RegistrationResponse;
      try {
        resp = RegistrationResponse.deserialize(this.config, Array.from(response));
      } catch (error) {
        throw new Error(
          `Failed to deserialize registration response: ${error instanceof Error ? error.message : String(error)}`
        );
      }
      const result = await this.client.registerFinish(resp, identityS, identityU);

      // Check if registerFinish returned an error
      if (result instanceof Error) {
        throw new Error(`registerFinish failed: ${result.message}`);
      }

      // registerFinish returns the result directly
      return {
        upload: new Uint8Array(result.record.serialize()),
        export_key: new Uint8Array(result.export_key),
      };
    } catch (error) {
      throw new Error(
        `Registration finish failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async startLogin(password: string, _identityU: string) {
    try {
      this.client = new CloudflareOpaqueClient(this.config);
      const result = await this.client.authInit(password);
      if (result instanceof Error) {
        throw new Error(`authInit failed: ${result.message}`);
      }

      return {
        request: new Uint8Array(result.serialize()),
        state: new Uint8Array(), // Client state is managed internally
      };
    } catch (error) {
      throw new Error(
        `Auth init failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async finishLogin(
    response: Uint8Array,
    _state: Uint8Array,
    _serverPublicKey: Uint8Array,
    identityS: string,
    identityU: string
  ) {
    if (!this.client) {
      throw new Error("Client not initialized");
    }

    try {
      let ke2: KE2;
      try {
        ke2 = KE2.deserialize(this.config, Array.from(response));
      } catch (error) {
        throw new Error(
          `Failed to deserialize KE2: ${error instanceof Error ? error.message : String(error)}`
        );
      }
      const result = await this.client.authFinish(ke2, identityS, identityU, undefined);

      // Check if authFinish returned an error
      if (result instanceof Error) {
        throw new Error(`authFinish failed: ${result.message}`);
      }

      // authFinish returns the result directly
      return {
        finish: new Uint8Array(result.ke3.serialize()),
        export_key: new Uint8Array(result.export_key),
        session_key: new Uint8Array(result.session_key),
      };
    } catch (error) {
      throw new Error(
        `Auth finish failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}

// Functional Service Interface Types
export interface OpaqueServerState {
  oprfSeed: number[];
  serverKeypair: AKEExportKeyPair;
  serverIdentity?: string;
}

export interface OpaqueServerSetup {
  serverPublicKey: Uint8Array;
}

export interface OpaqueRegistrationResponse {
  response: Uint8Array;
}

export interface OpaqueRegistrationResult {
  envelope: Uint8Array;
  serverPublicKey: Uint8Array;
}

export interface OpaqueLoginResponse {
  response: Uint8Array;
  state: Uint8Array;
}

export interface OpaqueLoginResult {
  sessionKey: Uint8Array;
}

export interface OpaqueClientRegistrationStart {
  request: Uint8Array;
  state: Uint8Array;
}

export interface OpaqueClientRegistrationResult {
  upload: Uint8Array;
  export_key: Uint8Array;
}

export interface OpaqueClientLoginStart {
  request: Uint8Array;
  state: Uint8Array;
}

export interface OpaqueClientLoginResult {
  finish: Uint8Array;
  export_key: Uint8Array;
  session_key: Uint8Array;
}

/**
 * Functional OPAQUE Server Interface
 *
 * Encapsulates stateful OPAQUE server operations behind a clean functional API.
 * Maintains compatibility with existing storage formats and protocol behavior.
 */
export interface OpaqueServerService {
  getSetup(): OpaqueServerSetup;
  getState(): OpaqueServerState;
  setState(state: OpaqueServerState): void;
  startRegistration(
    request: Uint8Array,
    identityU: string,
    identityS?: string
  ): Promise<OpaqueRegistrationResponse>;
  finishRegistration(
    upload: Uint8Array,
    identityU: string,
    identityS?: string
  ): Promise<OpaqueRegistrationResult>;
  startLogin(
    request: Uint8Array,
    envelope: Uint8Array,
    serverPubkey: Uint8Array,
    identityU: string,
    identityS?: string
  ): Promise<OpaqueLoginResponse>;
  finishLogin(
    clientFinish: Uint8Array,
    serverState: Uint8Array,
    identityU: string,
    identityS?: string
  ): Promise<OpaqueLoginResult>;
}

/**
 * Functional OPAQUE Client Interface
 *
 * Encapsulates client-side OPAQUE operations for browser/UI integration.
 */
export interface OpaqueClientService {
  startRegistration(password: string, identityU: string): Promise<OpaqueClientRegistrationStart>;
  finishRegistration(
    response: Uint8Array,
    state: Uint8Array,
    serverPublicKey: Uint8Array,
    identityS: string,
    identityU: string
  ): Promise<OpaqueClientRegistrationResult>;
  startLogin(password: string, identityU: string): Promise<OpaqueClientLoginStart>;
  finishLogin(
    response: Uint8Array,
    state: Uint8Array,
    serverPublicKey: Uint8Array,
    identityS: string,
    identityU: string
  ): Promise<OpaqueClientLoginResult>;
}

/**
 * Create a functional OPAQUE server service
 *
 * Wraps the class-based implementation while preserving all existing behavior,
 * storage formats, and protocol compliance.
 */
export async function createOpaqueServerService(
  initialState?: OpaqueServerState,
  logger?: Logger
): Promise<OpaqueServerService> {
  const server = new OpaqueServer();
  server.setLogger(logger);

  if (initialState) {
    server.setPersistedState(initialState);
  }

  await server.initialize();

  return {
    getSetup(): OpaqueServerSetup {
      return server.getServerSetup();
    },

    getState(): OpaqueServerState {
      return server.getPersistableState();
    },

    setState(state: OpaqueServerState): void {
      server.setPersistedState(state);
    },

    async startRegistration(
      request: Uint8Array,
      identityU: string,
      identityS = "DarkAuth"
    ): Promise<OpaqueRegistrationResponse> {
      const result = await server.startRegistration(request, identityS, identityU);
      return {
        response: result.response,
      };
    },

    async finishRegistration(
      upload: Uint8Array,
      identityU: string,
      identityS = "DarkAuth"
    ): Promise<OpaqueRegistrationResult> {
      return server.finishRegistration(upload, identityS, identityU);
    },

    async startLogin(
      request: Uint8Array,
      envelope: Uint8Array,
      serverPubkey: Uint8Array,
      identityU: string,
      identityS = "DarkAuth"
    ): Promise<OpaqueLoginResponse> {
      return server.startLogin(request, envelope, serverPubkey, identityS, identityU);
    },

    async finishLogin(
      clientFinish: Uint8Array,
      serverState: Uint8Array,
      identityU: string,
      identityS = "DarkAuth"
    ): Promise<OpaqueLoginResult> {
      return server.finishLogin(clientFinish, serverState, identityS, identityU);
    },
  };
}

/**
 * Create a functional OPAQUE client service
 *
 * Wraps the class-based client implementation for browser/UI integration.
 */
export async function createOpaqueClientService(): Promise<OpaqueClientService> {
  const client = new OpaqueClient();
  await client.initialize();

  return {
    async startRegistration(
      password: string,
      identityU: string
    ): Promise<OpaqueClientRegistrationStart> {
      return client.startRegistration(password, identityU);
    },

    async finishRegistration(
      response: Uint8Array,
      state: Uint8Array,
      serverPublicKey: Uint8Array,
      identityS: string,
      identityU: string
    ): Promise<OpaqueClientRegistrationResult> {
      return client.finishRegistration(response, state, serverPublicKey, identityS, identityU);
    },

    async startLogin(password: string, identityU: string): Promise<OpaqueClientLoginStart> {
      return client.startLogin(password, identityU);
    },

    async finishLogin(
      response: Uint8Array,
      state: Uint8Array,
      serverPublicKey: Uint8Array,
      identityS: string,
      identityU: string
    ): Promise<OpaqueClientLoginResult> {
      return client.finishLogin(response, state, serverPublicKey, identityS, identityU);
    },
  };
}
