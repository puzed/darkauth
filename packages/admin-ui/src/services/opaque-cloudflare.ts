/**
 * OPAQUE Client Service for Admin UI
 * Uses the Cloudflare opaque-ts library for secure authentication
 */

import {
  OpaqueClient as CloudflareOpaqueClient,
  KE2,
  OpaqueConfig,
  OpaqueID,
  RegistrationResponse,
} from "opaque-ts";

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  const base64 = btoa(binary);
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function fromBase64Url(b64url: string): Uint8Array {
  const base64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

// Default OPAQUE configuration using P256 cipher suite
const defaultConfig = new OpaqueConfig(OpaqueID.OPAQUE_P256);

export interface AdminOpaqueLoginState {
  client: CloudflareOpaqueClient;
  password: string;
  email: string;
}

export interface AdminOpaqueRegistrationState {
  client: CloudflareOpaqueClient;
  password: string;
  passwordKey: Uint8Array;
}

export interface AdminOpaqueLoginStartResult {
  request: string; // base64url encoded
  state: AdminOpaqueLoginState;
}

export interface AdminOpaqueLoginFinishResult {
  request: string; // base64url encoded
  sessionKey: Uint8Array;
  exportKey: Uint8Array;
}

export interface AdminOpaqueRegistrationStartResult {
  request: string; // base64url encoded
  state: AdminOpaqueRegistrationState;
}

export interface AdminOpaqueRegistrationFinishResult {
  request: string; // base64url encoded
  passwordKey: Uint8Array;
}

class AdminOpaqueService {
  private config: OpaqueConfig;

  constructor() {
    this.config = defaultConfig;
  }

  // OPAQUE login start for admin
  async startLogin(email: string, password: string): Promise<AdminOpaqueLoginStartResult> {
    const client = new CloudflareOpaqueClient(this.config);
    const ke1 = await client.authInit(password);
    if (ke1 instanceof Error) throw new Error(`Login initialization failed: ${ke1.message}`);
    const serialized = Uint8Array.from(ke1.serialize());
    const encoded = toBase64Url(serialized);

    return {
      request: encoded,
      state: {
        client,
        password,
        email,
      },
    };
  }

  // OPAQUE login finish for admin
  async finishLogin(
    serverResponse: string,
    state: AdminOpaqueLoginState
  ): Promise<AdminOpaqueLoginFinishResult> {
    const responseBytes = fromBase64Url(serverResponse);
    const ke2 = KE2.deserialize(this.config, Array.from(responseBytes));
    const serverIdentity = "DarkAuth";
    const clientIdentity = state.email;
    const result = await state.client.authFinish(ke2, serverIdentity, clientIdentity, undefined);
    if (result instanceof Error) {
      if (result.message.includes("EnvelopeRecoveryError"))
        throw new Error("Incorrect email or password");
      throw new Error(`Login failed: ${result.message}`);
    }

    const r = result as {
      ke3: { serialize(): number[] };
      session_key: ArrayLike<number>;
      export_key: ArrayLike<number>;
    };
    return {
      request: toBase64Url(Uint8Array.from(r.ke3.serialize())),
      sessionKey: new Uint8Array(r.session_key),
      exportKey: new Uint8Array(r.export_key),
    };
  }

  // OPAQUE registration start for admin
  async startRegistration(password: string): Promise<AdminOpaqueRegistrationStartResult> {
    const client = new CloudflareOpaqueClient(this.config);
    const registrationRequest = await client.registerInit(password);
    if (registrationRequest instanceof Error) {
      throw new Error(`Registration initialization failed: ${registrationRequest.message}`);
    }

    return {
      request: toBase64Url(Uint8Array.from(registrationRequest.serialize())),
      state: {
        client,
        password,
        passwordKey: new Uint8Array(32),
      },
    };
  }

  // OPAQUE registration finish for admin
  // NOTE: This is never actually used - registration happens server-side during installation
  async finishRegistration(
    serverResponse: string,
    _serverPublicKey: string,
    state: AdminOpaqueRegistrationState,
    clientIdentity?: string
  ): Promise<AdminOpaqueRegistrationFinishResult> {
    const registrationResponse = RegistrationResponse.deserialize(
      this.config,
      Array.from(fromBase64Url(serverResponse))
    );
    // Keep identities consistent with server usage; strings are accepted
    const serverIdentity = "DarkAuth";
    const clientId = clientIdentity || "admin";

    const registrationRecord = await state.client.registerFinish(
      registrationResponse,
      serverIdentity,
      clientId
    );

    // Check if registerFinish returned an error
    if (registrationRecord instanceof Error) {
      throw new Error(`Registration completion failed: ${registrationRecord.message}`);
    }

    const rec = registrationRecord as unknown as {
      record: { serialize(): number[] };
      export_key: ArrayLike<number>;
    };
    return {
      request: toBase64Url(Uint8Array.from(rec.record.serialize())),
      passwordKey: new Uint8Array(rec.export_key),
    };
  }

  // Utility method to clear sensitive data
  clearState(state: AdminOpaqueLoginState | AdminOpaqueRegistrationState): void {
    if ("password" in state) {
      state.password = "";
    }
    if ("email" in state) {
      (state as AdminOpaqueLoginState).email = "";
    }
    (state as unknown as { client?: unknown }).client = undefined;
    if ("passwordKey" in state) {
      state.passwordKey.fill(0);
    }
  }
}

export const adminOpaqueService = new AdminOpaqueService();
export default adminOpaqueService;
