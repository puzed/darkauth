// API Service Layer for Admin UI
import authService from "./auth";

export interface ApiError {
  error: string;
  message?: string;
  details?: unknown;
}

// Admin Authentication
export interface AdminOpaqueLoginStartRequest {
  email: string;
  request: string; // base64url encoded
}

export interface AdminOpaqueLoginStartResponse {
  message: string;
  sessionId: string;
  // Note: adminId removed for security - identity is bound server-side
}

export interface AdminOpaqueLoginFinishRequest {
  finish: string;
  sessionId: string;
  // Note: adminId removed for security - identity is derived from server session
}

export interface AdminOpaqueLoginFinishResponse {
  success: boolean;
  sessionKey: string;
  accessToken: string;
  refreshToken?: string;
  admin: {
    id: string;
    email: string;
    name: string;
    role: "read" | "write";
  };
}

export interface AdminOpaqueRegisterStartRequest {
  email: string;
  request: string; // base64url encoded
}

export interface AdminOpaqueRegisterStartResponse {
  message: string; // base64url encoded
  serverPublicKey: string; // base64url encoded
}

export interface AdminOpaqueRegisterFinishRequest {
  email: string;
  name: string;
  role: "read" | "write";
  record: string; // base64url encoded
}

export interface AdminSessionResponse {
  authenticated: boolean;
  adminId?: string;
  name?: string;
  email?: string;
  role?: "read" | "write";
  passwordResetRequired?: boolean;
}

// Users Management
export interface User {
  sub: string;
  email: string;
  name?: string;
  createdAt: string;
  passwordResetRequired?: boolean;
  groups?: string[];
  permissions?: string[];
}

// Admin Users Management
export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: "read" | "write";
  createdAt: string;
  passwordResetRequired?: boolean;
}

