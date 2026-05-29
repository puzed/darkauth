import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { UnauthorizedError, ValidationError } from "../../errors.ts";
import { genericErrors } from "../../http/openapi-helpers.ts";
import { getCachedBody, withRateLimit } from "../../middleware/rateLimit.ts";
import {
  approveDeviceApprovalRequest,
  consumeDeviceApprovalRequest,
  createDeviceApprovalRequest,
  createTrustedDevice,
  type DeviceApprovalStatus,
  denyDeviceApprovalRequest,
  listDeviceApprovalRequests,
  listTrustedDevices,
  revokeTrustedDevice,
} from "../../models/trustedDevices.ts";
import { getSessionId, requireSession } from "../../services/sessions.ts";
import type { Context, ControllerSchema } from "../../types.ts";
import { withAudit } from "../../utils/auditWrapper.ts";
import { fromBase64Url, toBase64Url } from "../../utils/crypto.ts";
import { parseJsonSafely, sendJson } from "../../utils/http.ts";

const approvalStatuses = ["pending", "approved", "consumed", "denied"] as const;

const TrustedDeviceRequest = z.object({
  device_id: z.string().trim().min(1).max(256).optional(),
  label: z.string().trim().min(1).max(128).nullable().optional(),
  public_jwk: z.record(z.string(), z.unknown()).optional(),
  public_key_jwk: z.record(z.string(), z.unknown()).optional(),
  key_handle: z.string().trim().min(1).max(1024).nullable().optional(),
  envelope_id: z.string().trim().min(1).max(256).nullable().optional(),
});

