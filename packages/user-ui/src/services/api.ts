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
  sub: string;
  sessionId: string;
}

export interface OpaqueLoginFinishRequest {
  sub: string;
  finish: string;
  sessionId: string;
}

export interface OpaqueLoginFinishResponse {
  accessToken: string;
  sub: string;
  refreshToken?: string;
  sessionKey?: string;
  otpRequired?: boolean;
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
  accessToken: string;
  refreshToken: string;
}

export interface AuthorizeRequest {
  requestId: string;
  approve: boolean;
  drkHash?: string;
  drkJwe?: string;
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
}

export interface WrappedDrkResponse {
  wrapped_drk: string;
}

class ApiService {
  private baseUrl: string;
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private isRefreshing = false;
  private refreshPromise: Promise<void> | null = null;
  private onSessionExpired?: () => void;

  constructor() {
    this.baseUrl = "/api/user";
    // Load tokens from localStorage if available
    this.accessToken = localStorage.getItem("userAccessToken");
    this.refreshToken = localStorage.getItem("userRefreshToken");
  }

  setSessionExpiredCallback(callback: () => void): void {
    this.onSessionExpired = callback;
  }

  setTokens(accessToken: string | null, refreshToken: string | null): void {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;

    if (accessToken) {
      localStorage.setItem("userAccessToken", accessToken);
    } else {
      localStorage.removeItem("userAccessToken");
    }

    if (refreshToken) {
      localStorage.setItem("userRefreshToken", refreshToken);
    } else {
      localStorage.removeItem("userRefreshToken");
    }
  }

  clearTokens(): void {
    this.accessToken = null;
    this.refreshToken = null;
    localStorage.removeItem("userAccessToken");
    localStorage.removeItem("userRefreshToken");
  }

  private async refreshSession(): Promise<void> {
    if (!this.refreshToken) {
      throw new Error("No refresh token available");
    }

    if (this.isRefreshing && this.refreshPromise) {
      return this.refreshPromise;
    }

    this.isRefreshing = true;
    this.refreshPromise = (async () => {
      try {
        const response = await fetch("/api/user/refresh-token", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ refreshToken: this.refreshToken }),
        });

        if (!response.ok) {
          throw new Error("Failed to refresh token");
        }

        const data = await response.json();
        if (data.accessToken && data.refreshToken) {
          this.setTokens(data.accessToken, data.refreshToken);
        }
      } finally {
        this.isRefreshing = false;
        this.refreshPromise = null;
      }
    })();

    return this.refreshPromise;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    retryCount = 0
  ): Promise<T> {
    if (!this.accessToken) {
      const storedAt = localStorage.getItem("userAccessToken");
      if (storedAt) this.accessToken = storedAt;
    }
    if (!this.refreshToken) {
      const storedRt = localStorage.getItem("userRefreshToken");
      if (storedRt) this.refreshToken = storedRt;
    }
    if (!this.accessToken && this.refreshToken && retryCount === 0) {
      try {
        await this.refreshSession();
      } catch {}
    }
    const url = `${this.baseUrl}${endpoint}`;

    const headers = new Headers({ "Content-Type": "application/json" });
    if (options.headers) {
      const incoming = new Headers(options.headers as HeadersInit);
      incoming.forEach((v, k) => {
        headers.set(k, v);
      });
    }

    // Add Bearer token if available
    if (this.accessToken) {
      headers.set("Authorization", `Bearer ${this.accessToken}`);
    }

    const config: RequestInit = {
      ...options,
      headers,
    };

    try {
      const response = await fetch(url, config);
      const data = await response.json();

      if (!response.ok) {
        // Handle session expiration with refresh token
        if (
          (response.status === 401 || response.status === 403) &&
          retryCount === 0 &&
          this.refreshToken
        ) {
          try {
            // Try to refresh the session
            await this.refreshSession();
            // Retry the original request
            return this.request<T>(endpoint, options, retryCount + 1);
          } catch (_refreshError) {
            // Refresh failed, clear everything and notify
            this.clearTokens();
            if (this.onSessionExpired) {
              this.onSessionExpired();
            }
            throw new Error(data.error || `HTTP ${response.status}: ${response.statusText}`);
          }
        }

        // Handle other auth errors without refresh token
        if ((response.status === 401 || response.status === 403) && !this.refreshToken) {
          if (this.accessToken && this.onSessionExpired) {
            this.onSessionExpired();
          }
        }

        throw new Error(data.error || `HTTP ${response.status}: ${response.statusText}`);
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
    const response = await this.request<OpaqueLoginFinishResponse>("/opaque/login/finish", {
      method: "POST",
      body: JSON.stringify(request),
    });

    // Store tokens if provided
    if (response.accessToken && response.refreshToken) {
      this.setTokens(response.accessToken, response.refreshToken);
    }

    return response;
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
    const response = await this.request<OpaqueRegisterFinishResponse>("/opaque/register/finish", {
      method: "POST",
      body: JSON.stringify(request),
    });

    // Store tokens if provided
    if (response.accessToken && response.refreshToken) {
      this.setTokens(response.accessToken, response.refreshToken);
    }

    return response;
  }

  // Session Management
  async getSession(): Promise<SessionResponse> {
    return this.request("/session");
  }

  async logout(): Promise<void> {
    await this.request("/logout", {
      method: "POST",
    });
    // Clear all tokens on logout
    this.clearTokens();
  }

  async getOtpStatus(): Promise<OtpStatusResponse> {
    return this.request("/otp/status");
  }

  async otpSetupInit(): Promise<{ secret: string; provisioning_uri: string }> {
    return this.request("/otp/setup/init", { method: "POST" });
  }

  async otpSetupVerify(code: string): Promise<{ success: boolean; backup_codes: string[] }> {
    return this.request("/otp/setup/verify", { method: "POST", body: JSON.stringify({ code }) });
  }

  async otpVerify(code: string): Promise<{ success: boolean }> {
    return this.request("/otp/verify", { method: "POST", body: JSON.stringify({ code }) });
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

  // Authorization Flow
  async authorize(request: AuthorizeRequest): Promise<AuthorizeResponse> {
    const params = new URLSearchParams();
    params.set("request_id", request.requestId);
    params.set("approve", request.approve ? "true" : "false");
    if (request.drkHash) {
      params.set("drk_hash", request.drkHash);
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

  async putEncPublicJwk(jwk: JsonWebKey): Promise<void> {
    const body = JSON.stringify({ enc_public_jwk: jwk });
    await this.request("/crypto/enc-pub", { method: "PUT", body });
  }

  async putWrappedEncPrivateJwk(wrappedBase64Url: string): Promise<void> {
    const body = JSON.stringify({ wrapped_enc_private_jwk: wrappedBase64Url });
    await this.request("/crypto/wrapped-enc-priv", { method: "PUT", body });
  }

  async getUserApps(): Promise<{
    apps: Array<{ id: string; name: string; description?: string; url?: string; logoUrl?: string }>;
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