export interface AdminUsersResponse {
  adminUsers: AdminUser[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface UsersResponse {
  users: User[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext?: boolean;
    hasPrev?: boolean;
  };
}

// Groups and Permissions
export interface Group {
  key: string;
  name: string;
  permissions?: string[];
  permissionCount?: number;
  userCount?: number;
}

export interface GroupsResponse {
  groups: Group[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext?: boolean;
    hasPrev?: boolean;
  };
}

export interface Permission {
  key: string;
  description: string;
}

// OAuth Clients
export interface Client {
  clientId: string;
  name: string;
  type: "public" | "confidential";
  tokenEndpointAuthMethod: "none" | "client_secret_basic";
  requirePkce: boolean;
  zkDelivery: "none" | "fragment-jwe";
  zkRequired: boolean;
  allowedJweAlgs: string[];
  allowedJweEncs: string[];
  redirectUris: string[];
  postLogoutRedirectUris: string[];
  grantTypes: string[];
  responseTypes: string[];
  scopes: string[];
  allowedZkOrigins: string[];
  createdAt: string;
  updatedAt: string;
  clientSecret?: string; // Only returned when creating/updating
  idTokenLifetimeSeconds?: number;
  refreshTokenLifetimeSeconds?: number;
}

export interface CreateClientRequest {
  clientId: string;
  name: string;
  type: "public" | "confidential";
  tokenEndpointAuthMethod: "none" | "client_secret_basic";
  requirePkce?: boolean;
  zkDelivery?: "none" | "fragment-jwe";
  zkRequired?: boolean;
  allowedJweAlgs?: string[];
  allowedJweEncs?: string[];
  redirectUris: string[];
  postLogoutRedirectUris?: string[];
  grantTypes?: string[];
  responseTypes?: string[];
  scopes?: string[];
  allowedZkOrigins?: string[];
  idTokenLifetimeSeconds?: number;
  refreshTokenLifetimeSeconds?: number;
}

export interface UpdateClientRequest extends Partial<CreateClientRequest> {}

// System Settings
export interface SystemSettings {
  issuer: string;
  publicOrigin: string;
  rpId?: string;
  sessionDuration?: number;
  maxLoginAttempts?: number;
  [key: string]: unknown;
}

export interface JwksInfo {
  keys: Array<{
    kid: string;
    alg: string;
    use: string;
    kty: string;
    crv?: string;
    x?: string;
    y?: string;
    createdAt: string;
    rotatedAt?: string;
  }>;
  activeKid: string;
}

// Audit Logs
export interface AuditLog {
  id: string;
  timestamp: string;
  eventType: string;
  userId?: string;
  adminId?: string;
  resource?: string;
  resourceId?: string;
  ipAddress?: string;
  userAgent?: string;
  success: boolean;
  details?: Record<string, unknown>;
  errorMessage?: string;
  method?: string;
  path?: string;
  statusCode?: number;
  action?: string;
  responseTime?: number;
  actorType?: "Admin" | "User" | "System";
  actorId?: string;
  actorEmail?: string;
  actorName?: string;
}

export interface AuditLogsResponse {
  auditLogs: AuditLog[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface AuditLogFilters {
  eventType?: string;
  success?: boolean;
  startDate?: string;
  endDate?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface AdminSetting {
  key: string;
  name?: string | null;
  type?: string | null;
  category?: string | null;
  description?: string | null;
  tags?: string[] | null;
  defaultValue?: unknown | null;
  value: unknown;
  secure: boolean;
  updatedAt: string;
}

class AdminApiService {
  private baseUrl: string;
  private accessToken: string | null = null;
  private onSessionExpired?: () => void;
  private onServerError?: () => void;
  private refreshToken: string | null = null;
  private isRefreshing = false;
  private refreshPromise: Promise<void> | null = null;

  constructor() {
    this.baseUrl = "/api/admin";
    // Load tokens from localStorage if available
    this.accessToken = localStorage.getItem("adminAccessToken");
    this.refreshToken = localStorage.getItem("adminRefreshToken");
  }

  setTokens(accessToken: string | null, refreshToken: string | null): void {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;

    if (accessToken) {
      localStorage.setItem("adminAccessToken", accessToken);
    } else {
      localStorage.removeItem("adminAccessToken");
    }

    if (refreshToken) {
      localStorage.setItem("adminRefreshToken", refreshToken);
    } else {
      localStorage.removeItem("adminRefreshToken");
    }
  }

  clearTokens(): void {
    this.accessToken = null;
    this.refreshToken = null;
    localStorage.removeItem("adminAccessToken");
    localStorage.removeItem("adminRefreshToken");
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
        const response = await fetch("/api/admin/refresh-token", {
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

  setSessionExpiredCallback(callback: () => void): void {
    this.onSessionExpired = callback;
  }

  setServerErrorCallback(callback: () => void): void {
    this.onServerError = callback;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    retryCount = 0
  ): Promise<T> {
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
      headers,
      ...options,
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
            authService.clearSession();
            if (this.onSessionExpired) {
              this.onSessionExpired();
            }
            throw new Error(data.error || `HTTP ${response.status}: ${response.statusText}`);
          }
        }

        // Handle other auth errors without refresh token
        if ((response.status === 401 || response.status === 403) && !this.refreshToken) {
          // Clear stored session
          authService.clearSession();

          // Call the callback if set (to update UI)
          if (this.onSessionExpired) {
            this.onSessionExpired();
          }
        }

        if (response.status >= 500) {
          if (this.onServerError) {
            this.onServerError();
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

  // Admin Authentication
  async adminOpaqueLoginStart(
    request: AdminOpaqueLoginStartRequest
  ): Promise<AdminOpaqueLoginStartResponse> {
    return this.request("/opaque/login/start", {
      method: "POST",
      body: JSON.stringify(request),
    });
  }

  async adminOpaqueLoginFinish(
    request: AdminOpaqueLoginFinishRequest
  ): Promise<AdminOpaqueLoginFinishResponse> {
    const response = await this.request<AdminOpaqueLoginFinishResponse>("/opaque/login/finish", {
      method: "POST",
      body: JSON.stringify(request),
    });

    // Store tokens if provided
    if (response.accessToken && response.refreshToken) {
      this.setTokens(response.accessToken, response.refreshToken);
    }

    return response;
  }

  async adminOpaqueRegisterStart(
    request: AdminOpaqueRegisterStartRequest
  ): Promise<AdminOpaqueRegisterStartResponse> {
    return this.request("/opaque/register/start", {
      method: "POST",
      body: JSON.stringify(request),
    });
  }

  async adminOpaqueRegisterFinish(request: AdminOpaqueRegisterFinishRequest): Promise<void> {
    return this.request("/opaque/register/finish", {
      method: "POST",
      body: JSON.stringify(request),
    });
  }

  // Session Management
  async getAdminSession(): Promise<AdminSessionResponse> {
    return this.request("/session");
  }

  async logout(): Promise<void> {
    await this.request("/logout", {
      method: "POST",
    });
    // Clear all tokens on logout
    this.clearTokens();
  }

  // Password change (self)
  async adminPasswordChangeStart(
    requestB64Url: string
  ): Promise<{ message: string; serverPublicKey: string }> {
    return this.request("/password/change/start", {
      method: "POST",
      body: JSON.stringify({ request: requestB64Url }),
    });
  }

  async adminPasswordChangeFinish(
    recordB64Url: string,
    exportKeyHashB64Url: string
  ): Promise<{ success: boolean }> {
    return this.request("/password/change/finish", {
      method: "POST",
      body: JSON.stringify({ record: recordB64Url, export_key_hash: exportKeyHashB64Url }),
    });
  }

  // Force reset flags
  async requireUserPasswordReset(userSub: string): Promise<{ success: boolean }> {
    return this.request(`/users/${userSub}/password/reset`, { method: "POST" });
  }

  async requireAdminPasswordReset(adminId: string): Promise<{ success: boolean }> {
    return this.request(`/admin-users/${adminId}/password/reset`, { method: "POST" });
  }

  // Set user/admin passwords (admin action)
  async userPasswordSetStart(
    userSub: string,
    requestB64Url: string
  ): Promise<{ message: string; serverPublicKey: string; identityU: string }> {
    return this.request(`/users/${userSub}/password/set/start`, {
      method: "POST",
      body: JSON.stringify({ request: requestB64Url }),
    });
  }

  async userPasswordSetFinish(
    userSub: string,
    recordB64Url: string,
    exportKeyHashB64Url: string
  ): Promise<{ success: boolean }> {
    return this.request(`/users/${userSub}/password/set/finish`, {
      method: "POST",
      body: JSON.stringify({ record: recordB64Url, export_key_hash: exportKeyHashB64Url }),
    });
  }

  async adminUserPasswordSetStart(
    adminId: string,
    requestB64Url: string
  ): Promise<{ message: string; serverPublicKey: string }> {
    return this.request(`/admin-users/${adminId}/password/set/start`, {
      method: "POST",
      body: JSON.stringify({ request: requestB64Url }),
    });
  }

  async adminUserPasswordSetFinish(
    adminId: string,
    recordB64Url: string,
    exportKeyHashB64Url: string
  ): Promise<{ success: boolean }> {
    return this.request(`/admin-users/${adminId}/password/set/finish`, {
      method: "POST",
      body: JSON.stringify({ record: recordB64Url, export_key_hash: exportKeyHashB64Url }),
    });
  }

  // Users Management
  async getUsers(): Promise<User[]> {
    const data = await this.request<{ users: User[]; pagination: unknown }>("/users");
    return data.users;
  }

  async getUsersPaged(page?: number, limit?: number, search?: string): Promise<UsersResponse> {
    const params = new URLSearchParams();
    if (page) params.append("page", page.toString());
    if (limit) params.append("limit", limit.toString());
    if (search) params.append("search", search);
    const qs = params.toString();
    const endpoint = qs ? `/users?${qs}` : "/users";
    return this.request(endpoint);
  }

  async createUser(user: { email: string; name?: string; sub?: string }): Promise<User> {
    return this.request("/users", {
      method: "POST",
      body: JSON.stringify(user),
    });
  }

  async updateUser(
    userSub: string,
    updates: { email?: string | null; name?: string | null }
  ): Promise<User> {
    return this.request(`/users/${userSub}`, {
      method: "PUT",
      body: JSON.stringify(updates),
    });
  }

  async deleteUser(userSub: string): Promise<void> {
    await this.request(`/users/${userSub}`, {
      method: "DELETE",
    });
  }

  async getUserGroups(userSub: string): Promise<string[]> {
    const data = await this.request<{
      user: { sub: string; email: string; name?: string };
      userGroups: Array<{ key: string; name: string }>;
      availableGroups: Array<{ key: string; name: string }>;
    }>(`/users/${userSub}/groups`);
    return data.userGroups.map((g) => g.key);
  }

  async updateUserGroups(userSub: string, groups: string[]): Promise<void> {
    await this.request(`/users/${userSub}/groups`, {
      method: "PUT",
      body: JSON.stringify({ groups }),
    });
  }

  async getUserPermissions(userSub: string): Promise<string[]> {
    const data = await this.request<{
      user: { sub: string; email: string; name?: string };
      directPermissions: Array<{ key: string; description: string }>;
      inheritedPermissions: Array<{
        key: string;
        description: string;
        groups: Array<{ key: string; name: string }>;
      }>;
      availablePermissions: Array<{ key: string; description: string }>;
    }>(`/users/${userSub}/permissions`);
    return data.directPermissions.map((p) => p.key);
  }

  async updateUserPermissions(userSub: string, permissions: string[]): Promise<void> {
    await this.request(`/users/${userSub}/permissions`, {
      method: "PUT",
      body: JSON.stringify({ permissions }),
    });
  }

  // Groups Management
  async getGroups(): Promise<Group[]> {
    const data = await this.request<{ groups: Group[] }>("/groups");
    return data.groups;
  }

  async getGroupsPaged(page?: number, limit?: number, search?: string): Promise<GroupsResponse> {
    const params = new URLSearchParams();
    if (page) params.append("page", page.toString());
    if (limit) params.append("limit", limit.toString());
    if (search) params.append("search", search);
    const qs = params.toString();
    const endpoint = qs ? `/groups?${qs}` : "/groups";
    return this.request(endpoint);
  }

  async getGroupUsers(groupKey: string): Promise<{
    users: Array<{ sub: string; email: string; name?: string }>;
    availableUsers: Array<{ sub: string; email: string; name?: string }>;
  }> {
    const data = await this.request<{
      group: { key: string; name: string };
      users: Array<{ sub: string; email: string; name?: string }>;
      availableUsers: Array<{ sub: string; email: string; name?: string }>;
    }>(`/groups/${groupKey}/users`);
    return { users: data.users, availableUsers: data.availableUsers };
  }

  async updateGroupUsers(groupKey: string, userSubs: string[]): Promise<void> {
    await this.request(`/groups/${groupKey}/users`, {
      method: "PUT",
      body: JSON.stringify({ userSubs }),
    });
  }

  async createGroup(group: {
    key: string;
    name: string;
    permissionKeys?: string[];
  }): Promise<void> {
    await this.request("/groups", {
      method: "POST",
      body: JSON.stringify(group),
    });
  }

  async updateGroup(
    groupKey: string,
    updates: { name?: string; permissionKeys?: string[] }
  ): Promise<void> {
    await this.request(`/groups/${groupKey}`, {
      method: "PUT",
      body: JSON.stringify(updates),
    });
  }

  async deleteGroup(groupKey: string): Promise<void> {
    await this.request(`/groups/${groupKey}`, {
      method: "DELETE",
    });
  }

  // Permissions Management
  async getPermissions(): Promise<Permission[]> {
    const data = await this.request<{ permissions: Permission[] }>("/permissions");
    return data.permissions;
  }

  async createPermission(permission: { key: string; description: string }): Promise<void> {
    await this.request("/permissions", {
      method: "POST",
      body: JSON.stringify(permission),
    });
  }

  async deletePermission(permissionKey: string): Promise<void> {
    await this.request(`/permissions/${permissionKey}`, {
      method: "DELETE",
    });
  }

  // OAuth Clients Management
  async getClients(): Promise<Client[]> {
    const data = await this.request<Client[] | { clients: Client[] }>("/clients");
    return Array.isArray(data)
      ? data
      : data && typeof data === "object" && "clients" in data
        ? data.clients
        : [];
  }

  async createClient(client: CreateClientRequest): Promise<Client> {
    return this.request("/clients", {
      method: "POST",
      body: JSON.stringify(client),
    });
  }

  async updateClient(clientId: string, updates: UpdateClientRequest): Promise<Client> {
    return this.request(`/clients/${clientId}`, {
      method: "PUT",
      body: JSON.stringify(updates),
    });
  }

  async deleteClient(clientId: string): Promise<void> {
    await this.request(`/clients/${clientId}`, {
      method: "DELETE",
    });
  }

  // System Settings
  async getSettings(): Promise<{ settings: AdminSetting[] }> {
    return this.request("/settings");
  }

  async getSystemSettings(): Promise<SystemSettings> {
    const response = await this.request("/settings");
    // Extract specific settings from the raw response
    const settings = response.settings || [];
    const result: SystemSettings = {
      issuer: "",
      publicOrigin: "",
    };

    settings.forEach((setting: AdminSetting) => {
      result[setting.key] = setting.value;
    });

    return result;
  }

  async updateSetting(key: string, value: unknown): Promise<void> {
    await this.request("/settings", {
      method: "PUT",
      body: JSON.stringify({ key, value }),
    });
  }

  // JWKS Management
  async getJwks(): Promise<JwksInfo> {
    return this.request("/jwks");
  }

  async rotateJwks(): Promise<{ kid: string; message: string }> {
    return this.request("/jwks/rotate", {
      method: "POST",
    });
  }

  // Audit Logs Management
  async getAuditLogs(filters?: AuditLogFilters): Promise<AuditLogsResponse> {
    const params = new URLSearchParams();
    if (filters?.eventType) params.append("eventType", filters.eventType);
    if (filters?.success !== undefined) params.append("success", filters.success.toString());
    if (filters?.startDate) params.append("startDate", filters.startDate);
    if (filters?.endDate) params.append("endDate", filters.endDate);
    if (filters?.search) params.append("search", filters.search);
    if (filters?.page) params.append("page", filters.page.toString());
    if (filters?.limit) params.append("limit", filters.limit.toString());

    const queryString = params.toString();
    const endpoint = queryString ? `/audit-logs?${queryString}` : "/audit-logs";

    return this.request(endpoint);
  }

  async getAuditLog(id: string): Promise<AuditLog> {
    const data = await this.request<{ auditLog: AuditLog }>(`/audit-logs/${id}`);
    return data.auditLog;
  }

  async exportAuditLogs(filters?: AuditLogFilters): Promise<Blob> {
    const params = new URLSearchParams();
    if (filters?.eventType) params.append("eventType", filters.eventType);
    if (filters?.success !== undefined) params.append("success", filters.success.toString());
    if (filters?.startDate) params.append("startDate", filters.startDate);
    if (filters?.endDate) params.append("endDate", filters.endDate);
    if (filters?.search) params.append("search", filters.search);

    const queryString = params.toString();
    const endpoint = queryString ? `/audit-logs/export?${queryString}` : "/audit-logs/export";

    const url = `${this.baseUrl}${endpoint}`;
    const headers: Record<string, string> = { Accept: "text/csv" };
    if (this.accessToken) {
      headers.Authorization = `Bearer ${this.accessToken}`;
    }
    const response = await fetch(url, { headers });

    if (!response.ok) {
      if (response.status >= 500) {
        if (this.onServerError) {
          this.onServerError();
        }
      }
      throw new Error(`Failed to export audit logs: ${response.statusText}`);
    }

    return response.blob();
  }

  // Admin Users Management
  async getAdminUsers(page?: number, limit?: number, search?: string): Promise<AdminUsersResponse> {
    const params = new URLSearchParams();
    if (page) params.append("page", page.toString());
    if (limit) params.append("limit", limit.toString());
    if (search) params.append("search", search);

    const queryString = params.toString();
    const endpoint = queryString ? `/admin-users?${queryString}` : "/admin-users";

    return this.request(endpoint);
  }

  async createAdminUser(data: {
    email: string;
    name: string;
    role: "read" | "write";
  }): Promise<AdminUser> {
    return this.request("/admin-users", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateAdminUser(
    adminId: string,
    updates: { email?: string; name?: string; role?: "read" | "write" }
  ): Promise<AdminUser> {
    return this.request(`/admin-users/${adminId}`, {
      method: "PUT",
      body: JSON.stringify(updates),
    });
  }

  async deleteAdminUser(adminId: string): Promise<void> {
    await this.request(`/admin-users/${adminId}`, {
      method: "DELETE",
    });
  }
}

export const adminApiService = new AdminApiService();
export default adminApiService;