const ApprovalCreateRequest = z.object({
  new_device_public_jwk: z.record(z.string(), z.unknown()),
  new_device_label: z.string().trim().min(1).max(128).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const ApprovalApproveRequest = z.object({
  approved_device_id: z.string().trim().min(1).max(256),
  encrypted_approval: z.string().refine(isValidBase64Url, "Invalid encrypted_approval"),
  approval_aad: z.string().refine(isValidBase64Url, "Invalid approval_aad").optional(),
});

const ApprovalConsumeRequest = z.object({
  new_device_proof: z.string().trim().min(1).max(4096),
});

export async function getTrustedDevices(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse
) {
  const sub = await requireUserSub(context, request);
  const url = new URL(request.url || "", `http://${request.headers.host}`);
  const devices = await listTrustedDevices(
    context,
    sub,
    url.searchParams.get("include_revoked") === "true"
  );
  sendJson(response, 200, { devices: devices.map(serializeTrustedDevice) });
}

export const postTrustedDevice = withRateLimit("key_management")(
  withAudit({
    eventType: "TRUSTED_DEVICE_CREATE",
    resourceType: "trusted_device",
    extractResourceId: (body) =>
      body && typeof body === "object" && "device_id" in body
        ? (body as { device_id?: string }).device_id
        : undefined,
    skipBodyCapture: true,
  })(async (context, request, response): Promise<void> => {
    const sub = await requireUserSub(context, request);
    const parsed = parseBody(TrustedDeviceRequest, await getCachedBody(request));
    const device = await createTrustedDevice(context, {
      deviceId: parsed.device_id,
      sub,
      label: parsed.label ?? null,
      publicJwk: parsed.public_jwk ?? parsed.public_key_jwk,
      keyHandle: parsed.key_handle ?? null,
      envelopeId: parsed.envelope_id ?? null,
    });
    sendJson(response, 201, { device: serializeTrustedDevice(device) });
  })
);

export const postTrustedDeviceRevoke = withRateLimit("key_management")(
  withAudit({
    eventType: "TRUSTED_DEVICE_REVOKE",
    resourceType: "trusted_device",
    extractResourceId: (_body, params) => params[0],
    skipBodyCapture: true,
  })(async (context, request, response, deviceId): Promise<void> => {
    const sub = await requireUserSub(context, request);
    if (!deviceId) throw new ValidationError("device_id is required");
    const device = await revokeTrustedDevice(context, { sub, deviceId });
    sendJson(response, 200, { device: serializeTrustedDevice(device) });
  })
);

export const postDeviceApprovalRequest = withRateLimit("key_management")(
  withAudit({
    eventType: "DEVICE_APPROVAL_CREATE",
    resourceType: "device_approval",
    skipBodyCapture: true,
  })(async (context, request, response): Promise<void> => {
    const session = await requireSession(context, request, false);
    if (!session.sub) throw new UnauthorizedError("User session required");
    const parsed = parseBody(ApprovalCreateRequest, await getCachedBody(request));
    const approval = await createDeviceApprovalRequest(context, {
      sub: session.sub,
      requesterSessionId: getSessionId(request, false),
      newDevicePublicJwk: parsed.new_device_public_jwk,
      newDeviceLabel: parsed.new_device_label ?? null,
      metadata: parsed.metadata ?? {},
    });
    sendJson(response, 201, { approval: serializeDeviceApproval(approval, true) });
  })
);

export async function getDeviceApprovalRequests(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse
) {
  const sub = await requireUserSub(context, request);
  const url = new URL(request.url || "", `http://${request.headers.host}`);
  const status = url.searchParams.get("status");
  if (status && !approvalStatuses.includes(status as DeviceApprovalStatus)) {
    throw new ValidationError("Invalid approval status");
  }
  const approvals = await listDeviceApprovalRequests(context, sub, {
    status: status ? (status as DeviceApprovalStatus) : undefined,
    includeExpired: url.searchParams.get("include_expired") === "true",
  });
  sendJson(response, 200, {
    approvals: approvals.map((approval) => serializeDeviceApproval(approval, true)),
  });
}

export const postDeviceApprovalApprove = withRateLimit("key_management")(
  withAudit({
    eventType: "DEVICE_APPROVAL_APPROVE",
    resourceType: "device_approval",
    extractResourceId: (_body, params) => params[0],
    skipBodyCapture: true,
  })(async (context, request, response, requestId): Promise<void> => {
    const sub = await requireUserSub(context, request);
    if (!requestId) throw new ValidationError("request_id is required");
    const parsed = parseBody(ApprovalApproveRequest, await getCachedBody(request));
    const approval = await approveDeviceApprovalRequest(context, {
      sub,
      requestId,
      approvedByDeviceId: parsed.approved_device_id,
      encryptedApproval: decodeBase64Url(parsed.encrypted_approval, "encrypted_approval"),
      approvalAad: parsed.approval_aad
        ? decodeBase64Url(parsed.approval_aad, "approval_aad")
        : Buffer.from(`DarkAuth|device-approval|${sub}|${requestId}`),
    });
    sendJson(response, 200, { approval: serializeDeviceApproval(approval, false) });
  })
);

export const postDeviceApprovalConsume = withRateLimit("key_management")(
  withAudit({
    eventType: "DEVICE_APPROVAL_CONSUME",
    resourceType: "device_approval",
    extractResourceId: (_body, params) => params[0],
    skipBodyCapture: true,
  })(async (context, request, response, requestId): Promise<void> => {
    const sub = await requireUserSub(context, request);
    if (!requestId) throw new ValidationError("request_id is required");
    const parsed = parseBody(ApprovalConsumeRequest, await getCachedBody(request));
    const approval = await consumeDeviceApprovalRequest(context, {
      sub,
      requestId,
      newDeviceProof: parsed.new_device_proof,
    });
    sendJson(response, 200, { approval: serializeDeviceApproval(approval, false) });
  })
);

export const postDeviceApprovalDeny = withRateLimit("key_management")(
  withAudit({
    eventType: "DEVICE_APPROVAL_DENY",
    resourceType: "device_approval",
    extractResourceId: (_body, params) => params[0],
    skipBodyCapture: true,
  })(async (context, request, response, requestId): Promise<void> => {
    const sub = await requireUserSub(context, request);
    if (!requestId) throw new ValidationError("request_id is required");
    const approval = await denyDeviceApprovalRequest(context, { sub, requestId });
    sendJson(response, 200, { approval: serializeDeviceApproval(approval, true) });
  })
);

export const getTrustedDevicesSchema = {
  method: "GET",
  path: "/crypto/devices",
  tags: ["Crypto"],
  summary: "trustedDevices",
  responses: { 200: { description: "OK" }, ...genericErrors },
} as const satisfies ControllerSchema;

export const postTrustedDeviceSchema = {
  method: "POST",
  path: "/crypto/devices",
  tags: ["Crypto"],
  summary: "createTrustedDevice",
  responses: { 201: { description: "Created" }, ...genericErrors },
} as const satisfies ControllerSchema;

export const postTrustedDeviceRevokeSchema = {
  method: "POST",
  path: "/crypto/devices/{device_id}/revoke",
  tags: ["Crypto"],
  summary: "revokeTrustedDevice",
  responses: { 200: { description: "OK" }, ...genericErrors },
} as const satisfies ControllerSchema;

export const postDeviceApprovalRequestSchema = {
  method: "POST",
  path: "/crypto/device-approvals",
  tags: ["Crypto"],
  summary: "createDeviceApproval",
  responses: { 201: { description: "Created" }, ...genericErrors },
} as const satisfies ControllerSchema;

export const getDeviceApprovalRequestsSchema = {
  method: "GET",
  path: "/crypto/device-approvals",
  tags: ["Crypto"],
  summary: "deviceApprovals",
  responses: { 200: { description: "OK" }, ...genericErrors },
} as const satisfies ControllerSchema;

export const postDeviceApprovalApproveSchema = {
  method: "POST",
  path: "/crypto/device-approvals/{request_id}/approve",
  tags: ["Crypto"],
  summary: "approveDeviceApproval",
  responses: { 200: { description: "OK" }, ...genericErrors },
} as const satisfies ControllerSchema;

export const postDeviceApprovalConsumeSchema = {
  method: "POST",
  path: "/crypto/device-approvals/{request_id}/consume",
  tags: ["Crypto"],
  summary: "consumeDeviceApproval",
  responses: { 200: { description: "OK" }, ...genericErrors },
} as const satisfies ControllerSchema;

export const postDeviceApprovalDenySchema = {
  method: "POST",
  path: "/crypto/device-approvals/{request_id}/deny",
  tags: ["Crypto"],
  summary: "denyDeviceApproval",
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

function serializeTrustedDevice(row: {
  deviceId: string;
  sub: string;
  label: string | null;
  publicJwk: unknown;
  keyHandle: string | null;
  envelopeId: string | null;
  createdAt: Date;
  lastSeenAt: Date | null;
  revokedAt: Date | null;
}) {
  return {
    device_id: row.deviceId,
    sub: row.sub,
    label: row.label,
    public_jwk: row.publicJwk,
    key_handle: row.keyHandle,
    envelope_id: row.envelopeId,
    created_at: row.createdAt,
    last_seen_at: row.lastSeenAt,
    revoked_at: row.revokedAt,
  };
}

function serializeDeviceApproval(
  row: {
    requestId: string;
    sub: string;
    requesterSessionId: string | null;
    newDevicePublicJwk: unknown;
    newDeviceLabel: string | null;
    verificationCode: string;
    status: string;
    approvedByDeviceId: string | null;
    encryptedApproval: Buffer | null;
    approvalAad: Buffer | null;
    metadata: unknown;
    createdAt: Date;
    expiresAt: Date;
    approvedAt: Date | null;
    consumedAt: Date | null;
    deniedAt: Date | null;
  },
  includePendingFields: boolean
) {
  return {
    request_id: row.requestId,
    sub: row.sub,
    requester_session_id: row.requesterSessionId,
    new_device_public_jwk: includePendingFields ? row.newDevicePublicJwk : undefined,
    new_device_label: row.newDeviceLabel,
    verification_code: row.verificationCode,
    status: row.status,
    approved_by_device_id: row.approvedByDeviceId,
    encrypted_approval: row.encryptedApproval ? toBase64Url(row.encryptedApproval) : null,
    approval_aad: row.approvalAad ? toBase64Url(row.approvalAad) : null,
    metadata: row.metadata,
    created_at: row.createdAt,
    expires_at: row.expiresAt,
    approved_at: row.approvedAt,
    consumed_at: row.consumedAt,
    denied_at: row.deniedAt,
  };
}

function decodeBase64Url(value: string, name: string): Buffer {
  const decoded = fromBase64Url(value);
  if (decoded.length === 0 || decoded.length > 1024 * 1024 || toBase64Url(decoded) !== value) {
    throw new ValidationError(`Invalid ${name}`);
  }
  return decoded;
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
