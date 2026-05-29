const unlockedArks = new Map<string, Uint8Array>();

export function saveUnlockedArk(sub: string, ark: Uint8Array): void {
  unlockedArks.set(sub, new Uint8Array(ark));
}

export function loadUnlockedArk(sub: string): Uint8Array | null {
  const ark = unlockedArks.get(sub);
  return ark ? new Uint8Array(ark) : null;
}

export function clearUnlockedArk(sub: string): void {
  const ark = unlockedArks.get(sub);
  if (ark) ark.fill(0);
  unlockedArks.delete(sub);
}

export function clearAllUnlockedArks(): void {
  for (const ark of unlockedArks.values()) {
    ark.fill(0);
  }
  unlockedArks.clear();
}
