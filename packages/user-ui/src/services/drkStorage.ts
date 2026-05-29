const STORAGE_PREFIX = "DarkAuth_drk:";

export function clearDrk(sub: string): void {
  localStorage.removeItem(`${STORAGE_PREFIX}${sub}`);
}

export function clearAllDrk(): void {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(STORAGE_PREFIX)) keys.push(key);
  }
  keys.forEach((key) => {
    localStorage.removeItem(key);
  });
}
