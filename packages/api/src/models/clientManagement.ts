import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { clients } from "../db/schema.js";
import { ConflictError, NotFoundError, ValidationError } from "../errors.js";
import type { Context } from "../types.js";

export interface ClientData {
  clientId: string;
  name: string;
  type: "public" | "confidential";
  tokenEndpointAuthMethod?: "none" | "client_secret_basic";
  requirePkce?: boolean;
  zkDelivery?: "none" | "fragment-jwe";
  zkRequired?: boolean;
  allowedJweAlgs?: string[];
  allowedJweEncs?: string[];
  redirectUris?: string[];
  postLogoutRedirectUris?: string[];
  grantTypes?: string[];
  responseTypes?: string[];
  scopes?: string[];
  allowedZkOrigins?: string[];
  idTokenLifetimeSeconds?: number | null;
  refreshTokenLifetimeSeconds?: number | null;
}

export interface ClientResponse extends ClientData {
  createdAt: Date;
  updatedAt: Date;
  clientSecret?: string;
}

export interface ClientUpdateData {
  name?: string;
  type?: "public" | "confidential";
  tokenEndpointAuthMethod?: "none" | "client_secret_basic";
  requirePkce?: boolean;
  zkDelivery?: "none" | "fragment-jwe";
  zkRequired?: boolean;
  allowedJweAlgs?: string[];
  allowedJweEncs?: string[];
  redirectUris?: string[];
  postLogoutRedirectUris?: string[];
  grantTypes?: string[];
  responseTypes?: string[];
  scopes?: string[];
  allowedZkOrigins?: string[];
  idTokenLifetimeSeconds?: number | null;
  refreshTokenLifetimeSeconds?: number | null;
}

/**
 * Generates a cryptographically secure random string for client secrets
 */
