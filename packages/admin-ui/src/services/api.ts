// API Service Layer for Admin UI
import authService from "./auth";

export interface ApiError {
  error: string;
  message?: string;
  details?: unknown;
}

export type SortOrder = "asc" | "desc";

export interface ListQueryParams {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: SortOrder;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext?: boolean;
  hasPrev?: boolean;
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
  otpRequired?: boolean;
  otpVerified?: boolean;
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
  otpRequired?: boolean;
  otpVerified?: boolean;
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
  pagination: PaginationMeta;
}

export interface UsersResponse {
  users: User[];
  pagination: PaginationMeta;
}

// Groups and Permissions
export interface Group {
  key: string;
  name: string;
  enableLogin?: boolean;
  requireOtp?: boolean;
  permissions?: Array<{ key: string; description: string }>;
  permissionCount?: number;
  userCount?: number;
}

export interface GroupsResponse {
  groups: Group[];
  pagination: PaginationMeta;
}

export interface Organization {
  organizationId: string;
  slug: string;
  name: string;
  memberCount?: number;
  roleCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface OrganizationsResponse {
  organizations: Organization[];
  pagination: PaginationMeta;
}

export interface Role {
  id: string;
  key: string;
  name: string;
  description?: string | null;
  system?: boolean;
  permissions?: Array<{ key: string; description?: string }>;
  permissionKeys?: string[];
  permissionCount?: number;
}

export interface RolesResponse {
  roles: Role[];
  pagination: PaginationMeta;
}

export interface OrganizationMember {
  membershipId: string;
  userSub: string;
  status: string;
  email?: string | null;
  name?: string | null;
  roles: Array<{ id: string; key: string; name: string }>;
}

export interface OrganizationMemberWithOrganizationId extends OrganizationMember {
  organizationId: string;
}

export interface Permission {
  key: string;
  description: string;
  groupCount?: number;
  directUserCount?: number;
}

export interface PermissionsResponse {
  permissions: Permission[];
  pagination: PaginationMeta;
}

// OAuth Clients
export interface Client {
  clientId: string;
  name: string;
  showOnUserDashboard?: boolean;
  dashboardPosition?: number;
  appUrl?: string | null;
  dashboardIconMode?: "letter" | "emoji" | "upload";
  dashboardIconEmoji?: string | null;
  dashboardIconLetter?: string | null;
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

export interface ClientsResponse {
  clients: Client[];
  pagination: PaginationMeta;
}

export interface CreateClientRequest {
  clientId: string;
  name: string;
  type: "public" | "confidential";
  tokenEndpointAuthMethod: "none" | "client_secret_basic";
  showOnUserDashboard?: boolean;
  dashboardPosition?: number;
  appUrl?: string;
  dashboardIconMode?: "letter" | "emoji" | "upload";
  dashboardIconEmoji?: string | null;
  dashboardIconLetter?: string | null;
  dashboardIconUpload?: { data: string; mimeType: string } | null;
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

export interface ClientSecretResponse {
  clientId: string;
  clientSecret: string | null;
}

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
  pagination: PaginationMeta;
}

export interface AuditLogFilters extends ListQueryParams {
  eventType?: string;
  success?: boolean;
  startDate?: string;
  endDate?: string;
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
  private onSessionExpired?: () => void;
  private onServerError?: () => void;

  constructor() {
    this.baseUrl = "/api/admin";
  }

  clearLegacyTokens(): void {
    localStorage.removeItem("adminAccessToken");
    localStorage.removeItem("adminRefreshToken");
  }

  setSessionExpiredCallback(callback: () => void): void {
    this.onSessionExpired = callback;
  }

  setServerErrorCallback(callback: () => void): void {
    this.onServerError = callback;
  }

  private normalizeListParams(
    pageOrParams?: number | ListQueryParams,
    limit?: number,
    search?: string
  ): ListQueryParams {
    if (typeof pageOrParams === "object" && pageOrParams !== null) {
      return pageOrParams;
    }

    return {
      page: pageOrParams,
      limit,
      search,
    };
  }

  private createListSearchParams(params?: ListQueryParams): URLSearchParams {
    const query = new URLSearchParams();

    if (params?.page) query.append("page", params.page.toString());
    if (params?.limit) query.append("limit", params.limit.toString());
    if (params?.search) query.append("search", params.search);
    if (params?.sortBy) query.append("sortBy", params.sortBy);
    if (params?.sortOrder) query.append("sortOrder", params.sortOrder);

    return query;
  }

  private getPagedEndpoint(base: string, params?: ListQueryParams): string {
    const query = this.createListSearchParams(params).toString();
    return query ? `${base}?${query}` : base;
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
        .find((part) => part.startsWith("__Host-DarkAuth-Admin-Csrf="))
        ?.slice("__Host-DarkAuth-Admin-Csrf=".length);
      if (csrf) {
        headers.set("x-csrf-token", decodeURIComponent(csrf));
      }
    }

