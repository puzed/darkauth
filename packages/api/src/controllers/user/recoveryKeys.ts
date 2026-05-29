import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { UnauthorizedError, ValidationError } from "../../errors.ts";
import { genericErrors } from "../../http/openapi-helpers.ts";
import { getCachedBody, withRateLimit } from "../../middleware/rateLimit.ts";
import {
  createRecoveryKey,
  listRecoveryKeys,
  type RecoveryKeyWithEnvelope,
  recordRecoveryKeyUse,
  revokeRecoveryKey,
} from "../../models/recoveryKeys.ts";
import { getSessionId, requireSession, updateSession } from "../../services/sessions.ts";
import type { Context, ControllerSchema } from "../../types.ts";
import { withAudit } from "../../utils/auditWrapper.ts";
import { fromBase64Url, generateRandomString, toBase64Url } from "../../utils/crypto.ts";
import { parseJsonSafely, sendJsonValidated } from "../../utils/http.ts";

const Base64UrlString = z.string().refine(isValidBase64Url, "Invalid base64url value");

const RecoveryKeyEnvelopeSchema = z.object({
  envelope_id: z.string(),
  key_id: z.string(),
  wrapping_alg: z.string(),
  wrapped_key: z.string(),
  aad: z.string(),
  metadata: z.unknown(),
  created_at: z.unknown(),
  last_used_at: z.unknown().nullable(),
  revoked_at: z.unknown().nullable(),
});

const RecoveryKeySchema = z.object({
  recovery_key_id: z.string(),
  sub: z.string(),
  envelope_id: z.string(),
  label: z.string().nullable(),
  verifier_alg: z.string(),
  metadata: z.unknown(),
  created_at: z.unknown(),
  last_used_at: z.unknown().nullable(),
  revoked_at: z.unknown().nullable(),
  envelope: RecoveryKeyEnvelopeSchema,
});

const RecoveryKeysResponseSchema = z.object({ recovery_keys: z.array(RecoveryKeySchema) });
const RecoveryKeyResponseSchema = z.object({ recovery_key: RecoveryKeySchema });