function generateClientSecret(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/**
 * Validates client data for creation/update
 */
export function validateClientData(data: Partial<ClientData>): void {
  if (data.type === "confidential" && data.tokenEndpointAuthMethod === "none") {
    throw new ValidationError("Confidential clients must use client authentication");
  }

  if (data.type === "public" && data.tokenEndpointAuthMethod === "client_secret_basic") {
    throw new ValidationError("Public clients cannot use client secrets");
  }

  if (data.redirectUris) {
    for (const uri of data.redirectUris) {
      try {
        new URL(uri);
      } catch {
        throw new ValidationError(`Invalid redirect URI: ${uri}`);
      }
    }
  }

  if (data.postLogoutRedirectUris) {
    for (const uri of data.postLogoutRedirectUris) {
      try {
        new URL(uri);
      } catch {
        throw new ValidationError(`Invalid post logout redirect URI: ${uri}`);
      }
    }
  }
}

/**
 * Checks if a client ID already exists
 */
export async function checkClientExists(context: Context, clientId: string): Promise<boolean> {
  const existing = await context.db
    .select({ clientId: clients.clientId })
    .from(clients)
    .where(eq(clients.clientId, clientId))
    .limit(1);

  return existing.length > 0;
}

/**
 * Gets a client by ID
 */
export async function getClientById(context: Context, clientId: string) {
  const result = await context.db.query.clients.findFirst({
    where: eq(clients.clientId, clientId),
  });

  if (!result) {
    throw new NotFoundError("Client not found");
  }

  return {
    clientId: result.clientId,
    name: result.name,
    type: result.type,
    tokenEndpointAuthMethod: result.tokenEndpointAuthMethod,
    requirePkce: result.requirePkce,
    zkDelivery: result.zkDelivery,
    zkRequired: result.zkRequired,
    allowedJweAlgs: result.allowedJweAlgs,
    allowedJweEncs: result.allowedJweEncs,
    redirectUris: result.redirectUris,
    postLogoutRedirectUris: result.postLogoutRedirectUris,
    grantTypes: result.grantTypes,
    responseTypes: result.responseTypes,
    scopes: result.scopes,
    allowedZkOrigins: result.allowedZkOrigins,
    idTokenLifetimeSeconds: result.idTokenLifetimeSeconds,
    refreshTokenLifetimeSeconds: result.refreshTokenLifetimeSeconds,
    createdAt: result.createdAt,
    updatedAt: result.updatedAt,
  };
}

/**
 * Creates a new OAuth client with proper validation and secret handling
 */
export async function createClient(context: Context, data: ClientData): Promise<ClientResponse> {
  // Apply defaults
  const clientData = {
    tokenEndpointAuthMethod: "none" as const,
    requirePkce: true,
    zkDelivery: "none" as const,
    zkRequired: false,
    allowedJweAlgs: [] as string[],
    allowedJweEncs: [] as string[],
    redirectUris: [] as string[],
    postLogoutRedirectUris: [] as string[],
    grantTypes: ["authorization_code"] as string[],
    responseTypes: ["code"] as string[],
    scopes: ["openid", "profile"] as string[],
    allowedZkOrigins: [] as string[],
    idTokenLifetimeSeconds: null as number | null,
    refreshTokenLifetimeSeconds: null as number | null,
    ...data,
  };

  // Validate data
  validateClientData(clientData);

  // Check if client ID already exists
  if (await checkClientExists(context, clientData.clientId)) {
    throw new ConflictError("Client ID already exists");
  }

  // Generate client secret if needed
  let clientSecret: string | null = null;
  let clientSecretEnc: Buffer | null = null;

  if (clientData.type === "confidential" || clientData.tokenEndpointAuthMethod === "client_secret_basic") {
    clientSecret = generateClientSecret(32);

    if (context.services.kek?.isAvailable()) {
      clientSecretEnc = await context.services.kek.encrypt(Buffer.from(clientSecret));
    } else {
      throw new ValidationError("Key encryption service not available for confidential clients");
    }
  }

  // Create database record
  const now = new Date();
  const row = {
    clientId: clientData.clientId,
    name: clientData.name,
    type: clientData.type,
    tokenEndpointAuthMethod: clientData.tokenEndpointAuthMethod,
    clientSecretEnc,
    requirePkce: clientData.requirePkce,
    zkDelivery: clientData.zkDelivery,
    zkRequired: clientData.zkRequired,
    allowedJweAlgs: clientData.allowedJweAlgs,
    allowedJweEncs: clientData.allowedJweEncs,
    redirectUris: clientData.redirectUris,
    postLogoutRedirectUris: clientData.postLogoutRedirectUris,
    grantTypes: clientData.grantTypes,
    responseTypes: clientData.responseTypes,
    scopes: clientData.scopes,
    allowedZkOrigins: clientData.allowedZkOrigins,
    idTokenLifetimeSeconds: clientData.idTokenLifetimeSeconds,
    refreshTokenLifetimeSeconds: clientData.refreshTokenLifetimeSeconds,
    createdAt: now,
    updatedAt: now,
  };

  await context.db.insert(clients).values(row);

  return {
    clientId: row.clientId,
    name: row.name,
    type: row.type,
    tokenEndpointAuthMethod: row.tokenEndpointAuthMethod,
    requirePkce: row.requirePkce,
    zkDelivery: row.zkDelivery,
    zkRequired: row.zkRequired,
    allowedJweAlgs: row.allowedJweAlgs,
    allowedJweEncs: row.allowedJweEncs,
    redirectUris: row.redirectUris,
    postLogoutRedirectUris: row.postLogoutRedirectUris,
    grantTypes: row.grantTypes,
    responseTypes: row.responseTypes,
    scopes: row.scopes,
    allowedZkOrigins: row.allowedZkOrigins,
    idTokenLifetimeSeconds: row.idTokenLifetimeSeconds,
    refreshTokenLifetimeSeconds: row.refreshTokenLifetimeSeconds,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    clientSecret: clientSecret ?? undefined,
  };
}

/**
 * Updates an existing OAuth client
 */
export async function updateClient(
  context: Context,
  clientId: string,
  updateData: ClientUpdateData
): Promise<ClientResponse> {
  // Check if client exists
  const existing = await context.db.query.clients.findFirst({
    where: eq(clients.clientId, clientId),
  });

  if (!existing) {
    throw new NotFoundError("Client not found");
  }

  // Validate update data
  if (Object.keys(updateData).length > 0) {
    validateClientData(updateData);
  }

  // Handle client secret generation for type changes
  let clientSecretEnc = existing.clientSecretEnc;
  let newClientSecret: string | undefined;

  const newType = updateData.type ?? existing.type;
  const newAuthMethod = updateData.tokenEndpointAuthMethod ?? existing.tokenEndpointAuthMethod;

  if ((newType === "confidential" || newAuthMethod === "client_secret_basic") && !existing.clientSecretEnc) {
    // Need to generate a new secret
    newClientSecret = generateClientSecret(32);
    if (context.services.kek?.isAvailable()) {
      clientSecretEnc = await context.services.kek.encrypt(Buffer.from(newClientSecret));
    } else {
      throw new ValidationError("Key encryption service not available for confidential clients");
    }
  } else if (newType === "public" && newAuthMethod === "none" && existing.clientSecretEnc) {
    // Remove existing secret for public clients
    clientSecretEnc = null;
  }

  // Prepare update object
  const updateObj: any = {
    ...updateData,
    clientSecretEnc,
    updatedAt: new Date(),
  };

  // Remove undefined values
  Object.keys(updateObj).forEach(key => {
    if (updateObj[key] === undefined) {
      delete updateObj[key];
    }
  });

  // Perform update
  const result = await context.db
    .update(clients)
    .set(updateObj)
    .where(eq(clients.clientId, clientId))
    .returning();

  if (!result[0]) {
    throw new NotFoundError("Client not found");
  }

  const updated = result[0];

  return {
    clientId: updated.clientId,
    name: updated.name,
    type: updated.type,
    tokenEndpointAuthMethod: updated.tokenEndpointAuthMethod,
    requirePkce: updated.requirePkce,
    zkDelivery: updated.zkDelivery,
    zkRequired: updated.zkRequired,
    allowedJweAlgs: updated.allowedJweAlgs,
    allowedJweEncs: updated.allowedJweEncs,
    redirectUris: updated.redirectUris,
    postLogoutRedirectUris: updated.postLogoutRedirectUris,
    grantTypes: updated.grantTypes,
    responseTypes: updated.responseTypes,
    scopes: updated.scopes,
    allowedZkOrigins: updated.allowedZkOrigins,
    idTokenLifetimeSeconds: updated.idTokenLifetimeSeconds,
    refreshTokenLifetimeSeconds: updated.refreshTokenLifetimeSeconds,
    createdAt: updated.createdAt,
    updatedAt: updated.updatedAt,
    clientSecret: newClientSecret,
  };
}

/**
 * Deletes an OAuth client
 */
export async function deleteClient(context: Context, clientId: string): Promise<{ success: boolean }> {
  const result = await context.db
    .delete(clients)
    .where(eq(clients.clientId, clientId))
    .returning();

  if (!result[0]) {
    throw new NotFoundError("Client not found");
  }

  return { success: true };
}

/**
 * Lists all clients with pagination
 */
export async function listClients(
  context: Context,
  options: {
    page?: number;
    limit?: number;
  } = {}
): Promise<{
  clients: Omit<ClientResponse, "clientSecret">[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}> {
  const page = Math.max(1, options.page || 1);
  const limit = Math.min(100, Math.max(1, options.limit || 20));
  const offset = (page - 1) * limit;

  const clientsList = await context.db
    .select({
      clientId: clients.clientId,
      name: clients.name,
      type: clients.type,
      tokenEndpointAuthMethod: clients.tokenEndpointAuthMethod,
      requirePkce: clients.requirePkce,
      zkDelivery: clients.zkDelivery,
      zkRequired: clients.zkRequired,
      allowedJweAlgs: clients.allowedJweAlgs,
      allowedJweEncs: clients.allowedJweEncs,
      redirectUris: clients.redirectUris,
      postLogoutRedirectUris: clients.postLogoutRedirectUris,
      grantTypes: clients.grantTypes,
      responseTypes: clients.responseTypes,
      scopes: clients.scopes,
      allowedZkOrigins: clients.allowedZkOrigins,
      idTokenLifetimeSeconds: clients.idTokenLifetimeSeconds,
      refreshTokenLifetimeSeconds: clients.refreshTokenLifetimeSeconds,
      createdAt: clients.createdAt,
      updatedAt: clients.updatedAt,
    })
    .from(clients)
    .limit(limit)
    .offset(offset);

  const totalResult = await context.db
    .select({ count: clients.clientId })
    .from(clients);
  
  const total = totalResult.length;
  const totalPages = Math.ceil(total / limit);

  return {
    clients: clientsList,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  };
}