    const config: RequestInit = {
      headers,
      ...options,
      credentials: "include",
    };

    try {
      const response = await fetch(url, config);
      const data = await response.json();

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          this.clearLegacyTokens();
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
    return this.request<AdminOpaqueLoginFinishResponse>("/opaque/login/finish", {
      method: "POST",
      body: JSON.stringify(request),
    });
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

  async getOwnOtpStatus(): Promise<{
    enabled: boolean;
    pending: boolean;
    verified: boolean;
    created_at?: string | null;
    last_used_at?: string | null;
  }> {
    return this.request("/otp/status");
  }
  async ownOtpSetupInit(): Promise<{ secret: string; provisioning_uri: string }> {
    return this.request("/otp/setup/init", { method: "POST" });
  }
  async ownOtpSetupVerify(code: string): Promise<{ success: boolean; backup_codes: string[] }> {
    return this.request("/otp/setup/verify", { method: "POST", body: JSON.stringify({ code }) });
  }
  async ownOtpVerify(code: string): Promise<{ success: boolean }> {
    return this.request("/otp/verify", { method: "POST", body: JSON.stringify({ code }) });
  }
  async ownOtpDisable(code: string): Promise<{ success: boolean }> {
    return this.request("/otp/disable", { method: "POST", body: JSON.stringify({ code }) });
  }
  async ownOtpReset(code: string): Promise<{ secret: string; provisioning_uri: string }> {
    return this.request("/otp/reset", { method: "POST", body: JSON.stringify({ code }) });
  }

  async logout(): Promise<void> {
    await this.request("/logout", {
      method: "POST",
    });
    this.clearLegacyTokens();
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

  async getUsersPaged(
    pageOrParams?: number | ListQueryParams,
    limit?: number,
    search?: string
  ): Promise<UsersResponse> {
    const params = this.normalizeListParams(pageOrParams, limit, search);
    return this.request(this.getPagedEndpoint("/users", params));
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

  private normalizeOrganization(organization: unknown): Organization {
    const raw =
      organization && typeof organization === "object"
        ? (organization as Organization & { id?: string })
        : ({} as Organization & { id?: string });
    return {
      ...raw,
      organizationId: raw.organizationId || raw.id || "",
    };
  }

  // Organizations Management
  async getOrganizationsPaged(
    pageOrParams?: number | ListQueryParams,
    limit?: number,
    search?: string
  ): Promise<OrganizationsResponse> {
    const params = this.normalizeListParams(pageOrParams, limit, search);
    const endpoint = this.getPagedEndpoint("/organizations", params);
    const data = await this.request<OrganizationsResponse | { organizations: Organization[] }>(
      endpoint
    );
    const organizations = data.organizations.map((organization) =>
      this.normalizeOrganization(organization)
    );

    if ("pagination" in data) {
      return {
        ...data,
        organizations,
      };
    }

    return {
      organizations,
      pagination: {
        page: params.page || 1,
        limit: params.limit || organizations.length || 20,
        total: organizations.length,
        totalPages: 1,
      },
    };
  }

  async getOrganization(organizationId: string): Promise<Organization> {
    const data = await this.request<Organization | { organization: Organization }>(
      `/organizations/${organizationId}`
    );
    return this.normalizeOrganization("organization" in data ? data.organization : data);
  }

  async createOrganization(organization: { name: string; slug?: string }): Promise<Organization> {
    const data = await this.request<Organization | { organization: Organization }>(
      "/organizations",
      {
        method: "POST",
        body: JSON.stringify(organization),
      }
    );
    return this.normalizeOrganization("organization" in data ? data.organization : data);
  }

  async updateOrganization(
    organizationId: string,
    updates: { name?: string; slug?: string }
  ): Promise<Organization> {
    const data = await this.request<Organization | { organization: Organization }>(
      `/organizations/${organizationId}`,
      {
        method: "PUT",
        body: JSON.stringify(updates),
      }
    );
    return this.normalizeOrganization("organization" in data ? data.organization : data);
  }

  async deleteOrganization(organizationId: string): Promise<void> {
    await this.request(`/organizations/${organizationId}`, {
      method: "DELETE",
    });
  }

  async getOrganizationMembers(organizationId: string): Promise<{ members: OrganizationMember[] }> {
    return this.request(`/organizations/${organizationId}/members`);
  }

  async addOrganizationMember(
    organizationId: string,
    userSub: string
  ): Promise<OrganizationMemberWithOrganizationId> {
    const data = await this.request<
      OrganizationMemberWithOrganizationId | { member: OrganizationMemberWithOrganizationId }
    >(`/organizations/${organizationId}/members`, {
      method: "POST",
      body: JSON.stringify({ userSub }),
    });
    return "member" in data ? data.member : data;
  }

  async assignOrganizationMemberRoles(
    organizationId: string,
    memberId: string,
    roleIds: string[]
  ): Promise<{ assigned: Array<{ id: string; key: string; name: string }> }> {
    return this.request(`/organizations/${organizationId}/members/${memberId}/roles`, {
      method: "POST",
      body: JSON.stringify({ roleIds }),
    });
  }

  async updateOrganizationMemberRoles(
    organizationId: string,
    memberId: string,
    roleIds: string[]
  ): Promise<{ memberId: string; organizationId: string; roleIds: string[] }> {
    return this.request(`/organizations/${organizationId}/members/${memberId}/roles`, {
      method: "PUT",
      body: JSON.stringify({ roleIds }),
    });
  }

  async removeOrganizationMemberRole(
    organizationId: string,
    memberId: string,
    roleId: string
  ): Promise<{ success: boolean }> {
    return this.request(`/organizations/${organizationId}/members/${memberId}/roles/${roleId}`, {
      method: "DELETE",
    });
  }

  async removeOrganizationMember(organizationId: string, memberId: string): Promise<void> {
    await this.request(`/organizations/${organizationId}/members/${memberId}`, {
      method: "DELETE",
    });
  }

  // Roles Management
  async getRoles(): Promise<Role[]> {
    const data = await this.request<{ roles: Role[] } | Role[]>("/roles");
    return Array.isArray(data) ? data : data.roles;
  }

  async getRolesPaged(
    pageOrParams?: number | ListQueryParams,
    limit?: number,
    search?: string
  ): Promise<RolesResponse> {
    const params = this.normalizeListParams(pageOrParams, limit, search);
    const endpoint = this.getPagedEndpoint("/roles", params);
    const data = await this.request<RolesResponse | { roles: Role[] } | Role[]>(endpoint);

    if (Array.isArray(data)) {
      return {
        roles: data,
        pagination: {
          page: params.page || 1,
          limit: params.limit || data.length || 20,
          total: data.length,
          totalPages: 1,
        },
      };
    }

    if ("pagination" in data) {
      return data;
    }

    return {
      roles: data.roles,
      pagination: {
        page: params.page || 1,
        limit: params.limit || data.roles.length || 20,
        total: data.roles.length,
        totalPages: 1,
      },
    };
  }

  async getRole(roleId: string): Promise<Role> {
    const data = await this.request<Role | { role: Role }>(`/roles/${roleId}`);
    return "role" in data ? data.role : data;
  }

  async createRole(data: {
    key: string;
    name: string;
    description?: string;
    permissionKeys?: string[];
  }): Promise<Role> {
    const response = await this.request<Role | { role: Role }>("/roles", {
      method: "POST",
      body: JSON.stringify(data),
    });
    return "role" in response ? response.role : response;
  }

  async updateRole(
    roleId: string,
    updates: { name?: string; description?: string }
  ): Promise<Role> {
    const response = await this.request<Role | { role: Role }>(`/roles/${roleId}`, {
      method: "PUT",
      body: JSON.stringify(updates),
    });
    return "role" in response ? response.role : response;
  }

  async updateRolePermissions(
    roleId: string,
    permissionKeys: string[]
  ): Promise<{ roleId: string; permissionKeys: string[] }> {
    return this.request(`/roles/${roleId}/permissions`, {
      method: "PUT",
      body: JSON.stringify({ permissionKeys }),
    });
  }

  async deleteRole(roleId: string): Promise<void> {
    await this.request(`/roles/${roleId}`, { method: "DELETE" });
  }

  // Legacy Groups Management
  async getGroups(): Promise<Group[]> {
    const data = await this.request<{ groups: Group[] }>("/groups");
    return data.groups;
  }

  async getGroupsPaged(
    pageOrParams?: number | ListQueryParams,
    limit?: number,
    search?: string
  ): Promise<GroupsResponse> {
    const params = this.normalizeListParams(pageOrParams, limit, search);
    return this.request(this.getPagedEndpoint("/groups", params));
  }

  async getGroup(key: string): Promise<Group> {
    return this.request<Group>(`/groups/${key}`);
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
    enableLogin?: boolean;
    requireOtp?: boolean;
    permissionKeys?: string[];
  }): Promise<void> {
    await this.request("/groups", {
      method: "POST",
      body: JSON.stringify(group),
    });
  }

  async updateGroup(
    groupKey: string,
    updates: {
      name?: string;
      enableLogin?: boolean;
      requireOtp?: boolean;
      permissionKeys?: string[];
    }
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

  async getUserOtpStatus(userSub: string): Promise<{
    enabled: boolean;
    pending: boolean;
    verified: boolean;
    created_at?: string | null;
    last_used_at?: string | null;
    failure_count?: number;
    locked_until?: string | null;
  }> {
    return this.request(`/users/${userSub}/otp`);
  }
  async deleteUserOtp(userSub: string): Promise<void> {
    await this.request(`/users/${userSub}/otp`, { method: "DELETE" });
  }
  async unlockUserOtp(userSub: string): Promise<void> {
    await this.request(`/users/${userSub}/otp/unlock`, { method: "POST" });
  }

  // Permissions Management
  async getPermissions(): Promise<Permission[]> {
    const data = await this.getPermissionsPaged();
    return data.permissions;
  }

  async getPermissionsPaged(
    pageOrParams?: number | ListQueryParams,
    limit?: number,
    search?: string
  ): Promise<PermissionsResponse> {
    const params = this.normalizeListParams(pageOrParams, limit, search);
    const endpoint = this.getPagedEndpoint("/permissions", params);
    const data = await this.request<PermissionsResponse | { permissions: Permission[] }>(endpoint);

    if ("pagination" in data) {
      return data;
    }

    return {
      permissions: data.permissions,
      pagination: {
        page: params.page || 1,
        limit: params.limit || data.permissions.length || 20,
        total: data.permissions.length,
        totalPages: 1,
      },
    };
  }

  async createPermission(permission: { key: string; description: string }): Promise<Permission> {
    return this.request<Permission>("/permissions", {
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
    const data = await this.getClientsPaged();
    return data.clients;
  }

  async getClientsPaged(
    pageOrParams?: number | ListQueryParams,
    limit?: number,
    search?: string
  ): Promise<ClientsResponse> {
    const params = this.normalizeListParams(pageOrParams, limit, search);
    const endpoint = this.getPagedEndpoint("/clients", params);
    const data = await this.request<ClientsResponse | Client[] | { clients: Client[] }>(endpoint);

    if (Array.isArray(data)) {
      return {
        clients: data,
        pagination: {
          page: params.page || 1,
          limit: params.limit || data.length || 20,
          total: data.length,
          totalPages: 1,
        },
      };
    }

    if ("pagination" in data) {
      return data;
    }

    const clients = data.clients || [];
    return {
      clients,
      pagination: {
        page: params.page || 1,
        limit: params.limit || clients.length || 20,
        total: clients.length,
        totalPages: 1,
      },
    };
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

  async getClientSecret(clientId: string): Promise<ClientSecretResponse> {
    return this.request(`/clients/${clientId}/secret`);
  }

  // System Settings
  async getSettings(): Promise<{ settings: AdminSetting[] }> {
    return this.request("/settings");
  }

  async getSystemSettings(): Promise<SystemSettings> {
    const response = await this.request<{ settings: AdminSetting[] }>("/settings");
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
  async getJwks(params?: ListQueryParams): Promise<JwksInfo> {
    const endpoint = params ? this.getPagedEndpoint("/jwks", params) : "/jwks";
    return this.request(endpoint);
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
    if (filters?.sortBy) params.append("sortBy", filters.sortBy);
    if (filters?.sortOrder) params.append("sortOrder", filters.sortOrder);

    const queryString = params.toString();
    const endpoint = queryString ? `/audit-logs?${queryString}` : "/audit-logs";

    return this.request(endpoint);
  }

  async getAuditLog(id: string): Promise<AuditLog> {
    const data = await this.request<{ auditLog: AuditLog }>(`/audit-logs/${id}`);
    return data.auditLog;
  }

  async exportAuditLogs(filters?: AuditLogFilters): Promise<Blob> {
    const params = this.createListSearchParams(filters);
    if (filters?.eventType) params.append("eventType", filters.eventType);
    if (filters?.success !== undefined) params.append("success", filters.success.toString());
    if (filters?.startDate) params.append("startDate", filters.startDate);
    if (filters?.endDate) params.append("endDate", filters.endDate);

    const queryString = params.toString();
    const endpoint = queryString ? `/audit-logs/export?${queryString}` : "/audit-logs/export";

    const url = `${this.baseUrl}${endpoint}`;
    const headers: Record<string, string> = { Accept: "text/csv" };
    const csrf = document.cookie
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith("__Host-DarkAuth-Admin-Csrf="))
      ?.slice("__Host-DarkAuth-Admin-Csrf=".length);
    if (csrf) {
      headers["x-csrf-token"] = decodeURIComponent(csrf);
    }
    const response = await fetch(url, { headers, credentials: "include" });

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
  async getAdminUsers(
    pageOrParams?: number | ListQueryParams,
    limit?: number,
    search?: string
  ): Promise<AdminUsersResponse> {
    const params = this.normalizeListParams(pageOrParams, limit, search);
    return this.request(this.getPagedEndpoint("/admin-users", params));
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
