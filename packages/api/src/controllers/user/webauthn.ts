import type { IncomingMessage, ServerResponse } from "node:http";
import {
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
  type RegistrationResponseJSON,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import { z } from "zod/v4";
import { UnauthorizedError, ValidationError } from "../../errors.ts";
import { genericErrors } from "../../http/openapi-helpers.ts";
import { withRateLimit } from "../../middleware/rateLimit.ts";
import { getUserBySub } from "../../models/users.ts";
import {
  createPasskeyPrfEnvelope,
  createWebAuthnChallenge,
  createWebAuthnCredential,
  credentialCanUnlockWithPrf,
  getPasskeyPrfUnlockMaterial,
  getWebAuthnChallenge,
  getWebAuthnCredential,
  listPasskeyPrfUnlockCandidates,
  listWebAuthnCredentials,
  updateWebAuthnCredentialUsage,
} from "../../models/webauthn.ts";
import {
  createSession,
  getRefreshTokenTtlSeconds,
  getSessionTtlSeconds,
  issueRefreshTokenCookie,
  issueSessionCookies,
  requireSession,
} from "../../services/sessions.ts";
import type { Context, ControllerSchema } from "../../types.ts";
import { withAudit } from "../../utils/auditWrapper.ts";
import {
  fromBase64Url,
  generateRandomBytes,
  generateRandomString,
  toBase64Url,
} from "../../utils/crypto.ts";
import { parseJsonSafely, readBody, sendJson } from "../../utils/http.ts";

const PrfEnvelopeRequest = z.object({
  credential_id: z.string().trim().min(1).max(2048),
  key_id: z.string().trim().min(1).max(256),
  envelope_id: z.string().trim().min(1).max(256).optional(),
  label: z.string().trim().min(1).max(128).nullable().optional(),
  wrapping_alg: z.string().trim().min(1).max(128),
  wrapped_key: z.string().refine(isValidBase64Url, "Invalid wrapped_key"),
  aad: z.string().refine(isValidBase64Url, "Invalid aad"),
  prf_salt: z.string().refine(isValidBase64Url, "Invalid prf_salt"),
  prf_result_confirmed: z.literal(true),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const WebAuthnRegisterFinishRequest = z.object({
  challenge_id: z.string().trim().min(1).max(256),
  response: z.custom<RegistrationResponseJSON>((value) =>
    Boolean(value && typeof value === "object")
  ),
  label: z.string().trim().min(1).max(128).nullable().optional(),
});

const WebAuthnLoginFinishRequest = z.object({
  challenge_id: z.string().trim().min(1).max(256),
  response: z.custom<AuthenticationResponseJSON>((value) =>
    Boolean(value && typeof value === "object")
  ),
  prf_result_confirmed: z.boolean().optional(),
});

export const postWebAuthnRegisterStart = withRateLimit("webauthn")(
  async function postWebAuthnRegisterStart(
    context: Context,
    request: IncomingMessage,
    response: ServerResponse
  ) {
    const session = await requireSession(context, request, false);
    if (!session.sub) throw new UnauthorizedError("User session required");
    const credentials = await listWebAuthnCredentials(context, session.sub);
    const prfSalt = generateRandomBytes(32);
    const challenge = await createWebAuthnChallenge(context, {
      type: "registration",
      sub: session.sub,
      metadata: { prf_salt: toBase64Url(prfSalt) },
    });

    sendJson(response, 200, {
      challenge_id: challenge.challengeId,
      public_key: {
        challenge: challenge.challenge,
        rp: {
          id: context.config.rpId,
          name: "DarkAuth",
        },
        user: {
          id: toBase64Url(Buffer.from(session.sub)),
          name: String(session.email || session.sub),
          displayName: String(session.name || session.email || session.sub),
        },
        pubKeyCredParams: [
          { type: "public-key", alg: -7 },
          { type: "public-key", alg: -257 },
        ],
        timeout: 300000,
        attestation: "none",
        authenticatorSelection: {
          residentKey: "preferred",
          userVerification: "preferred",
        },
        excludeCredentials: credentials.map((credential) => ({
          type: "public-key",
          id: credential.credentialId,
          transports: credential.transports,
        })),
        extensions: {
          prf: {
            eval: {
              first: toBase64Url(prfSalt),
            },
          },
        },
      },
    });
  }
);

export const postWebAuthnRegisterFinish = withRateLimit("webauthn")(
  async function postWebAuthnRegisterFinish(
    context: Context,
    request: IncomingMessage,
    response: ServerResponse
  ) {
    const session = await requireSession(context, request, false);
    if (!session.sub) throw new UnauthorizedError("User session required");
    const parsed = parseBody(WebAuthnRegisterFinishRequest, await readBody(request));
    const challenge = await getWebAuthnChallenge(context, parsed.challenge_id);
    if (challenge.type !== "registration" || challenge.sub !== session.sub) {
      throw new ValidationError("Invalid WebAuthn challenge");
    }
    const verifier =
      context.services.webauthn?.verifyRegistrationResponse ?? verifyRegistrationResponse;
    const verification = await verifier({
      response: parsed.response,
      expectedChallenge: challenge.challenge,
      expectedOrigin: expectedOrigin(context),
      expectedRPID: context.config.rpId,
      requireUserVerification: false,
    });
    await consumeRegistrationChallenge(context, challenge.challenge);
    if (!verification.verified) throw new ValidationError("WebAuthn registration failed");
    const info = verification.registrationInfo;
    const clientPrf = parsed.response.clientExtensionResults as { prf?: { enabled?: boolean } };
    const credential = await createWebAuthnCredential(context, {
      credentialId: info.credential.id,
      sub: session.sub,
      publicKey: Buffer.from(info.credential.publicKey),
      label: parsed.label ?? null,
      signCount: info.credential.counter,
      transports: parsed.response.response.transports ?? info.credential.transports ?? [],
      aaguid: info.aaguid,
      backupEligible: info.credentialDeviceType === "multiDevice",
      backupState: info.credentialBackedUp,
      userVerified: info.userVerified,
      prfSupported: clientPrf.prf?.enabled === true,
    });
    sendJson(response, 201, { credential: serializePasskeyCredential(credential) });
  }
);

export const postWebAuthnLoginStart = withRateLimit("webauthn")(
  async function postWebAuthnLoginStart(
    context: Context,
    _request: IncomingMessage,
    response: ServerResponse
  ) {
    const prfSalt = generateRandomBytes(32);
    const candidates = await listPasskeyPrfUnlockCandidates(context);
    const evalByCredential = Object.fromEntries(
      candidates
        .filter((candidate) => candidate.credential.prfSalt)
        .map((candidate) => [
          candidate.credential.credentialId,
          { first: toBase64Url(candidate.credential.prfSalt || Buffer.alloc(0)) },
        ])
    );
    const challenge = await createWebAuthnChallenge(context, {
      type: "login",
      metadata: { prf_salt: toBase64Url(prfSalt) },
    });

    sendJson(response, 200, {
      challenge_id: challenge.challengeId,
      public_key: {
        challenge: challenge.challenge,
        rpId: context.config.rpId,
        timeout: 300000,
        userVerification: "preferred",
        allowCredentials: [],
        extensions: {
          prf:
            candidates.length > 0
              ? {
                  eval: { first: toBase64Url(prfSalt) },
                  evalByCredential,
                }
              : {
                  eval: { first: toBase64Url(prfSalt) },
                },
        },
      },
    });
  }
);

export const postWebAuthnLoginFinish = withRateLimit("webauthn")(
  async function postWebAuthnLoginFinish(
    context: Context,
    request: IncomingMessage,
    response: ServerResponse
  ) {
    const parsed = parseBody(WebAuthnLoginFinishRequest, await readBody(request));
    const credential = await getWebAuthnCredential(context, parsed.response.id);
    if (credential.revokedAt) throw new UnauthorizedError("Credential revoked");
    const challenge = await getWebAuthnChallenge(context, parsed.challenge_id);
    if (challenge.type !== "login") throw new ValidationError("Invalid WebAuthn challenge");
    const verifier =
      context.services.webauthn?.verifyAuthenticationResponse ?? verifyAuthenticationResponse;
    const verification = await verifier({
      response: parsed.response,
      expectedChallenge: challenge.challenge,
      expectedOrigin: expectedOrigin(context),
      expectedRPID: context.config.rpId,
      credential: {
        id: credential.credentialId,
        publicKey: new Uint8Array(credential.publicKey || Buffer.alloc(0)),
        counter: credential.signCount,
        transports: credential.transports as AuthenticatorTransportFuture[],
      },
      requireUserVerification: false,
    });
    await consumeLoginChallenge(context, challenge.challenge);
    if (!verification.verified) throw new UnauthorizedError("WebAuthn authentication failed");
    const user = await getUserBySub(context, credential.sub);
    if (!user) throw new UnauthorizedError("User not found");
    const { getUserOrganizations } = await import("../../models/rbac.ts");
    const activeMemberships = (await getUserOrganizations(context, user.sub)).filter(
      (membership) => membership.status === "active"
    );
    if (activeMemberships.length === 0) throw new UnauthorizedError("Authentication not permitted");
    const sessionOrganization =
      activeMemberships.length === 1
        ? {
            organizationId: activeMemberships[0]?.organizationId,
            organizationSlug: activeMemberships[0]?.slug,
          }
        : {};
    const { sessionId, refreshToken } = await createSession(context, "user", {
      sub: user.sub,
      email: user.email || undefined,
      name: user.name || undefined,
      ...sessionOrganization,
      keyState: "locked",
      otpRequired: activeMemberships.some((membership) => membership.forceOtp),
      otpVerified: false,
    });
    const ttlSeconds = await getSessionTtlSeconds(context, "user");
    const refreshTtlSeconds = await getRefreshTokenTtlSeconds(context, "user");
    issueSessionCookies(response, sessionId, ttlSeconds, false);
    issueRefreshTokenCookie(response, refreshToken, refreshTtlSeconds, false);
    const updatedCredential = await updateWebAuthnCredentialUsage(context, {
      credentialId: credential.credentialId,
      sub: credential.sub,
      signCount: verification.authenticationInfo.newCounter,
    });
    const canUnlock = credentialCanUnlockWithPrf(updatedCredential);
    const unlock =
      canUnlock && parsed.prf_result_confirmed
        ? await getPasskeyPrfUnlockMaterial(context, {
            credentialId: credential.credentialId,
            sub: credential.sub,
          })
        : null;
    sendJson(response, 200, {
      sub: user.sub,
      key_state: unlock ? "unlocked" : "locked",
      credential: serializePasskeyCredential(updatedCredential),
      unlock: unlock
        ? {
            prf_salt: toBase64Url(asBuffer(unlock.credential.prfSalt)),
            envelope: serializeKeyEnvelope(unlock.envelope),
          }
        : null,
    });
  }
);

export const postPasskeyPrfEnvelope = withAudit({
  eventType: "PASSKEY_PRF_ENVELOPE_CREATE",
  resourceType: "key_envelope",
  extractResourceId: (body) =>
    body && typeof body === "object" && "envelope_id" in body
      ? (body as { envelope_id?: string }).envelope_id
      : undefined,
  skipBodyCapture: true,
})(
  withRateLimit("webauthn")(async (context, request, response): Promise<void> => {
    const session = await requireSession(context, request, false);
    if (!session.sub) throw new UnauthorizedError("User session required");
    const parsed = parseBody(PrfEnvelopeRequest, await readBody(request));
    const envelope = await createPasskeyPrfEnvelope(context, {
      credentialId: parsed.credential_id,
      sub: session.sub,
      keyId: parsed.key_id,
      envelopeId: parsed.envelope_id ?? `env_${generateRandomString(24)}`,
      label: parsed.label ?? null,
      wrappingAlg: parsed.wrapping_alg,
      wrappedKey: decodeBase64Url(parsed.wrapped_key, "wrapped_key"),
      aad: decodeBase64Url(parsed.aad, "aad"),
      prfSalt: decodeBase64Url(parsed.prf_salt, "prf_salt"),
      prfResultConfirmed: parsed.prf_result_confirmed,
      metadata: parsed.metadata ?? {},
    });

    sendJson(response, 201, {
      envelope: {
        envelope_id: envelope.envelopeId,
        key_id: envelope.keyId,
        sub: envelope.sub,
        type: envelope.type,
        label: envelope.label,
        wrapping_alg: envelope.wrappingAlg,
        wrapped_key: toBase64Url(envelope.wrappedKey || Buffer.alloc(0)),
        aad: toBase64Url(envelope.aad || Buffer.alloc(0)),
        metadata: envelope.metadata,
        created_at: envelope.createdAt,
        last_used_at: envelope.lastUsedAt,
        revoked_at: envelope.revokedAt,
      },
    });
  })
);

export function serializePasskeyCredential(row: {
  credentialId: string;
  sub: string;
  label: string | null;
  transports: string[];
  backupEligible: boolean;
  backupState: boolean;
  userVerified: boolean;
  prfSupported: boolean;
  prfEnvelopeId: string | null;
  createdAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
}) {
  return {
    credential_id: row.credentialId,
    sub: row.sub,
    label: row.label,
    transports: row.transports,
    backup_eligible: row.backupEligible,
    backup_state: row.backupState,
    user_verified: row.userVerified,
    prf_supported: row.prfSupported,
    can_unlock: credentialCanUnlockWithPrf(row),
    prf_envelope_id: row.prfEnvelopeId,
    created_at: row.createdAt,
    last_used_at: row.lastUsedAt,
    revoked_at: row.revokedAt,
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
  return {
    envelope_id: row.envelopeId,
    key_id: row.keyId,
    sub: row.sub,
    type: row.type,
    label: row.label,
    wrapping_alg: row.wrappingAlg,
    wrapped_key: toBase64Url(asBuffer(row.wrappedKey)),
    aad: toBase64Url(asBuffer(row.aad)),
    metadata: row.metadata,
    created_at: row.createdAt,
    last_used_at: row.lastUsedAt,
    revoked_at: row.revokedAt,
  };
}

function asBuffer(value: Buffer | Uint8Array | null): Buffer {
  return Buffer.from(value || []);
}

export const postWebAuthnRegisterStartSchema = {
  method: "POST",
  path: "/webauthn/register/start",
  tags: ["WebAuthn"],
  summary: "startWebAuthnRegistration",
  responses: { 200: { description: "OK" }, ...genericErrors },
} as const satisfies ControllerSchema;

export const postWebAuthnRegisterFinishSchema = {
  method: "POST",
  path: "/webauthn/register/finish",
  tags: ["WebAuthn"],
  summary: "finishWebAuthnRegistration",
  responses: { 201: { description: "Created" }, ...genericErrors },
} as const satisfies ControllerSchema;

export const postWebAuthnLoginStartSchema = {
  method: "POST",
  path: "/webauthn/login/start",
  tags: ["WebAuthn"],
  summary: "startWebAuthnLogin",
  responses: { 200: { description: "OK" }, ...genericErrors },
} as const satisfies ControllerSchema;

export const postWebAuthnLoginFinishSchema = {
  method: "POST",
  path: "/webauthn/login/finish",
  tags: ["WebAuthn"],
  summary: "finishWebAuthnLogin",
  responses: { 200: { description: "OK" }, ...genericErrors },
} as const satisfies ControllerSchema;

export const postPasskeyPrfEnvelopeSchema = {
  method: "POST",
  path: "/webauthn/prf-envelope",
  tags: ["WebAuthn"],
  summary: "createPasskeyPrfEnvelope",
  responses: { 201: { description: "Created" }, ...genericErrors },
} as const satisfies ControllerSchema;

function parseBody<T>(schema: z.ZodType<T>, body: string): T {
  const parsed = schema.safeParse(parseJsonSafely(body));
  if (!parsed.success) {
    throw new ValidationError("Invalid request format", parsed.error.flatten());
  }
  return parsed.data;
}

async function consumeRegistrationChallenge(context: Context, challenge: string) {
  const { consumeWebAuthnChallenge } = await import("../../models/webauthn.ts");
  await consumeWebAuthnChallenge(context, { challenge, type: "registration" });
}

async function consumeLoginChallenge(context: Context, challenge: string) {
  const { consumeWebAuthnChallenge } = await import("../../models/webauthn.ts");
  await consumeWebAuthnChallenge(context, { challenge, type: "login" });
}

function expectedOrigin(context: Context) {
  if (context.config.issuer) return new URL(context.config.issuer).origin;
  return `https://${context.config.rpId}`;
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
