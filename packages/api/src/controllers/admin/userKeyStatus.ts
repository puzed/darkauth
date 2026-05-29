import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { ForbiddenError } from "../../errors.ts";
import { genericErrors } from "../../http/openapi-helpers.ts";
import { listAccountKeys, listKeyEnvelopes, revokeKeyEnvelope } from "../../models/keybag.ts";
import { listTrustedDevices, revokeTrustedDevice } from "../../models/trustedDevices.ts";
import { requireSession } from "../../services/sessions.ts";
import type { Context, ControllerSchema } from "../../types.ts";
import { withAudit } from "../../utils/auditWrapper.ts";
import { sendJsonValidated } from "../../utils/http.ts";

const AccountKeySchema = z.object({
  keyId: z.string(),
  version: z.string(),
  status: z.string(),
  createdAt: z.date().or(z.string()),
  rotatedAt: z.date().or(z.string()).nullable().optional(),
});

const KeyEnvelopeSchema = z.object({
  envelopeId: z.string(),
  keyId: z.string(),
  type: z.string(),
  label: z.string().nullable().optional(),
  version: z.string(),
  wrappingAlg: z.string(),
  createdAt: z.date().or(z.string()),
  lastUsedAt: z.date().or(z.string()).nullable().optional(),
  revokedAt: z.date().or(z.string()).nullable().optional(),
});

const TrustedDeviceSchema = z.object({
  deviceId: z.string(),
  name: z.string().nullable().optional(),
  envelopeId: z.string().nullable().optional(),
  createdAt: z.date().or(z.string()),
  lastUsedAt: z.date().or(z.string()).nullable().optional(),
  revokedAt: z.date().or(z.string()).nullable().optional(),
});

const KeyStatusSchema = z.object({
  keyState: z.enum(["none", "locked", "unlocked", "setup_required", "recovery_required"]),
  accountKeys: z.array(AccountKeySchema),
  envelopes: z.array(KeyEnvelopeSchema),
  trustedDevices: z.array(TrustedDeviceSchema),
});

const SuccessSchema = z.object({ success: z.boolean() });

export async function getUserKeyStatus(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  userSub: string
) {
  const session = await requireSession(context, request, true);
  if (!session.adminRole) throw new ForbiddenError("Admin access required");
  const [accountKeys, envelopes, trustedDevices] = await Promise.all([
    listAccountKeys(context, userSub),
    listKeyEnvelopes(context, userSub, { includeRevoked: true }),
    listTrustedDevices(context, userSub, true),
  ]);
  const activeAccountKeys = accountKeys.filter((key) => key.status === "active");
  const activeEnvelopes = envelopes.filter((envelope) => !envelope.revokedAt);
  const keyState =
    activeAccountKeys.length === 0
      ? "none"
      : activeEnvelopes.length === 0
        ? "setup_required"
        : "locked";
  sendJsonValidated(
    response,
    200,
    {
      keyState,
      accountKeys: accountKeys.map((key) => ({
        keyId: key.keyId,
        version: key.version,
        status: key.status,
        createdAt: key.createdAt,
        rotatedAt: key.rotatedAt,
      })),
      envelopes: envelopes.map((envelope) => ({
        envelopeId: envelope.envelopeId,
        keyId: envelope.keyId,
        type: envelope.type,
        label: envelope.label,
        version: envelopeVersion(envelope.metadata),
        wrappingAlg: envelope.wrappingAlg,
        createdAt: envelope.createdAt,
        lastUsedAt: envelope.lastUsedAt,
        revokedAt: envelope.revokedAt,
      })),
      trustedDevices: trustedDevices.map((device) => ({
        deviceId: device.deviceId,
        name: device.label,
        envelopeId: device.envelopeId,
        createdAt: device.createdAt,
        lastUsedAt: device.lastSeenAt,
        revokedAt: device.revokedAt,
      })),
    },
    KeyStatusSchema
  );
}

export const deleteUserKeyEnvelope = withAudit({
  eventType: "ADMIN_USER_KEY_ENVELOPE_REVOKE",
  resourceType: "key_envelope",
  extractResourceId: (_body, params) => params[1],
  skipBodyCapture: true,
})(async function deleteUserKeyEnvelope(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  userSub: string,
  envelopeId: string
) {
  const session = await requireSession(context, request, true);
  if (session.adminRole !== "write") throw new ForbiddenError("Write access required");
  await revokeKeyEnvelope(context, envelopeId, userSub);
  sendJsonValidated(response, 200, { success: true }, SuccessSchema);
});

export const deleteUserTrustedDevice = withAudit({
  eventType: "ADMIN_USER_TRUSTED_DEVICE_REVOKE",
  resourceType: "trusted_device",
  extractResourceId: (_body, params) => params[1],
  skipBodyCapture: true,
})(async function deleteUserTrustedDevice(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  userSub: string,
  deviceId: string
) {
  const session = await requireSession(context, request, true);
  if (session.adminRole !== "write") throw new ForbiddenError("Write access required");
  await revokeTrustedDevice(context, { sub: userSub, deviceId });
  sendJsonValidated(response, 200, { success: true }, SuccessSchema);
});

export const getUserKeyStatusSchema = {
  method: "GET",
  path: "/admin/users/{userSub}/key-status",
  tags: ["Users"],
  summary: "Get user key status",
  params: z.object({ userSub: z.string() }),
  responses: {
    200: { description: "OK", content: { "application/json": { schema: KeyStatusSchema } } },
    ...genericErrors,
  },
} as const satisfies ControllerSchema;

function envelopeVersion(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return "v2";
  const values = metadata as Record<string, unknown>;
  return typeof values.version === "string"
    ? values.version
    : typeof values.key_version === "string"
      ? values.key_version
      : "v2";
}

export const deleteUserKeyEnvelopeSchema = {
  method: "DELETE",
  path: "/admin/users/{userSub}/key-envelopes/{envelopeId}",
  tags: ["Users"],
  summary: "Revoke a user key envelope",
  params: z.object({ userSub: z.string(), envelopeId: z.string() }),
  responses: {
    200: { description: "OK", content: { "application/json": { schema: SuccessSchema } } },
    ...genericErrors,
  },
} as const satisfies ControllerSchema;

export const deleteUserTrustedDeviceSchema = {
  method: "DELETE",
  path: "/admin/users/{userSub}/trusted-devices/{deviceId}",
  tags: ["Users"],
  summary: "Revoke a user trusted device",
  params: z.object({ userSub: z.string(), deviceId: z.string() }),
  responses: {
    200: { description: "OK", content: { "application/json": { schema: SuccessSchema } } },
    ...genericErrors,
  },
} as const satisfies ControllerSchema;
