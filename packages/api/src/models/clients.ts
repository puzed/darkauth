import { desc, eq } from "drizzle-orm";
import { clients } from "../db/schema.js";
import { NotFoundError, ConflictError } from "../errors.js";
import type { Context } from "../types.js";

export type Client = {
  clientId: string;
  name: string;
  type: string;
  tokenEndpointAuthMethod: string;
  requirePkce: boolean;
  zkDelivery: string;
  zkRequired: boolean;
  allowedJweAlgs: string[];
  allowedJweEncs: string[];
  redirectUris: string[];
  postLogoutRedirectUris: string[];
  grantTypes: string[];
  responseTypes: string[];
  scopes: string[];
  allowedZkOrigins: string[];
  idTokenLifetimeSeconds: number | null;
  refreshTokenLifetimeSeconds: number | null;
  createdAt: Date;
  updatedAt: Date;
  clientSecret?: string;
};

export type ListClientsResult = {
  clients: Client[];
};

export async function listClients(context: Context): Promise<ListClientsResult> {
  const clientsData = await context.db
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
    .orderBy(desc(clients.createdAt));

  return {
    clients: clientsData,
  };
}

export async function getClientById(context: Context, clientId: string): Promise<Client> {
  const result = await context.db
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
    .where(eq(clients.clientId, clientId))
    .limit(1);

  if (!result[0]) {
    throw new NotFoundError("Client not found");
  }

  return result[0];
}

export async function createClient(
  context: Context,
  data: {
    clientId: string;
    name: string;
    type: string;
    tokenEndpointAuthMethod: string;
    requirePkce: boolean;
    zkDelivery: string;
    zkRequired: boolean;
    allowedJweAlgs: string[];
    allowedJweEncs: string[];
    redirectUris: string[];
    postLogoutRedirectUris: string[];
    grantTypes: string[];
    responseTypes: string[];
    scopes: string[];
    allowedZkOrigins: string[];
    idTokenLifetimeSeconds?: number | null;
    refreshTokenLifetimeSeconds?: number | null;
    clientSecret?: string;
  }
): Promise<Client> {
  const existing = await context.db
    .select({ clientId: clients.clientId })
    .from(clients)
    .where(eq(clients.clientId, data.clientId))
    .limit(1);

  if (existing[0]) {
    throw new ConflictError("Client with this ID already exists");
  }

  const result = await context.db
    .insert(clients)
    .values(data)
    .returning();

  return result[0];
}

export async function updateClient(
  context: Context,
  clientId: string,
  data: {
    name?: string;
    type?: string;
    tokenEndpointAuthMethod?: string;
    requirePkce?: boolean;
    zkDelivery?: string;
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
    clientSecret?: string;
  }
): Promise<Client> {
  const existing = await context.db
    .select({ clientId: clients.clientId })
    .from(clients)
    .where(eq(clients.clientId, clientId))
    .limit(1);

  if (!existing[0]) {
    throw new NotFoundError("Client not found");
  }

  const result = await context.db
    .update(clients)
    .set(data)
    .where(eq(clients.clientId, clientId))
    .returning();

  return result[0];
}

export async function deleteClient(context: Context, clientId: string) {
  const result = await context.db
    .delete(clients)
    .where(eq(clients.clientId, clientId))
    .returning();

  if (!result[0]) {
    throw new NotFoundError("Client not found");
  }

  return { success: true };
}