const RecoveryKeyCreateRequest = z
  .object({
    recovery_key_id: z.string().trim().min(1).max(256).optional(),
    envelope_id: z.string().trim().min(1).max(256).optional(),
    key_id: z.string().trim().min(1).max(256),
    label: z.string().trim().min(1).max(128).nullable().optional(),
    wrapping_alg: z.string().trim().min(1).max(128),
    wrapped_key: Base64UrlString,
    aad: Base64UrlString,
    verifier: Base64UrlString,
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

const RecoveryKeyUseRequest = z
  .object({
    verifier: Base64UrlString,
  })
  .strict();

export async function getRecoveryKeys(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse
) {
  const sub = await requireUserSub(context, request);
  const url = new URL(request.url || "", `http://${request.headers.host}`);
  const rows = await listRecoveryKeys(context, sub, {
    includeRevoked: url.searchParams.get("include_revoked") === "true",
  });
  sendJsonValidated(
    response,
    200,
    { recovery_keys: rows.map(serializeRecoveryKey) },
    RecoveryKeysResponseSchema
  );
}

export const postRecoveryKey = withRateLimit("key_management")(
  withAudit({
    eventType: "RECOVERY_KEY_CREATE",
    resourceType: "recovery_key",
    extractResourceId: (body) =>
      body && typeof body === "object" && "recovery_key" in body
        ? (body as { recovery_key?: { recovery_key_id?: string } }).recovery_key?.recovery_key_id
        : undefined,
    skipBodyCapture: true,
  })(async (context, request, response): Promise<void> => {
    const sub = await requireUserSub(context, request);
    const parsed = parseBody(RecoveryKeyCreateRequest, await getCachedBody(request));
    const envelopeId = parsed.envelope_id ?? `env_${generateRandomString(24)}`;
    const wrappedKey = decodeBase64Url(parsed.wrapped_key, "wrapped_key");
    const aad = decodeBase64Url(parsed.aad, "aad");
    const verifier = decodeRecoveryVerifier(parsed.verifier);
    const expectedAad = canonicalEnvelopeAad({
      sub,
      keyId: parsed.key_id,
      envelopeId,
      type: "recovery",
      wrappingAlg: parsed.wrapping_alg,
    });
    if (!expectedAad.equals(aad)) throw new ValidationError("Invalid recovery envelope AAD");
    const recoveryKey = await createRecoveryKey(context, {
      recoveryKeyId: parsed.recovery_key_id,
      envelopeId,
      keyId: parsed.key_id,
      sub,
      label: parsed.label ?? null,
      wrappingAlg: parsed.wrapping_alg,
      wrappedKey,
      aad,
      verifier,
      metadata: parsed.metadata ?? {},
    });
    sendJsonValidated(
      response,
      201,
      { recovery_key: serializeRecoveryKey(recoveryKey) },
      RecoveryKeyResponseSchema
    );
  })
);

export const postRecoveryKeyRevoke = withRateLimit("key_management")(
  withAudit({
    eventType: "RECOVERY_KEY_REVOKE",
    resourceType: "recovery_key",
    extractResourceId: (_body, params) => params[0],
    skipBodyCapture: true,
  })(async (context, request, response, recoveryKeyId): Promise<void> => {
    const sub = await requireUserSub(context, request);
    if (!recoveryKeyId) throw new ValidationError("recovery_key_id is required");
    const recoveryKey = await revokeRecoveryKey(context, { sub, recoveryKeyId });
    sendJsonValidated(
      response,
      200,
      { recovery_key: serializeRecoveryKey(recoveryKey) },
      RecoveryKeyResponseSchema
    );
  })
);

export const postRecoveryKeyUse = withRateLimit("key_management")(
  withAudit({
    eventType: "RECOVERY_KEY_USE",
    resourceType: "recovery_key",
    extractResourceId: (_body, params) => params[0],
    skipBodyCapture: true,
    flushAudit: true,
  })(async (context, request, response, recoveryKeyId): Promise<void> => {
    const session = await requireSession(context, request, false);
    if (!session.sub) throw new UnauthorizedError("User session required");
    const sub = session.sub;
    if (!recoveryKeyId) throw new ValidationError("recovery_key_id is required");
    const parsed = parseBody(RecoveryKeyUseRequest, await getCachedBody(request));
    const recoveryKey = await recordRecoveryKeyUse(context, {
      sub,
      recoveryKeyId,
      verifier: decodeRecoveryVerifier(parsed.verifier),
    });
    const sessionId = getSessionId(request, false);
    if (sessionId) await updateSession(context, sessionId, { ...session, keyState: "unlocked" });
    sendJsonValidated(
      response,
      200,
      { recovery_key: serializeRecoveryKey(recoveryKey) },
      RecoveryKeyResponseSchema
    );
  })
);

export const getRecoveryKeysSchema = {
  method: "GET",
  path: "/crypto/recovery-keys",
  tags: ["Crypto"],
  summary: "recoveryKeys",
  responses: {
    200: {
      description: "OK",
      content: { "application/json": { schema: RecoveryKeysResponseSchema } },
    },
    ...genericErrors,
  },
} as const satisfies ControllerSchema;

export const postRecoveryKeySchema = {
  method: "POST",
  path: "/crypto/recovery-keys",
  tags: ["Crypto"],
  summary: "createRecoveryKey",
  body: {
    contentType: "application/json",
    schema: RecoveryKeyCreateRequest,
  },
  responses: {
    201: {
      description: "Created",
      content: { "application/json": { schema: RecoveryKeyResponseSchema } },
    },
    ...genericErrors,
  },
} as const satisfies ControllerSchema;

export const postRecoveryKeyRevokeSchema = {
  method: "POST",
  path: "/crypto/recovery-keys/{recovery_key_id}/revoke",
  tags: ["Crypto"],
  summary: "revokeRecoveryKey",
  params: z.object({ recovery_key_id: z.string() }),
  responses: {
    200: {
      description: "OK",
      content: { "application/json": { schema: RecoveryKeyResponseSchema } },
    },
    ...genericErrors,
  },
} as const satisfies ControllerSchema;

export const postRecoveryKeyUseSchema = {
  method: "POST",
  path: "/crypto/recovery-keys/{recovery_key_id}/use",
  tags: ["Crypto"],
  summary: "recordRecoveryKeyUse",
  params: z.object({ recovery_key_id: z.string() }),
  body: {
    contentType: "application/json",
    schema: RecoveryKeyUseRequest,
  },
  responses: {
    200: {
      description: "OK",
      content: { "application/json": { schema: RecoveryKeyResponseSchema } },
    },
    ...genericErrors,
  },
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

function serializeRecoveryKey(row: RecoveryKeyWithEnvelope) {
  if (!row.envelope.wrappedKey || !row.envelope.aad) throw new ValidationError("Invalid envelope");
  return {
    recovery_key_id: row.recoveryKey.recoveryKeyId,
    sub: row.recoveryKey.sub,
    envelope_id: row.recoveryKey.envelopeId,
    label: row.recoveryKey.label,
    verifier_alg: row.recoveryKey.verifierAlg,
    metadata: row.recoveryKey.metadata,
    created_at: row.recoveryKey.createdAt,
    last_used_at: row.recoveryKey.lastUsedAt,
    revoked_at: row.recoveryKey.revokedAt ?? row.envelope.revokedAt,
    envelope: {
      envelope_id: row.envelope.envelopeId,
      key_id: row.envelope.keyId,
      wrapping_alg: row.envelope.wrappingAlg,
      wrapped_key: toBase64Url(row.envelope.wrappedKey),
      aad: toBase64Url(row.envelope.aad),
      metadata: row.envelope.metadata,
      created_at: row.envelope.createdAt,
      last_used_at: row.envelope.lastUsedAt,
      revoked_at: row.envelope.revokedAt,
    },
  };
}

function decodeBase64Url(value: string, name: string): Buffer {
  const decoded = fromBase64Url(value);
  if (decoded.length === 0 || decoded.length > 1024 * 1024 || toBase64Url(decoded) !== value) {
    throw new ValidationError(`Invalid ${name}`);
  }
  return decoded;
}

function decodeRecoveryVerifier(value: string): Buffer {
  const decoded = decodeBase64Url(value, "verifier");
  if (decoded.length !== 32) throw new ValidationError("Recovery verifier must be 32 bytes");
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
