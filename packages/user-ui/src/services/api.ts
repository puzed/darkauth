import { fromBase64Url, toBase64Url } from "./crypto";
import { logger } from "./logger";

export interface ApiError {
  error: string;
  message?: string;
  details?: unknown;
}

export interface OpaqueLoginStartRequest {
  email: string;
  request: string; // base64url encoded
}

export interface OpaqueLoginStartResponse {
  message: string;
  sessionId: string;
}

export interface OpaqueLoginFinishRequest {
  finish: string;
  sessionId: string;
}

export interface OpaqueLoginFinishResponse {
  sub: string;
  sessionKey?: string;
  otpRequired?: boolean;
  unverified?: boolean;
  resendAllowed?: boolean;
  email?: string;
  user?: {
    sub: string;
    email: string | null;
    name: string | null;
  };
}

export interface OtpStatusResponse {
  enabled: boolean;
  verified: boolean;
  created_at?: string | null;
  last_used_at?: string | null;
  backup_codes_remaining?: number;
  required?: boolean;
}

export interface OpaqueRegisterStartRequest {
  request: string; // base64url encoded
  email?: string; // optional identity for binding
}

export interface OpaqueRegisterStartResponse {
  message: string; // base64url encoded
  serverPublicKey: string; // base64url encoded
}

export interface OpaqueRegisterFinishRequest {
  email: string;
  name: string;
  message: string; // base64url encoded
  serverPublicKey: string; // base64url encoded
}

export interface OpaqueRegisterFinishResponse {
  sub: string;
  requiresEmailVerification?: boolean;
}

export interface AuthorizeRequest {
  requestId: string;
  approve: boolean;
  drkHash?: string;
  zkKeyHash?: string;
  organizationId?: string;
}

export interface AuthorizeResponse {
  redirectUrl: string;
}

export interface SessionResponse {
  authenticated: boolean;
  sub?: string;
  name?: string;
  email?: string;
  passwordResetRequired?: boolean;
  otpRequired?: boolean;
  otpVerified?: boolean;
  keyState?: "locked" | "unlocked" | "setup_required";
  organizationId?: string;
  organizationSlug?: string;
}

export interface UserOrganization {
  organizationId: string;
  slug: string;
  name: string;
  forceOtp?: boolean;
  membershipId?: string;
  status?: string;
  roles?: Array<{ id?: string; key?: string; name?: string }>;
}

export interface SessionOrganizationResponse {
  organizationId: string;
  organizationSlug?: string;
  returnTo?: string;
  return_to?: string;
  redirectUrl?: string;
  redirect_url?: string;
}

export interface WrappedDrkResponse {
  wrapped_drk: string;
}

export interface AccountKeyResponse {
  key_id: string;
  sub: string;
  version: string;
  status: string;
}

export interface KeyEnvelopeResponse {
  envelope_id: string;
  key_id: string;
  sub: string;
  type: string;
  label?: string | null;
  wrapping_alg: string;
  wrapped_key: string;
  aad: string;
  metadata?: Record<string, unknown>;
  revoked_at?: string | null;
}

export interface KeybagResponse {
  account_keys: AccountKeyResponse[];
  envelopes: KeyEnvelopeResponse[];
}

export interface TrustedDeviceResponse {
  device_id: string;
  sub?: string;
  label?: string | null;
  public_jwk?: JsonWebKey | null;
  public_key_jwk?: JsonWebKey | null;
  key_handle?: string | null;
  key_handle_metadata?: Record<string, unknown> | null;
  envelope_id?: string | null;
  created_at?: string | null;
  last_seen_at?: string | null;
  last_used_at?: string | null;
  revoked_at?: string | null;
}

export interface DeviceApprovalResponse {
  request_id: string;
  sub?: string;
  new_device_public_jwk?: JsonWebKey | null;
  client_id?: string | null;
  state_hash?: string | null;
  verification_code_hash?: string | null;
  verification_code?: string | null;
  status?: string | null;
  expires_at?: string | null;
  approved_by_device_id?: string | null;
  encrypted_approval?: string | null;
  approval_aad?: string | null;
  created_at?: string | null;
}

