import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { UnauthorizedError, ValidationError } from "../../errors.ts";
import { genericErrors } from "../../http/openapi-helpers.ts";
import { withRateLimit } from "../../middleware/rateLimit.ts";
import {
  createAccountKey,
  createKeyEnvelope,
  type KeyEnvelopeType,
  listAccountKeys,
  listKeyEnvelopes,
  revokeKeyEnvelope,
} from "../../models/keybag.ts";
import { requireSession } from "../../services/sessions.ts";
import type { Context, ControllerSchema } from "../../types.ts";
import { withAudit } from "../../utils/auditWrapper.ts";
import { fromBase64Url, generateRandomString, toBase64Url } from "../../utils/crypto.ts";
import { parseJsonSafely, readBody, sendJson } from "../../utils/http.ts";

const envelopeTypes = ["password", "passkey_prf", "trusted_device", "recovery"] as const;

const AccountKeyRequest = z.object({
  key_id: z.string().trim().min(1).max(256).optional(),
  version: z.string().trim().min(1).max(64).optional(),
});

const KeyEnvelopeRequest = z.object({
  envelope_id: z.string().trim().min(1).max(256).optional(),
  key_id: z.string().trim().min(1).max(256),
  type: z.enum(envelopeTypes),
  label: z.string().trim().min(1).max(128).nullable().optional(),
  wrapping_alg: z.string().trim().min(1).max(128),
  wrapped_key: z.string().refine(isValidBase64Url, "Invalid wrapped_key"),
  aad: z.string().refine(isValidBase64Url, "Invalid aad"),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const getKeybag = withRateLimit("key_management")(async function getKeybag(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  ..._params: string[]
): Promise<void> {
  const sub = await requireUserSub(context, request);
  const [accountKeys, envelopes] = await Promise.all([
    listAccountKeys(context, sub),
    listKeyEnvelopes(context, sub),
  ]);

  sendJson(response, 200, {
    account_keys: accountKeys.map(serializeAccountKey),
    envelopes: envelopes.map(serializeKeyEnvelope),
  });
});

export const postAccountKey = withAudit({
  eventType: "ACCOUNT_KEY_CREATE",
  resourceType: "account_key",
  extractResourceId: (body) =>
    body && typeof body === "object" && "key_id" in body
      ? (body as { key_id?: string }).key_id
      : undefined,
  skipBodyCapture: true,
})(
  withRateLimit("key_management")(async (context, request, response): Promise<void> => {
    const sub = await requireUserSub(context, request);
    const parsed = parseBody(AccountKeyRequest, await readBody(request));
    const accountKey = await createAccountKey(context, {
      keyId: parsed.key_id ?? `ark_${generateRandomString(24)}`,
      sub,
      version: parsed.version ?? "v2",
    });

    sendJson(response, 201, {
      account_key: serializeAccountKey(accountKey),
    });
  })
);

export const getKeyEnvelopes = withRateLimit("key_management")(async function getKeyEnvelopes(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  ..._params: string[]
): Promise<void> {
  const sub = await requireUserSub(context, request);
  const url = new URL(request.url || "", `http://${request.headers.host}`);
  const includeRevoked = url.searchParams.get("include_revoked") === "true";
  const type = url.searchParams.get("type");
  if (type && !envelopeTypes.includes(type as KeyEnvelopeType)) {
    throw new ValidationError("Invalid envelope type");
  }
  const envelopes = await listKeyEnvelopes(context, sub, {
    includeRevoked,
    type: type ? (type as KeyEnvelopeType) : undefined,
  });

  sendJson(response, 200, {
    envelopes: envelopes.map(serializeKeyEnvelope),
  });
});

export const postKeyEnvelope = withAudit({
  eventType: "KEY_ENVELOPE_CREATE",
  resourceType: "key_envelope",
  extractResourceId: (body) =>
    body && typeof body === "object" && "envelope" in body
      ? (body as { envelope?: { envelope_id?: string } }).envelope?.envelope_id
      : undefined,
  skipBodyCapture: true,
})(
  withRateLimit("key_management")(async (context, request, response): Promise<void> => {
    const sub = await requireUserSub(context, request);
    const parsed = parseBody(KeyEnvelopeRequest, await readBody(request));
    const envelopeId = parsed.envelope_id ?? `env_${generateRandomString(24)}`;
    const wrappedKey = decodeBase64Url(parsed.wrapped_key, "wrapped_key");
    const aad = decodeBase64Url(parsed.aad, "aad");
    if (parsed.metadata?.version === "v2" || parsed.wrapping_alg.endsWith("/v2")) {
      const expectedAad = canonicalEnvelopeAad({
        sub,
        keyId: parsed.key_id,
        envelopeId,
        type: parsed.type,
        wrappingAlg: parsed.wrapping_alg,
      });
      if (!expectedAad.equals(aad)) throw new ValidationError("Invalid envelope AAD");
    }
    const envelope = await createKeyEnvelope(context, {
      envelopeId,
      keyId: parsed.key_id,
      sub,
      type: parsed.type,
      label: parsed.label ?? null,
      wrappingAlg: parsed.wrapping_alg,
      wrappedKey,
      aad,
      metadata: parsed.metadata ?? {},
    });

    sendJson(response, 201, {
      envelope: serializeKeyEnvelope(envelope),
    });
  })
);

export const deleteKeyEnvelope = withAudit({
  eventType: "KEY_ENVELOPE_REVOKE",
  resourceType: "key_envelope",
  extractResourceId: (_body, params) => params[0],
  skipBodyCapture: true,
})(
  withRateLimit("key_management")(async (context, request, response, envelopeId): Promise<void> => {
    const sub = await requireUserSub(context, request);
    if (!envelopeId) throw new ValidationError("envelope_id is required");
    const envelope = await revokeKeyEnvelope(context, envelopeId, sub);

    sendJson(response, 200, {
      envelope: serializeKeyEnvelope(envelope),
    });
  })
);

export const getKeybagSchema = {
  method: "GET",
  path: "/crypto/keybag",
  tags: ["Crypto"],
  summary: "keybag",
  responses: { 200: { description: "OK" }, ...genericErrors },
} as const satisfies ControllerSchema;

export const postAccountKeySchema = {
  method: "POST",
  path: "/crypto/keybag/account-key",
  tags: ["Crypto"],
  summary: "createAccountKey",
  responses: { 201: { description: "Created" }, ...genericErrors },
} as const satisfies ControllerSchema;

export const getKeyEnvelopesSchema = {
  method: "GET",
  path: "/crypto/keybag/envelopes",
  tags: ["Crypto"],
  summary: "keyEnvelopes",
  responses: { 200: { description: "OK" }, ...genericErrors },
} as const satisfies ControllerSchema;

export const postKeyEnvelopeSchema = {
  method: "POST",
  path: "/crypto/keybag/envelopes",
  tags: ["Crypto"],
  summary: "createKeyEnvelope",
  responses: { 201: { description: "Created" }, ...genericErrors },
} as const satisfies ControllerSchema;

export const deleteKeyEnvelopeSchema = {
  method: "DELETE",
  path: "/crypto/keybag/envelopes/{envelope_id}",
  tags: ["Crypto"],
  summary: "revokeKeyEnvelope",
  responses: { 200: { description: "OK" }, ...genericErrors },
} as const satisfies ControllerSchema;

async function requireUserSub(context: Context, request: IncomingMessage): Promise<string> {
  const session = await requireSession(context, request, false);
  if (!session.sub) throw new UnauthorizedError("User session required");
  return session.sub;
}

function parseBody<T>(schema: z.ZodType<T>, body: string): T {
  const parsed = schema.safeParse(parseJsonSafely(body));
  if (!parsed.success) {
    throw new ValidationError("Invalid request format", parsed.error.flatten());
  }
  return parsed.data;
}

function serializeAccountKey(row: {
  keyId: string;
  sub: string;
  version: string;
  status: string;
  createdAt: Date;
  rotatedAt: Date | null;
}) {
  return {
    key_id: row.keyId,
    sub: row.sub,
    version: row.version,
    status: row.status,
    created_at: row.createdAt,
    rotated_at: row.rotatedAt,
  };
}

function serializeKeyEnvelope(row: {
  envelopeId: string;
  keyId: string;
  sub: string;
  type: string;
  label: string | null;
  wrappingAlg: string;
  wrappedKey: Buffer | null;
  aad: Buffer | null;
  metadata: unknown;
  createdAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
}) {
  if (!row.wrappedKey || !row.aad) throw new ValidationError("Invalid key envelope");
  return {
    envelope_id: row.envelopeId,
    key_id: row.keyId,
    sub: row.sub,
    type: row.type,
    label: row.label,
    wrapping_alg: row.wrappingAlg,
    wrapped_key: toBase64Url(row.wrappedKey),
    aad: toBase64Url(row.aad),
    metadata: row.metadata,
    created_at: row.createdAt,
    last_used_at: row.lastUsedAt,
    revoked_at: row.revokedAt,
  };
}

function decodeBase64Url(value: string, name: string): Buffer {
  const decoded = fromBase64Url(value);
  if (decoded.length === 0 || decoded.length > 1024 * 1024 || toBase64Url(decoded) !== value) {
    throw new ValidationError(`Invalid ${name}`);
  }
  return decoded;
}

function canonicalEnvelopeAad(data: {
  sub: string;
  keyId: string;
  envelopeId: string;
  type: string;
  wrappingAlg: string;
}): Buffer {
  return Buffer.from(
    JSON.stringify({
      envelope_id: data.envelopeId,
      key_id: data.keyId,
      sub: data.sub,
      type: data.type,
      wrapping_alg: data.wrappingAlg,
    })
  );
}

function isValidBase64Url(value: string): boolean {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return false;
  try {
    decodeBase64Url(value, "value");
    return true;
  } catch {
    return false;
  }
}
