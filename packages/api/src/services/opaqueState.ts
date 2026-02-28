import { eq } from "drizzle-orm";
import type { AKEExportKeyPair } from "opaque-ts";
import { settings } from "../db/schema.ts";
import type { Context } from "../types.ts";

const STATE_KEY_PLAINTEXT = "opaque_server_state";
const STATE_KEY_ENCRYPTED = "opaque_server_state_enc";

type PersistedState = {
  oprfSeed: number[];
  serverKeypair: AKEExportKeyPair;
  serverIdentity?: string;
};

export async function loadOpaqueServerState(context: Context): Promise<PersistedState | null> {
  const enc = await context.db.query.settings.findFirst({
    where: eq(settings.key, STATE_KEY_ENCRYPTED),
  });
  if (enc?.value && context.services.kek?.isAvailable()) {
    const kek = context.services.kek;
    if (!kek) return null;
    try {
      const raw: unknown = enc.value;
      if (!raw || typeof raw !== "object" || !("data" in raw)) return null;
      const dataField = (raw as { data?: unknown }).data;
      if (typeof dataField !== "string" || dataField.length === 0) return null;
      const buf = Buffer.from(dataField, "base64");
      const decrypted = await kek.decrypt(buf);
      const parsed = JSON.parse(decrypted.toString()) as PersistedState;
      if (
        Array.isArray(parsed?.oprfSeed) &&
        parsed?.serverKeypair?.private_key &&
        parsed?.serverKeypair?.public_key
      ) {
        return parsed;
      }
    } catch {
      return null;
    }
  }

  const plain = await context.db.query.settings.findFirst({
    where: eq(settings.key, STATE_KEY_PLAINTEXT),
  });
  if (plain?.value) {
    const parsed = plain.value as PersistedState;
    if (
      Array.isArray(parsed?.oprfSeed) &&
      parsed?.serverKeypair?.private_key &&
      parsed?.serverKeypair?.public_key
    ) {
      return parsed;
    }
  }
  return null;
}

export async function saveOpaqueServerState(
  context: Context,
  state: PersistedState
): Promise<void> {
  if (context.services.kek?.isAvailable()) {
    const json = JSON.stringify(state);
    const enc = await context.services.kek.encrypt(Buffer.from(json));
    await context.db
      .insert(settings)
      .values({
        key: STATE_KEY_ENCRYPTED,
        value: { data: enc.toString("base64") },
        secure: true,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: settings.key,
        set: {
          value: { data: enc.toString("base64") },
          secure: true,
          updatedAt: new Date(),
        },
      });
    // Remove plaintext if present
    await context.db.delete(settings).where(eq(settings.key, STATE_KEY_PLAINTEXT));
    return;
  }

  await context.db
    .insert(settings)
    .values({
      key: STATE_KEY_PLAINTEXT,
      value: state,
      secure: false,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: state, secure: false, updatedAt: new Date() },
    });
}
