import type { webcrypto } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { deviceApprovalRequests, keyEnvelopes, trustedDevices } from "../db/schema.ts";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../errors.ts";
import type { Context } from "../types.ts";
import { generateRandomBytes, generateRandomString, sha256Base64Url } from "../utils/crypto.ts";
import { assertScimTrustedDeviceApprovalPolicy } from "./scimPolicy.ts";

const DEVICE_APPROVAL_STATUSES = new Set(["pending", "approved", "consumed", "denied"]);

export type DeviceApprovalStatus = "pending" | "approved" | "consumed" | "denied";

export async function createTrustedDevice(
  context: Context,
  data: {
    deviceId?: string;
    sub: string;
    label?: string | null;
    publicJwk: unknown;
    keyHandle?: string | null;
    envelopeId?: string | null;
  }
) {
  validateIdentifier(data.sub, "sub");
  validateJwk(data.publicJwk, "publicJwk");
  if (data.envelopeId) await assertTrustedDeviceEnvelope(context, data.sub, data.envelopeId);
  const row = {
    deviceId: data.deviceId ?? `dev_${generateRandomString(24)}`,
    sub: data.sub,
    label: normalizeLabel(data.label),
    publicJwk: data.publicJwk,
    keyHandle: data.keyHandle ?? null,
    envelopeId: data.envelopeId ?? null,
    createdAt: new Date(),
    lastSeenAt: new Date(),
    revokedAt: null,
  } satisfies typeof trustedDevices.$inferInsert;
  validateIdentifier(row.deviceId, "deviceId");
  await context.db.insert(trustedDevices).values(row);
  return row;
}

export async function listTrustedDevices(context: Context, sub: string, includeRevoked = false) {
  validateIdentifier(sub, "sub");
  const conditions = [eq(trustedDevices.sub, sub)];
  if (!includeRevoked) conditions.push(isNull(trustedDevices.revokedAt));
  return await context.db.query.trustedDevices.findMany({
    where: and(...conditions),
  });
}

export async function revokeTrustedDevice(
  context: Context,
  data: { sub: string; deviceId: string }
) {
  validateIdentifier(data.sub, "sub");
  validateIdentifier(data.deviceId, "deviceId");
  const rows = await context.db
    .update(trustedDevices)
    .set({ revokedAt: new Date() })
    .where(and(eq(trustedDevices.deviceId, data.deviceId), eq(trustedDevices.sub, data.sub)))
    .returning();
  const row = rows[0];
  if (!row) throw new NotFoundError("Trusted device not found");
  return row;
}

export async function createDeviceApprovalRequest(
  context: Context,
  data: {
    sub: string;
    requesterSessionId?: string | null;
    newDevicePublicJwk: unknown;
    newDeviceLabel?: string | null;
    metadata?: Record<string, unknown>;
    ttlMs?: number;
  }
) {
  validateIdentifier(data.sub, "sub");
  await assertScimTrustedDeviceApprovalPolicy(context, data.sub);
  validateJwk(data.newDevicePublicJwk, "newDevicePublicJwk");
  const ttlMs = data.ttlMs ?? 10 * 60 * 1000;
  if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0 || ttlMs > 30 * 60 * 1000) {
    throw new ValidationError("Invalid approval ttl");
  }
  const requestId = `dap_${generateRandomString(24)}`;
  const verificationCode = generateVerificationCode();
  const metadata = normalizeApprovalMetadata(data.metadata, {
    sub: data.sub,
    requestId,
    requesterSessionId: data.requesterSessionId ?? null,
    verificationCode,
    newDevicePublicJwk: data.newDevicePublicJwk,
  });
  const row = {
    requestId,
    sub: data.sub,
    requesterSessionId: data.requesterSessionId ?? null,
    newDevicePublicJwk: data.newDevicePublicJwk,
    newDeviceLabel: normalizeLabel(data.newDeviceLabel),
    verificationCode,
    status: "pending",
    approvedByDeviceId: null,
    encryptedApproval: null,
    approvalAad: null,
    metadata,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + ttlMs),
    approvedAt: null,
    consumedAt: null,
    deniedAt: null,
  } satisfies typeof deviceApprovalRequests.$inferInsert;
  await context.db.insert(deviceApprovalRequests).values(row);
  return row;
}