export interface RecoveryKeyCreateRequest {
  recoveryKeyId?: string;
  envelopeId?: string;
  keyId: string;
  label?: string | null;
  wrappingAlg: string;
  wrappedKey: string;
  aad: string;
  verifier: string;
  metadata?: Record<string, unknown>;
}

export interface RecoveryKeyResponse {
  recovery_key_id: string;
  sub?: string;
  envelope_id?: string;
  label?: string | null;
  verifier_alg?: string;
  envelope?: KeyEnvelopeResponse;
  created_at?: string | null;
  last_used_at?: string | null;
  revoked_at?: string | null;
}

export interface WebAuthnCredentialResponse {
  credential_id: string;
  sub: string;
  label?: string | null;
  transports?: string[];
  backup_eligible?: boolean;
  backup_state?: boolean;
  user_verified?: boolean;
  prf_supported?: boolean;
  can_unlock?: boolean;
  prf_envelope_id?: string | null;
  created_at?: string | null;
  last_used_at?: string | null;
  revoked_at?: string | null;
}

export interface WebAuthnRegisterStartResponse {
  challenge_id: string;
  public_key: Omit<
    PublicKeyCredentialCreationOptions,
    "challenge" | "user" | "excludeCredentials"
  > & {
    challenge: string;
    user: Omit<PublicKeyCredentialUserEntity, "id"> & { id: string };
    excludeCredentials?: Array<Omit<PublicKeyCredentialDescriptor, "id"> & { id: string }>;
  };
}

export interface WebAuthnLoginStartResponse {
  challenge_id: string;
  public_key: Omit<PublicKeyCredentialRequestOptions, "challenge" | "allowCredentials"> & {
    challenge: string;
    allowCredentials?: Array<Omit<PublicKeyCredentialDescriptor, "id"> & { id: string }>;
  };
}

export interface WebAuthnLoginFinishResponse {
  sub: string;
  key_state?: "locked" | "unlocked" | "setup_required";
  credential: WebAuthnCredentialResponse;
  unlock?: {
    prf_salt: string;
    envelope: KeyEnvelopeResponse;
  } | null;
}

export interface FederationConnectionRoute {
  id: string;
  type: "oidc";
  name: string;
  issuer: string;
  clientId: string;
  authorizationEndpoint: string;
  scopes: string[];
  enabled: boolean;
}

export interface PasswordResetRequestResponse {
  success: boolean;
  message: string;
}

export interface PasswordResetTokenResponse {
  valid: boolean;
  email?: string;
}

export interface PasswordResetStartResponse {
  message: string;
  serverPublicKey: string;
  identityU: string;
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function encodeDeviceApprovalEnvelope(value: string): string {
  return value.includes(".") ? toBase64Url(textEncoder.encode(value)) : value;
}

function decodeDeviceApprovalEnvelope(value?: string | null): string | null | undefined {
  if (!value || value.includes(".")) return value;
  try {
    const decoded = textDecoder.decode(fromBase64Url(value));
    return decoded.includes(".") ? decoded : value;
  } catch {
    return value;
  }
}

function normalizeDeviceApproval(approval: DeviceApprovalResponse): DeviceApprovalResponse {
  return {
    ...approval,
    encrypted_approval: decodeDeviceApprovalEnvelope(approval.encrypted_approval),
  };
}

class ApiService {
  private baseUrl: string;
  private onSessionExpired?: () => void;
  private refreshInFlight: Promise<boolean> | null = null;

  constructor() {
    this.baseUrl = "/api/user";
    this.clearLegacyTokens();
  }

  setSessionExpiredCallback(callback: () => void): void {
    this.onSessionExpired = callback;
  }

  clearLegacyTokens(): void {
    localStorage.removeItem("userAccessToken");
    localStorage.removeItem("userRefreshToken");
  }

