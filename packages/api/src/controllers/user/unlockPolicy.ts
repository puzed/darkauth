import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { UnauthorizedError } from "../../errors.ts";
import { genericErrors } from "../../http/openapi-helpers.ts";
import { getBooleanSetting, getScimUserPolicyState } from "../../models/scimPolicy.ts";
import { requireSession } from "../../services/sessions.ts";
import type { Context, ControllerSchema } from "../../types.ts";
import { sendJsonValidated } from "../../utils/http.ts";

const UnlockPolicySchema = z.object({
  managed: z.boolean(),
  allow_password_envelopes: z.boolean(),
  allow_passkey_prf_envelopes: z.boolean(),
  allow_trusted_device_approval: z.boolean(),
  allow_recovery_key: z.boolean(),
  allow_new_key_setup: z.boolean(),
  require_key_unlock_for_zk: z.boolean(),
  reason: z.string().nullable(),
});

const ResponseSchema = z.object({ policy: UnlockPolicySchema });

export async function getUnlockPolicy(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse
) {
  const session = await requireSession(context, request, false);
  if (!session.sub) throw new UnauthorizedError("User session required");
  const scimState = await getScimUserPolicyState(context, session.sub);
  const managed = scimState.provisioned;
  const allowPassword = managed
    ? await getBooleanSetting(context, "users.scim.allow_password_envelopes", true)
    : true;
  const allowPasskey = managed
    ? await getBooleanSetting(context, "users.scim.allow_passkey_prf_envelopes", true)
    : true;
  const allowTrustedDevice = managed
    ? await getBooleanSetting(context, "users.scim.allow_trusted_device_approval", true)
    : true;
  const requireKeyUnlock = managed
    ? await getBooleanSetting(context, "users.scim.require_key_unlock_for_zk", true)
    : true;
  sendJsonValidated(
    response,
    200,
    {
      policy: {
        managed,
        allow_password_envelopes: allowPassword,
        allow_passkey_prf_envelopes: allowPasskey,
        allow_trusted_device_approval: allowTrustedDevice,
        allow_recovery_key: true,
        allow_new_key_setup: allowPassword,
        require_key_unlock_for_zk: requireKeyUnlock,
        reason: managed ? "scim" : null,
      },
    },
    ResponseSchema
  );
}

export const schema = {
  method: "GET",
  path: "/crypto/unlock-policy",
  tags: ["Crypto"],
  summary: "unlockPolicy",
  responses: {
    200: {
      description: "OK",
      content: { "application/json": { schema: ResponseSchema } },
    },
    ...genericErrors,
  },
} as const satisfies ControllerSchema;