export async function listDeviceApprovalRequests(
  context: Context,
  sub: string,
  options: { status?: DeviceApprovalStatus; includeExpired?: boolean } = {}
) {
  validateIdentifier(sub, "sub");
  if (options.status && !DEVICE_APPROVAL_STATUSES.has(options.status)) {
    throw new ValidationError("Invalid approval status");
  }
  const conditions = [eq(deviceApprovalRequests.sub, sub)];
  if (options.status) conditions.push(eq(deviceApprovalRequests.status, options.status));
  if (!options.includeExpired) conditions.push(gt(deviceApprovalRequests.expiresAt, new Date()));
  return await context.db.query.deviceApprovalRequests.findMany({
    where: and(...conditions),
  });
}

export async function approveDeviceApprovalRequest(
  context: Context,
  data: {
    sub: string;
    requestId: string;
    approvedByDeviceId: string;
    encryptedApproval: Buffer;
    approvalAad: Buffer;
    approvalProof: Buffer;
  }
) {
  validateIdentifier(data.sub, "sub");
  await assertScimTrustedDeviceApprovalPolicy(context, data.sub);
  validateIdentifier(data.requestId, "requestId");
  validateIdentifier(data.approvedByDeviceId, "approvedByDeviceId");
  validateCiphertext(data.encryptedApproval, "encryptedApproval");
  validateCiphertext(data.approvalAad, "approvalAad");
  const device = await context.db.query.trustedDevices.findFirst({
    where: and(
      eq(trustedDevices.deviceId, data.approvedByDeviceId),
      eq(trustedDevices.sub, data.sub),
      isNull(trustedDevices.revokedAt)
    ),
  });
  if (!device) throw new ForbiddenError("Trusted device cannot approve");
  const request = await context.db.query.deviceApprovalRequests.findFirst({
    where: and(
      eq(deviceApprovalRequests.requestId, data.requestId),
      eq(deviceApprovalRequests.sub, data.sub)
    ),
  });
  if (!request) throw new ConflictError("Approval request is not pending");
  assertApprovalAad(data.approvalAad, request);
  await assertTrustedDeviceApprovalProof(device.publicJwk, data.approvalAad, data.approvalProof);
  const rows = await context.db
    .update(deviceApprovalRequests)
    .set({
      status: "approved",
      approvedByDeviceId: data.approvedByDeviceId,
      encryptedApproval: data.encryptedApproval,
      approvalAad: data.approvalAad,
      approvedAt: new Date(),
    })
    .where(
      and(
        eq(deviceApprovalRequests.requestId, data.requestId),
        eq(deviceApprovalRequests.sub, data.sub),
        eq(deviceApprovalRequests.status, "pending"),
        gt(deviceApprovalRequests.expiresAt, new Date())
      )
    )
    .returning();
  const row = rows[0];
  if (!row) throw new ConflictError("Approval request is not pending");
  await touchTrustedDevice(context, data.approvedByDeviceId, data.sub);
  return row;
}

export async function getDeviceApprovalRequestAad(
  context: Context,
  data: { sub: string; requestId: string }
) {
  validateIdentifier(data.sub, "sub");
  validateIdentifier(data.requestId, "requestId");
  const request = await context.db.query.deviceApprovalRequests.findFirst({
    where: and(
      eq(deviceApprovalRequests.requestId, data.requestId),
      eq(deviceApprovalRequests.sub, data.sub)
    ),
  });
  if (!request) throw new ConflictError("Approval request is not pending");
  return approvalAadForRequest(request);
}

