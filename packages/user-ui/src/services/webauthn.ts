import cryptoService, { fromBase64Url, toBase64Url } from "./crypto";

type PublicKeyCredentialWithExtensions = PublicKeyCredential & {
  getClientExtensionResults(): AuthenticationExtensionsClientOutputs & {
    prf?: {
      enabled?: boolean;
      results?: {
        first?: BufferSource;
      };
    };
  };
};

type RegistrationPublicKeyOptions = Omit<
  PublicKeyCredentialCreationOptions,
  "challenge" | "user" | "excludeCredentials" | "extensions"
> & {
  challenge: string;
  user: Omit<PublicKeyCredentialUserEntity, "id"> & { id: string };
  excludeCredentials?: Array<Omit<PublicKeyCredentialDescriptor, "id"> & { id: string }>;
  extensions?: WebAuthnJsonExtensions;
};

type AuthenticationPublicKeyOptions = Omit<
  PublicKeyCredentialRequestOptions,
  "challenge" | "allowCredentials" | "extensions"
> & {
  challenge: string;
  allowCredentials?: Array<Omit<PublicKeyCredentialDescriptor, "id"> & { id: string }>;
  extensions?: WebAuthnJsonExtensions;
};

type WebAuthnJsonExtensions = Omit<AuthenticationExtensionsClientInputs, "prf"> & {
  prf?: {
    eval?: WebAuthnJsonPrfValues;
    evalByCredential?: Record<string, WebAuthnJsonPrfValues>;
  };
};

type WebAuthnJsonPrfValues = {
  first: string | BufferSource;
  second?: string | BufferSource;
};

function decodePrfValue(value: string | BufferSource): BufferSource {
  return typeof value === "string" ? (fromBase64Url(value).buffer as ArrayBuffer) : value;
}

function decodePrfValues(values: WebAuthnJsonPrfValues): AuthenticationExtensionsPRFValues {
  const decoded: AuthenticationExtensionsPRFValues = { first: decodePrfValue(values.first) };
  if (values.second) decoded.second = decodePrfValue(values.second);
  return decoded;
}

export function decodeWebAuthnExtensions(
  extensions: WebAuthnJsonExtensions | undefined
): AuthenticationExtensionsClientInputs | undefined {
  if (!extensions?.prf) return extensions as AuthenticationExtensionsClientInputs | undefined;
  return {
    ...extensions,
    prf: {
      ...extensions.prf,
      eval: extensions.prf.eval ? decodePrfValues(extensions.prf.eval) : undefined,
      evalByCredential: extensions.prf.evalByCredential
        ? Object.fromEntries(
            Object.entries(extensions.prf.evalByCredential).map(([id, values]) => [
              id,
              decodePrfValues(values),
            ])
          )
        : undefined,
    },
  };
}

export function browserSupportsWebAuthn(): boolean {
  return typeof window.PublicKeyCredential !== "undefined" && !!navigator.credentials;
}

export async function createPasskeyCredential(publicKey: RegistrationPublicKeyOptions) {
  const credential = await navigator.credentials.create({
    publicKey: {
      ...publicKey,
      challenge: fromBase64Url(publicKey.challenge),
      user: {
        ...publicKey.user,
        id: fromBase64Url(publicKey.user.id),
      },
      excludeCredentials: publicKey.excludeCredentials?.map((item) => ({
        ...item,
        id: fromBase64Url(item.id),
      })),
      extensions: decodeWebAuthnExtensions(publicKey.extensions),
    } as PublicKeyCredentialCreationOptions,
  });
  if (!(credential instanceof PublicKeyCredential)) {
    throw new Error("Passkey registration was cancelled");
  }
  return credential as PublicKeyCredentialWithExtensions;
}

export async function getPasskeyCredential(publicKey: AuthenticationPublicKeyOptions) {
  const credential = await navigator.credentials.get({
    publicKey: {
      ...publicKey,
      challenge: fromBase64Url(publicKey.challenge),
      allowCredentials: publicKey.allowCredentials?.map((item) => ({
        ...item,
        id: fromBase64Url(item.id),
      })),
      extensions: decodeWebAuthnExtensions(publicKey.extensions),
    } as PublicKeyCredentialRequestOptions,
  });
  if (!(credential instanceof PublicKeyCredential)) {
    throw new Error("Passkey sign-in was cancelled");
  }
  return credential as PublicKeyCredentialWithExtensions;
}

export function serializeRegistrationResponse(credential: PublicKeyCredentialWithExtensions) {
  const response = credential.response as AuthenticatorAttestationResponse;
  return {
    id: credential.id,
    rawId: toBase64Url(credential.rawId),
    type: credential.type,
    response: {
      clientDataJSON: toBase64Url(response.clientDataJSON),
      attestationObject: toBase64Url(response.attestationObject),
      transports: typeof response.getTransports === "function" ? response.getTransports() : [],
    },
    clientExtensionResults: credential.getClientExtensionResults(),
  };
}

export function serializeAuthenticationResponse(credential: PublicKeyCredentialWithExtensions) {
  const response = credential.response as AuthenticatorAssertionResponse;
  return {
    id: credential.id,
    rawId: toBase64Url(credential.rawId),
    type: credential.type,
    response: {
      clientDataJSON: toBase64Url(response.clientDataJSON),
      authenticatorData: toBase64Url(response.authenticatorData),
      signature: toBase64Url(response.signature),
      userHandle: response.userHandle ? toBase64Url(response.userHandle) : null,
    },
    clientExtensionResults: credential.getClientExtensionResults(),
  };
}

export function getPasskeyPrfResult(
  credential: PublicKeyCredentialWithExtensions
): Uint8Array | null {
  const first = credential.getClientExtensionResults().prf?.results?.first;
  if (!first) return null;
  if (first instanceof ArrayBuffer) return new Uint8Array(first);
  return new Uint8Array(first.buffer, first.byteOffset, first.byteLength);
}

export function passkeyPrfEnabled(credential: PublicKeyCredentialWithExtensions): boolean {
  return credential.getClientExtensionResults().prf?.enabled === true;
}

export async function derivePasskeyPrfWrapKey(params: {
  prfResult: Uint8Array;
  sub: string;
  credentialId: string;
}): Promise<Uint8Array> {
  const salt = new Uint8Array(
    await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(
        `DarkAuth|v2|passkey-prf|sub=${params.sub}|credential_id=${params.credentialId}`
      )
    )
  );
  return cryptoService.hkdf(params.prfResult, salt, new TextEncoder().encode("wrap-key"), 32);
}
