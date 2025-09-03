/**
 * Client-side OPAQUE implementation for Auth UI
 * Uses the Cloudflare opaque-ts library
 * RFC 9380 compliant implementation
 */

import {
  OpaqueClient as CloudflareOpaqueClient,
  KE2,
  OpaqueConfig,
  OpaqueID,
  RegistrationResponse,
} from "opaque-ts";
import { fromBase64Url, toBase64Url } from "./crypto";

// Default OPAQUE configuration using P256 cipher suite
const defaultConfig = new OpaqueConfig(OpaqueID.OPAQUE_P256);

export interface OpaqueLoginState {
  client: CloudflareOpaqueClient;
  password: string;
  email: string;
}

export interface OpaqueRegistrationState {
  client: CloudflareOpaqueClient;
  password: string;
  passwordKey: Uint8Array;
}

export interface OpaqueLoginStartResult {
  request: string; // base64url encoded
  state: OpaqueLoginState;
}

export interface OpaqueLoginFinishResult {
  request: string; // base64url encoded
  sessionKey: Uint8Array;
  exportKey: Uint8Array;
}

export interface OpaqueRegistrationStartResult {
  request: string; // base64url encoded
  state: OpaqueRegistrationState;
}

export interface OpaqueRegistrationFinishResult {
  request: string; // base64url encoded
  passwordKey: Uint8Array;
  exportKey: Uint8Array;
}

class OpaqueService {
  private config: OpaqueConfig;

  constructor() {
    this.config = defaultConfig;
  }

  /**
   * Start OPAQUE login - client side
   */
  async startLogin(email: string, password: string): Promise<OpaqueLoginStartResult> {
    const client = new CloudflareOpaqueClient(this.config);
    const ke1 = await client.authInit(password);
    if (ke1 instanceof Error) {
      throw ke1;
    }
    const serialized = Uint8Array.from(ke1.serialize());

    return {
      request: toBase64Url(serialized),
      state: {
        client,
        password,
        email,
      },
    };
  }

  /**
   * Finish OPAQUE login - client side
   * Returns both session key and export key
   */
  async finishLogin(
    serverResponse: string,
    state: OpaqueLoginState
  ): Promise<OpaqueLoginFinishResult> {
    const ke2 = KE2.deserialize(this.config, Array.from(fromBase64Url(serverResponse)));
    const serverIdentity = "DarkAuth";
    const clientIdentity = state.email;

    const result = await state.client.authFinish(ke2, serverIdentity, clientIdentity, undefined);
    if (result instanceof Error || !result || !(result as { ke3?: unknown }).ke3) {
      throw new Error("OPAQUE authentication failed");
    }
    const r = result as {
      ke3: { serialize(): number[] };
      session_key: ArrayLike<number>;
      export_key: ArrayLike<number>;
    };
    return {
      request: toBase64Url(r.ke3.serialize()),
      sessionKey: new Uint8Array(r.session_key),
      exportKey: new Uint8Array(r.export_key),
    };
  }

  /**
   * Start OPAQUE registration - client side
   */
  async startRegistration(
    password: string,
    _email: string
  ): Promise<OpaqueRegistrationStartResult> {
    const client = new CloudflareOpaqueClient(this.config);
    const registrationRequest = await client.registerInit(password);
    if (registrationRequest instanceof Error) {
      throw registrationRequest;
    }
    try {
      const bytes = registrationRequest.serialize();
      const head = toBase64Url(Uint8Array.from(bytes).slice(0, 12));
      console.log("[opaque] client.registerInit", { len: bytes.length, head });
    } catch {}

    return {
      request: toBase64Url(Uint8Array.from(registrationRequest.serialize())),
      state: {
        client,
        password,
        passwordKey: new Uint8Array(32), // Placeholder, will be replaced by export_key
      },
    };
  }

  /**
   * Finish OPAQUE registration - client side
   * Returns both upload message and export key
   */
  async finishRegistration(
    serverResponse: string,
    _serverPublicKey: string,
    state: OpaqueRegistrationState,
    email: string
  ): Promise<OpaqueRegistrationFinishResult> {
    const registrationResponse = RegistrationResponse.deserialize(
      this.config,
      Array.from(fromBase64Url(serverResponse))
    );
    const serverIdentity = "DarkAuth";
    const clientIdentity = email;

    const registrationRecord = await state.client.registerFinish(
      registrationResponse,
      serverIdentity,
      clientIdentity
    );

    if (registrationRecord instanceof Error) {
      throw new Error(`Registration completion failed: ${registrationRecord.message}`);
    }

    return {
      request: toBase64Url(registrationRecord.record.serialize()),
      passwordKey: new Uint8Array(registrationRecord.export_key),
      exportKey: new Uint8Array(registrationRecord.export_key),
    };
  }

  /**
   * Clear sensitive data from memory
   */
  clearState(state: OpaqueLoginState | OpaqueRegistrationState): void {
    if ("password" in state) {
      state.password = "";
    }
    if ("email" in state) {
      (state as OpaqueLoginState).email = "";
    }
    (state as unknown as { client?: unknown }).client = undefined;
    if ("passwordKey" in state) {
      state.passwordKey.fill(0);
    }
  }
}

export const opaqueService = new OpaqueService();
export default opaqueService;