export async function consumeDeviceApprovalRequest(
  context: Context,
  data: {
    sub: string;
    requestId: string;
    newDeviceProof: string;
    requesterSessionId?: string | null;
  }
) {
  validateIdentifier(data.sub, "sub");
  await assertScimTrustedDeviceApprovalPolicy(context, data.sub);
  validateIdentifier(data.requestId, "requestId");
  validateIdentifier(data.newDeviceProof, "newDeviceProof");
  const request = await context.db.query.deviceApprovalRequests.findFirst({
    where: and(
      eq(deviceApprovalRequests.requestId, data.requestId),
      eq(deviceApprovalRequests.sub, data.sub)
    ),
  });
  if (!request) throw new ConflictError("Approval request cannot be consumed");
  if (request.requesterSessionId && data.requesterSessionId !== request.requesterSessionId) {
    throw new ForbiddenError("Approval request belongs to another session");
  }
  assertNewDeviceProof(data.newDeviceProof, request);
  const rows = await context.db
    .update(deviceApprovalRequests)
    .set({ status: "consumed", consumedAt: new Date() })
    .where(
      and(
        eq(deviceApprovalRequests.requestId, data.requestId),
        eq(deviceApprovalRequests.sub, data.sub),
        eq(deviceApprovalRequests.status, "approved"),
        isNull(deviceApprovalRequests.consumedAt),
        gt(deviceApprovalRequests.expiresAt, new Date())
      )
    )
    .returning();
  const row = rows[0];
  if (!row) throw new ConflictError("Approval request cannot be consumed");
  if (!row.encryptedApproval || !row.approvalAad) throw new ValidationError("Approval is invalid");
  return row;
}

export async function denyDeviceApprovalRequest(
  context: Context,
  data: { sub: string; requestId: string }
) {
  validateIdentifier(data.sub, "sub");
  validateIdentifier(data.requestId, "requestId");
  const rows = await context.db
    .update(deviceApprovalRequests)
    .set({ status: "denied", deniedAt: new Date() })
    .where(
      and(
        eq(deviceApprovalRequests.requestId, data.requestId),
        eq(deviceApprovalRequests.sub, data.sub),
        eq(deviceApprovalRequests.status, "pending"),
        gt(deviceApprovalRequests.expiresAt, new Date())
      )
    )
    .returning();
  const row = rows[0];
  if (!row) throw new ConflictError("Approval request is not pending");
  return row;
}

async function assertTrustedDeviceEnvelope(context: Context, sub: string, envelopeId: string) {
  const envelope = await context.db.query.keyEnvelopes.findFirst({
    where: and(
      eq(keyEnvelopes.envelopeId, envelopeId),
      eq(keyEnvelopes.sub, sub),
      eq(keyEnvelopes.type, "trusted_device"),
      isNull(keyEnvelopes.revokedAt)
    ),
  });
  if (!envelope) throw new ValidationError("Trusted device envelope is required");
}

async function touchTrustedDevice(context: Context, deviceId: string, sub: string) {
  await context.db
    .update(trustedDevices)
    .set({ lastSeenAt: new Date() })
    .where(and(eq(trustedDevices.deviceId, deviceId), eq(trustedDevices.sub, sub)));
}

function normalizeLabel(value?: string | null) {
  const label = value?.trim();
  return label ? label.slice(0, 128) : null;
}

function validateIdentifier(value: string, name: string) {
  if (!value || typeof value !== "string" || value.trim().length === 0) {
    throw new ValidationError(`${name} is required`);
  }
}

function validateJwk(value: unknown, name: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ValidationError(`${name} must be an object`);
  }
  const jwk = value as Record<string, unknown>;
  if (typeof jwk.kty !== "string" || !jwk.kty.trim()) {
    throw new ValidationError(`${name}.kty is required`);
  }
}

function validateCiphertext(value: Buffer, name: string) {
  if (!Buffer.isBuffer(value) || value.length === 0 || value.length > 1024 * 1024) {
    throw new ValidationError(`${name} must be a non-empty buffer`);
  }
}

function generateVerificationCode() {
  const value = generateRandomBytes(4).readUInt32BE(0) % 1_000_000;
  return value.toString().padStart(6, "0");
}

