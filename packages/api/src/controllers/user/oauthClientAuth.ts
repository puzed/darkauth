import type { IncomingMessage } from "node:http";
import { InvalidRequestError, UnauthorizedClientError } from "../../errors.ts";
import { getClient } from "../../models/clients.ts";
import type { Context } from "../../types.ts";
import { decodeBasicAuth, parseAuthorizationHeader } from "../../utils/http.ts";
import { assertClientSecretMatches } from "./token.ts";

export async function authenticateConfidentialClient(context: Context, request: IncomingMessage) {
  const authHeader = parseAuthorizationHeader(request);
  if (!authHeader || authHeader.type !== "Basic") {
    throw new UnauthorizedClientError("Basic authentication required");
  }
  const credentials = decodeBasicAuth(authHeader.credentials);
  if (!credentials) throw new UnauthorizedClientError("Invalid Basic authentication format");
  const client = await getClient(context, credentials.username);
  if (!client) throw new UnauthorizedClientError("Unknown client");
  if (client.type !== "confidential") {
    throw new UnauthorizedClientError("Client must be confidential");
  }
  if (client.tokenEndpointAuthMethod !== "client_secret_basic") {
    throw new UnauthorizedClientError("Invalid client auth method");
  }
  await assertClientSecretMatches(context, client.clientSecretEnc, credentials.password);
  return client;
}

export async function authenticateRevocationClient(
  context: Context,
  request: IncomingMessage,
  formData: URLSearchParams
) {
  const authHeader = parseAuthorizationHeader(request);
  if (authHeader) return await authenticateConfidentialClient(context, request);
  const clientId = formData.get("client_id") || "";
  if (!clientId) throw new InvalidRequestError("client_id is required for public clients");
  const client = await getClient(context, clientId);
  if (!client) throw new UnauthorizedClientError("Unknown client");
  if (client.tokenEndpointAuthMethod !== "none") {
    throw new UnauthorizedClientError("Invalid client auth method");
  }
  return client;
}