  private getClientId(): string {
    const appConfig = window as Window & {
      __APP_CONFIG__?: { clientId?: string; auth?: { clientId?: string } };
    };
    return appConfig.__APP_CONFIG__?.clientId || appConfig.__APP_CONFIG__?.auth?.clientId || "user";
  }

  private async refreshSessionWithToken(): Promise<boolean> {
    if (!this.refreshInFlight) {
      this.refreshInFlight = (async () => {
        const response = await fetch(`${this.baseUrl}/token`, {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "refresh_token",
            client_id: this.getClientId(),
          }),
          credentials: "include",
        });
        if (!response.ok) {
          return false;
        }
        return true;
      })()
        .catch(() => false)
        .finally(() => {
          this.refreshInFlight = null;
        });
    }
    return this.refreshInFlight;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    const headers = new Headers({ "Content-Type": "application/json" });
    if (options.headers) {
      const incoming = new Headers(options.headers as HeadersInit);
      incoming.forEach((v, k) => {
        headers.set(k, v);
      });
    }

    const method = (options.method || "GET").toUpperCase();
    if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
      const csrf = document.cookie
        .split(";")
        .map((part) => part.trim())
        .find((part) => part.startsWith("__Host-DarkAuth-User-Csrf="))
        ?.slice("__Host-DarkAuth-User-Csrf=".length);
      if (csrf) {
        headers.set("x-csrf-token", decodeURIComponent(csrf));
      }
    }

    const config: RequestInit = {
      ...options,
      headers,
      credentials: "include",
    };

    try {
      let response = await fetch(url, config);
      if (
        !response.ok &&
        (response.status === 401 || response.status === 403) &&
        endpoint !== "/token"
      ) {
        const refreshed = await this.refreshSessionWithToken();
        if (refreshed) {
          response = await fetch(url, config);
        }
      }

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          this.clearLegacyTokens();
          if (this.onSessionExpired) {
            this.onSessionExpired();
          }
        }

        const err = new Error(
          data.error || `HTTP ${response.status}: ${response.statusText}`
        ) as Error & {
          code?: string;
          details?: unknown;
          unverified?: boolean;
          resendAllowed?: boolean;
          email?: string;
        };
        if (typeof data.code === "string") err.code = data.code;
        if (data.details !== undefined) err.details = data.details;
        if (data.unverified === true) err.unverified = true;
        if (data.resendAllowed === true) err.resendAllowed = true;
        if (typeof data.email === "string") err.email = data.email;
        throw err;
      }

      return data;
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error("Network error occurred");
    }
  }

  // OPAQUE Authentication
  async opaqueLoginStart(request: OpaqueLoginStartRequest): Promise<OpaqueLoginStartResponse> {
    return this.request("/opaque/login/start", {
      method: "POST",
      body: JSON.stringify(request),
    });
  }

  async opaqueLoginFinish(request: OpaqueLoginFinishRequest): Promise<OpaqueLoginFinishResponse> {
    return this.request<OpaqueLoginFinishResponse>("/opaque/login/finish", {
      method: "POST",
      body: JSON.stringify(request),
    });
  }

  async opaqueRegisterStart(
    request: OpaqueRegisterStartRequest
  ): Promise<OpaqueRegisterStartResponse> {
    const debug = (() => {
      try {
        const b64 = request.request || "";
        const raw = atob(
          b64
            .replace(/-/g, "+")
            .replace(/_/g, "/")
            .padEnd(b64.length + ((4 - (b64.length % 4)) % 4), "=")
        );
        const len = raw.length;
        const head = Array.from(raw.slice(0, 8))
          .map((c) => c.charCodeAt(0).toString(16).padStart(2, "0"))
          .join("");
        return { len, head };
      } catch {
        return { len: -1, head: "" };
      }
    })();
    const payload: OpaqueRegisterStartRequest & { __debug: { len: number; head: string } } = {
      ...request,
      __debug: debug,
    };
    return this.request("/opaque/register/start", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async opaqueRegisterFinish(
    request: OpaqueRegisterFinishRequest
  ): Promise<OpaqueRegisterFinishResponse> {
    return this.request<OpaqueRegisterFinishResponse>("/opaque/register/finish", {
      method: "POST",
      body: JSON.stringify(request),
    });
  }

  async resendEmailVerification(email: string): Promise<{ success: boolean; message: string }> {
    return this.request("/email/verification/resend", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
  }

  async verifyEmailToken(token: string): Promise<{ success: boolean; message: string }> {
    return this.request("/email/verification/verify", {
      method: "POST",
      body: JSON.stringify({ token }),
    });
  }

  async requestEmailChange(email: string): Promise<{ success: boolean; message: string }> {
    return this.request("/profile/email", {
      method: "PUT",
      body: JSON.stringify({ email }),
    });
  }

  // Session Management
  async getSession(): Promise<SessionResponse> {
    return this.request("/session");
  }

  async getOrganizations(): Promise<{ organizations: UserOrganization[] }> {
    return this.request("/organizations");
  }

  async setSessionOrganization(
    organizationId: string,
    options: { returnTo?: string; clientId?: string } = {}
  ): Promise<SessionOrganizationResponse> {
    return this.request("/session/organization", {
      method: "POST",
      body: JSON.stringify({
        organization_id: organizationId,
        return_to: options.returnTo,
        client_id: options.clientId,
      }),
    });
  }

  async getClientScopeDescriptions(
    clientId: string,
    scopes: string[]
  ): Promise<Record<string, string>> {
    const query = new URLSearchParams();
    query.set("client_id", clientId);
    if (scopes.length > 0) {
      query.set("scopes", scopes.join(" "));
    }
    const data = await this.request<{ descriptions?: Record<string, string> }>(
      `/scope-descriptions?${query.toString()}`
    );
    return data.descriptions || {};
  }

  async logout(): Promise<void> {
    await this.request("/logout", {
      method: "POST",
    });
    this.clearLegacyTokens();
  }

  async getOtpStatus(): Promise<OtpStatusResponse> {
    return this.request("/otp/status");
  }

  async otpSetupInit(): Promise<{ secret: string; provisioning_uri: string }> {
    return this.request("/otp/setup/init", { method: "POST" });
  }

  async otpSetupVerify(code: string): Promise<{ success: boolean; backup_codes: string[] }> {
    return this.request<{ success: boolean; backup_codes: string[] }>("/otp/setup/verify", {
      method: "POST",
      body: JSON.stringify({ code }),
    });
  }

  async otpVerify(code: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>("/otp/verify", {
      method: "POST",
      body: JSON.stringify({ code }),
    });
  }

  // Password change (self)
  async passwordChangeStart(
    requestB64Url: string
  ): Promise<{ message: string; serverPublicKey: string; identityU: string }> {
    return this.request("/password/change/start", {
      method: "POST",
      body: JSON.stringify({ request: requestB64Url }),
    });
  }

  async passwordChangeFinish(
    recordB64Url: string,
    exportKeyHashB64Url: string,
    reauthToken?: string
  ): Promise<{ success: boolean }> {
    return this.request("/password/change/finish", {
      method: "POST",
      body: JSON.stringify({
        record: recordB64Url,
        export_key_hash: exportKeyHashB64Url,
        reauth_token: reauthToken,
      }),
    });
  }

  // Password change reauth (OPAQUE verify)
  async passwordVerifyStart(
    requestB64Url: string
  ): Promise<{ message: string; sessionId: string }> {
    return this.request("/password/change/verify/start", {
      method: "POST",
      body: JSON.stringify({ request: requestB64Url }),
    });
  }

  async passwordVerifyFinish(
    finishB64Url: string,
    sessionId: string
  ): Promise<{ reauth_token: string }> {
    return this.request("/password/change/verify/finish", {
      method: "POST",
      body: JSON.stringify({ finish: finishB64Url, sessionId }),
    });
  }

  async passwordRecoveryVerifyStart(
    requestB64Url: string
  ): Promise<{ message: string; sessionId: string }> {
    return this.request("/password/recovery/verify/start", {
      method: "POST",
      body: JSON.stringify({ request: requestB64Url }),
    });
  }

  async passwordRecoveryVerifyFinish(
    finishB64Url: string,
    sessionId: string
  ): Promise<{ success: boolean }> {
    return this.request("/password/recovery/verify/finish", {
      method: "POST",
      body: JSON.stringify({ finish: finishB64Url, sessionId }),
    });
  }

  async requestPasswordReset(email: string): Promise<PasswordResetRequestResponse> {
    return this.request("/password/reset/request", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
  }

  async getPasswordResetToken(token: string): Promise<PasswordResetTokenResponse> {
    const query = new URLSearchParams({ token });
    return this.request(`/password/reset/token?${query.toString()}`);
  }

  async passwordResetStart(
    token: string,
    requestB64Url: string
  ): Promise<PasswordResetStartResponse> {
    return this.request("/password/reset/start", {
      method: "POST",
      body: JSON.stringify({ token, request: requestB64Url }),
    });
  }

  async passwordResetFinish(
    token: string,
    recordB64Url: string,
    exportKeyHashB64Url: string
  ): Promise<{ success: boolean }> {
    return this.request("/password/reset/finish", {
      method: "POST",
      body: JSON.stringify({
        token,
        record: recordB64Url,
        export_key_hash: exportKeyHashB64Url,
      }),
    });
  }

  // Authorization Flow
  async authorize(request: AuthorizeRequest): Promise<AuthorizeResponse> {
    const params = new URLSearchParams();
    params.set("request_id", request.requestId);
    params.set("approve", request.approve ? "true" : "false");
    if (request.drkHash) {
      params.set("drk_hash", request.drkHash);
    }
    if (request.zkKeyHash) {
      params.set("zk_key_hash", request.zkKeyHash);
    }
    if (request.organizationId) {
      params.set("organization_id", request.organizationId);
    }

    const data = await this.request<
      | { redirect_uri: string; code: string; state?: string }
      | {
          redirect_uri: string;
          error: "access_denied";
          error_description?: string;
          state?: string;
        }
    >("/authorize/finalize", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    const redirectUri: string = data.redirect_uri;
    const state: string | undefined = data.state;
    const searchParams = new URLSearchParams();
    if ("code" in data) {
      searchParams.set("code", data.code);
    }
    if ("error" in data) {
      searchParams.set("error", data.error);
      if (data.error_description) {
        searchParams.set("error_description", data.error_description);
      }
    }
    if (state) {
      searchParams.set("state", state);
    }
    const redirectUrl = `${redirectUri}${
      redirectUri.includes("?") ? "&" : "?"
    }${searchParams.toString()}`;

    return { redirectUrl };
  }

  // Zero-Knowledge Delivery
  async getWrappedDrk(): Promise<string> {
    const data = await this.request<WrappedDrkResponse>("/crypto/wrapped-drk");
    return data.wrapped_drk;
  }

  async putWrappedDrk(wrappedDrkBase64Url: string): Promise<void> {
    const body = JSON.stringify({ wrapped_drk: wrappedDrkBase64Url });
    await this.request("/crypto/wrapped-drk", { method: "PUT", body });
  }

  async getKeybag(): Promise<KeybagResponse> {
    return this.request<KeybagResponse>("/crypto/keybag");
  }

  async createAccountKey(request: {
    keyId?: string;
    version?: string;
  }): Promise<AccountKeyResponse> {
    const data = await this.request<{ account_key: AccountKeyResponse }>(
      "/crypto/keybag/account-key",
      {
        method: "POST",
        body: JSON.stringify({
          key_id: request.keyId,
          version: request.version,
        }),
      }
    );
    return data.account_key;
  }

  async createKeyEnvelope(request: {
    envelopeId?: string;
    keyId: string;
    type: "password" | "passkey_prf" | "trusted_device" | "recovery";
    label?: string | null;
    wrappingAlg: string;
    wrappedKey: string;
    aad: string;
    metadata?: Record<string, unknown>;
  }): Promise<KeyEnvelopeResponse> {
    const data = await this.request<{ envelope: KeyEnvelopeResponse }>("/crypto/keybag/envelopes", {
      method: "POST",
      body: JSON.stringify({
        envelope_id: request.envelopeId,
        key_id: request.keyId,
        type: request.type,
        label: request.label,
        wrapping_alg: request.wrappingAlg,
        wrapped_key: request.wrappedKey,
        aad: request.aad,
        metadata: request.metadata,
      }),
    });
    return data.envelope;
  }

  async revokeKeyEnvelope(envelopeId: string): Promise<void> {
    await this.request(`/crypto/keybag/envelopes/${encodeURIComponent(envelopeId)}`, {
      method: "DELETE",
    });
  }

  async getTrustedDevices(): Promise<TrustedDeviceResponse[]> {
    const data = await this.request<
      | { devices?: TrustedDeviceResponse[]; trusted_devices?: TrustedDeviceResponse[] }
      | TrustedDeviceResponse[]
    >("/crypto/devices");
    if (Array.isArray(data)) return data;
    return data.devices || data.trusted_devices || [];
  }

  async createTrustedDevice(request: {
    label?: string;
    publicKeyJwk?: JsonWebKey | null;
    keyHandle?: string | null;
    keyHandleMetadata?: Record<string, unknown> | null;
    envelopeId?: string | null;
  }): Promise<TrustedDeviceResponse> {
    const data = await this.request<{ device?: TrustedDeviceResponse } | TrustedDeviceResponse>(
      "/crypto/devices",
      {
        method: "POST",
        body: JSON.stringify({
          label: request.label,
          public_jwk: request.publicKeyJwk,
          key_handle:
            request.keyHandle ??
            (request.keyHandleMetadata ? JSON.stringify(request.keyHandleMetadata) : undefined),
          envelope_id: request.envelopeId,
        }),
      }
    );
    const wrapped = data as { device?: TrustedDeviceResponse };
    return wrapped.device || (data as TrustedDeviceResponse);
  }

  async revokeTrustedDevice(deviceId: string): Promise<void> {
    await this.request(`/crypto/devices/${encodeURIComponent(deviceId)}/revoke`, {
      method: "POST",
    });
  }

  async createDeviceApproval(request: {
    newDevicePublicJwk: JsonWebKey;
    authorizationRequestId?: string;
    clientId: string;
    stateHash: string;
    verificationCodeHash: string;
  }): Promise<DeviceApprovalResponse> {
    const data = await this.request<
      | { approval?: DeviceApprovalResponse; request?: DeviceApprovalResponse }
      | DeviceApprovalResponse
    >("/crypto/device-approvals", {
      method: "POST",
      body: JSON.stringify({
        new_device_public_jwk: request.newDevicePublicJwk,
        authorization_request_id: request.authorizationRequestId,
        client_id: request.clientId,
        state_hash: request.stateHash,
        verification_code_hash: request.verificationCodeHash,
      }),
    });
    const wrapped = data as { approval?: DeviceApprovalResponse; request?: DeviceApprovalResponse };
    return normalizeDeviceApproval(
      wrapped.approval || wrapped.request || (data as DeviceApprovalResponse)
    );
  }

  async getDeviceApprovals(): Promise<DeviceApprovalResponse[]> {
    const data = await this.request<
      | {
          approvals?: DeviceApprovalResponse[];
          requests?: DeviceApprovalResponse[];
          device_approval_requests?: DeviceApprovalResponse[];
        }
      | DeviceApprovalResponse[]
    >("/crypto/device-approvals");
    const approvals = Array.isArray(data)
      ? data
      : data.approvals || data.requests || data.device_approval_requests || [];
    return approvals.map(normalizeDeviceApproval);
  }

  async approveDeviceApproval(
    requestId: string,
    request: {
      encryptedApproval: string;
      approvalAad: string;
      approvalProof: string;
      approvedDeviceId?: string;
    }
  ): Promise<DeviceApprovalResponse> {
    const data = await this.request<
      | { approval?: DeviceApprovalResponse; request?: DeviceApprovalResponse }
      | DeviceApprovalResponse
    >(`/crypto/device-approvals/${encodeURIComponent(requestId)}/approve`, {
      method: "POST",
      body: JSON.stringify({
        encrypted_approval: encodeDeviceApprovalEnvelope(request.encryptedApproval),
        approved_device_id: request.approvedDeviceId,
        approval_aad: request.approvalAad,
        approval_proof: request.approvalProof,
      }),
    });
    const wrapped = data as { approval?: DeviceApprovalResponse; request?: DeviceApprovalResponse };
    return normalizeDeviceApproval(
      wrapped.approval || wrapped.request || (data as DeviceApprovalResponse)
    );
  }

  async consumeDeviceApproval(
    requestId: string,
    request: { newDeviceProof: string }
  ): Promise<DeviceApprovalResponse> {
    const data = await this.request<
      | { approval?: DeviceApprovalResponse; request?: DeviceApprovalResponse }
      | DeviceApprovalResponse
    >(`/crypto/device-approvals/${encodeURIComponent(requestId)}/consume`, {
      method: "POST",
      body: JSON.stringify({
        request_id: requestId,
        new_device_proof: request.newDeviceProof,
      }),
    });
    const wrapped = data as { approval?: DeviceApprovalResponse; request?: DeviceApprovalResponse };
    return normalizeDeviceApproval(
      wrapped.approval || wrapped.request || (data as DeviceApprovalResponse)
    );
  }

  async denyDeviceApproval(requestId: string): Promise<void> {
    await this.request(`/crypto/device-approvals/${encodeURIComponent(requestId)}/deny`, {
      method: "POST",
    });
  }

  async createRecoveryKey(request: RecoveryKeyCreateRequest): Promise<RecoveryKeyResponse> {
    const data = await this.request<{ recovery_key: RecoveryKeyResponse } | RecoveryKeyResponse>(
      "/crypto/recovery-keys",
      {
        method: "POST",
        body: JSON.stringify({
          recovery_key_id: request.recoveryKeyId,
          envelope_id: request.envelopeId,
          key_id: request.keyId,
          label: request.label,
          wrapping_alg: request.wrappingAlg,
          wrapped_key: request.wrappedKey,
          aad: request.aad,
          verifier: request.verifier,
          metadata: request.metadata,
        }),
      }
    );
    return "recovery_key" in data ? data.recovery_key : data;
  }

  async getRecoveryKeys(): Promise<RecoveryKeyResponse[]> {
    const data = await this.request<
      { recovery_keys: RecoveryKeyResponse[] } | RecoveryKeyResponse[]
    >("/crypto/recovery-keys");
    return Array.isArray(data) ? data : data.recovery_keys;
  }

  async recordRecoveryKeyUse(
    recoveryKeyId: string,
    verifier: string
  ): Promise<RecoveryKeyResponse> {
    const data = await this.request<{ recovery_key: RecoveryKeyResponse } | RecoveryKeyResponse>(
      `/crypto/recovery-keys/${encodeURIComponent(recoveryKeyId)}/use`,
      {
        method: "POST",
        body: JSON.stringify({ verifier }),
      }
    );
    return "recovery_key" in data ? data.recovery_key : data;
  }

  async revokeRecoveryKey(recoveryKeyId: string): Promise<void> {
    await this.request(`/crypto/recovery-keys/${encodeURIComponent(recoveryKeyId)}/revoke`, {
      method: "POST",
    });
  }

  async rotateRecoveryKey(request: RecoveryKeyCreateRequest): Promise<RecoveryKeyResponse> {
    return this.createRecoveryKey(request);
  }

  async putEncPublicJwk(jwk: JsonWebKey): Promise<void> {
    const body = JSON.stringify({ enc_public_jwk: jwk });
    await this.request("/crypto/enc-pub", { method: "PUT", body });
  }

  async putWrappedEncPrivateJwk(wrappedBase64Url: string): Promise<void> {
    const body = JSON.stringify({ wrapped_enc_private_jwk: wrappedBase64Url });
    await this.request("/crypto/wrapped-enc-priv", { method: "PUT", body });
  }

  async webAuthnRegisterStart(): Promise<WebAuthnRegisterStartResponse> {
    return this.request<WebAuthnRegisterStartResponse>("/webauthn/register/start", {
      method: "POST",
    });
  }

  async webAuthnRegisterFinish(request: {
    challengeId: string;
    response: unknown;
    label?: string | null;
  }): Promise<{ credential: WebAuthnCredentialResponse }> {
    return this.request<{ credential: WebAuthnCredentialResponse }>("/webauthn/register/finish", {
      method: "POST",
      body: JSON.stringify({
        challenge_id: request.challengeId,
        response: request.response,
        label: request.label,
      }),
    });
  }

  async webAuthnLoginStart(): Promise<WebAuthnLoginStartResponse> {
    return this.request<WebAuthnLoginStartResponse>("/webauthn/login/start", {
      method: "POST",
    });
  }

  async webAuthnLoginFinish(request: {
    challengeId: string;
    response: unknown;
    prfResultConfirmed?: boolean;
  }): Promise<WebAuthnLoginFinishResponse> {
    return this.request<WebAuthnLoginFinishResponse>("/webauthn/login/finish", {
      method: "POST",
      body: JSON.stringify({
        challenge_id: request.challengeId,
        response: request.response,
        prf_result_confirmed: request.prfResultConfirmed,
      }),
    });
  }

  async createPasskeyPrfEnvelope(request: {
    credentialId: string;
    keyId: string;
    envelopeId?: string;
    label?: string | null;
    wrappingAlg: string;
    wrappedKey: string;
    aad: string;
    prfSalt: string;
    prfResultConfirmed: true;
    metadata?: Record<string, unknown>;
  }): Promise<KeyEnvelopeResponse> {
    const data = await this.request<{ envelope: KeyEnvelopeResponse }>("/webauthn/prf-envelope", {
      method: "POST",
      body: JSON.stringify({
        credential_id: request.credentialId,
        key_id: request.keyId,
        envelope_id: request.envelopeId,
        label: request.label,
        wrapping_alg: request.wrappingAlg,
        wrapped_key: request.wrappedKey,
        aad: request.aad,
        prf_salt: request.prfSalt,
        prf_result_confirmed: request.prfResultConfirmed,
        metadata: request.metadata,
      }),
    });
    return data.envelope;
  }

  async getWebAuthnCredentials(): Promise<WebAuthnCredentialResponse[]> {
    const data = await this.request<
      { credentials: WebAuthnCredentialResponse[] } | WebAuthnCredentialResponse[]
    >("/webauthn/credentials");
    return Array.isArray(data) ? data : data.credentials;
  }

  async revokeWebAuthnCredential(credentialId: string): Promise<WebAuthnCredentialResponse> {
    const data = await this.request<
      { credential: WebAuthnCredentialResponse } | WebAuthnCredentialResponse
    >(`/webauthn/credentials/${encodeURIComponent(credentialId)}/revoke`, {
      method: "POST",
    });
    return "credential" in data ? data.credential : data;
  }

  async getFederationRoute(email: string): Promise<FederationConnectionRoute | null> {
    const query = new URLSearchParams({ email });
    const data = await this.request<{ connection: FederationConnectionRoute | null }>(
      `/federation/route?${query.toString()}`
    );
    return data.connection;
  }

  async getUserApps(): Promise<{
    apps: Array<{
      id: string;
      name: string;
      description?: string;
      url?: string;
      logoUrl?: string;
      iconMode?: "letter" | "emoji" | "upload";
      iconEmoji?: string;
      iconLetter?: string;
      iconUrl?: string;
    }>;
  }> {
    try {
      return await this.request("/apps", {
        method: "GET",
      });
    } catch (error) {
      // Return empty array if endpoint doesn't exist yet
      logger.warn(error, "Failed to fetch user apps");
      return { apps: [] };
    }
  }
}

export const apiService = new ApiService();
export default apiService;
