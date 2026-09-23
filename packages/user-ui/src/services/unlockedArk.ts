import { clearAllSessionArks, restoreSessionArk, storeSessionArk } from "./sessionUnlock";

const unlockedArks = new Map<string, Uint8Array>();

export async function saveUnlockedArk(sub: string, ark: Uint8Array): Promise<void> {
  unlockedArks.set(sub, new Uint8Array(ark));
  await storeSessionArk(sub, ark);
}

export function loadUnlockedArk(sub: string): Uint8Array | null {
  const ark = unlockedArks.get(sub);
  return ark ? new Uint8Array(ark) : null;
}

export async function getUnlockedArk(sub: string): Promise<Uint8Array | null> {
  const existing = loadUnlockedArk(sub);
  if (existing) return existing;
  const restored = await restoreSessionArk(sub);
  if (!restored) return null;
  unlockedArks.set(sub, new Uint8Array(restored));
  return restored;
}

export function clearAllUnlockedArks(exceptSub?: string): void {
  for (const [sub, ark] of unlockedArks) {
    if (sub === exceptSub) continue;
    ark.fill(0);
    unlockedArks.delete(sub);
  }
  clearAllSessionArks(exceptSub);
}