function normalizeApprovalMetadata(
  metadata: Record<string, unknown> | undefined,
  binding: {
    sub: string;
    requestId: string;
    requesterSessionId: string | null;
    verificationCode: string;
    newDevicePublicJwk: unknown;
  }
) {
  const input = metadata ?? {};
  const clientId = typeof input.client_id === "string" ? input.client_id : null;
  const stateHash = typeof input.state_hash === "string" ? input.state_hash : null;
  const verificationCodeHash =
    typeof input.verification_code_hash === "string"
      ? input.verification_code_hash
      : sha256Base64Url(binding.verificationCode);
  const newDevicePublicJwkHash = sha256Base64Url(JSON.stringify(binding.newDevicePublicJwk));
  return {
    ...input,
    client_id: clientId,
    state_hash: stateHash,
    verification_code_hash: verificationCodeHash,
    new_device_public_jwk_hash: newDevicePublicJwkHash,
    request_binding_hash: sha256Base64Url(
      JSON.stringify({
        sub: binding.sub,
        request_id: binding.requestId,
        requester_session_id: binding.requesterSessionId,
        client_id: clientId,
        state_hash: stateHash,
        verification_code_hash: verificationCodeHash,
        new_device_public_jwk_hash: newDevicePublicJwkHash,
      })
    ),
  };
}

async function assertTrustedDeviceApprovalProof(
  publicJwk: unknown,
  approvalAad: Buffer,
  approvalProof: Buffer
) {
  if (!publicJwk || typeof publicJwk !== "object" || Array.isArray(publicJwk)) {
    throw new ForbiddenError("Trusted device approval proof is required");
  }
  const jwk = publicJwk as webcrypto.JsonWebKey;
  if (jwk.kty !== "EC" || jwk.crv !== "P-256") {
    throw new ForbiddenError("Trusted device approval proof is required");
  }
  let key: webcrypto.CryptoKey;
  try {
    key = await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, [
      "verify",
    ]);
  } catch {
    throw new ForbiddenError("Trusted device approval proof is invalid");
  }
  const valid = await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    toArrayBuffer(approvalProof),
    toArrayBuffer(approvalAad)
  );
  if (!valid) throw new ForbiddenError("Trusted device approval proof is invalid");
}

function toArrayBuffer(value: Buffer) {
  return Uint8Array.from(value).buffer;
}

function assertNewDeviceProof(proof: string, request: typeof deviceApprovalRequests.$inferSelect) {
  const metadata =
    request.metadata && typeof request.metadata === "object" && !Array.isArray(request.metadata)
      ? (request.metadata as Record<string, unknown>)
      : {};
  const expected =
    typeof metadata.new_device_public_jwk_hash === "string"
      ? metadata.new_device_public_jwk_hash
      : sha256Base64Url(JSON.stringify(request.newDevicePublicJwk));
  if (proof !== expected) throw new ValidationError("Invalid new device proof");
}

function assertApprovalAad(aad: Buffer, request: typeof deviceApprovalRequests.$inferSelect) {
  const expected = approvalAadForRequest(request);
  if (!aad.equals(expected)) throw new ValidationError("Invalid approval AAD");
}

function approvalAadForRequest(request: typeof deviceApprovalRequests.$inferSelect) {
  const metadata =
    request.metadata && typeof request.metadata === "object" && !Array.isArray(request.metadata)
      ? (request.metadata as Record<string, unknown>)
      : {};
  const publicKeyHash =
    typeof metadata.new_device_public_jwk_hash === "string"
      ? metadata.new_device_public_jwk_hash
      : sha256Base64Url(JSON.stringify(request.newDevicePublicJwk));
  const requestBindingHash =
    typeof metadata.request_binding_hash === "string" ? metadata.request_binding_hash : null;
  return Buffer.from(
    [
      "DarkAuth",
      "device-approval",
      request.sub,
      request.requestId,
      publicKeyHash,
      requestBindingHash,
    ]
      .filter((value): value is string => typeof value === "string")
      .join("|")
  );
}
