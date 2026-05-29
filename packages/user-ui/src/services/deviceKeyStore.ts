const databaseName = "darkauth-device-keys";
const storeName = "device_keys";

class DeviceKeyStore {
  async createKeyHandle(sub: string): Promise<{ handle: string; key: CryptoKey }> {
    const handle = `dk_${crypto.randomUUID()}`;
    const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, [
      "encrypt",
      "decrypt",
    ]);
    const db = await this.open();
    await this.put(db, {
      handle,
      sub,
      key,
      created_at: new Date().toISOString(),
    });
    db.close();
    return { handle, key };
  }

  async getKey(handle: string): Promise<CryptoKey | null> {
    const db = await this.open();
    const value = await new Promise<{ key?: CryptoKey } | undefined>((resolve, reject) => {
      const tx = db.transaction(storeName, "readonly");
      const request = tx.objectStore(storeName).get(handle);
      request.onsuccess = () => resolve(request.result as { key?: CryptoKey } | undefined);
      request.onerror = () => reject(request.error ?? new Error("Failed to load device key"));
    });
    db.close();
    return value?.key ?? null;
  }

  async deleteKey(handle: string): Promise<void> {
    const db = await this.open();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(storeName, "readwrite");
      tx.objectStore(storeName).delete(handle);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Failed to delete device key"));
    });
    db.close();
  }

  private async open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(databaseName, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName, { keyPath: "handle" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Failed to open device key store"));
    });
  }

  private async put(db: IDBDatabase, value: unknown): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(storeName, "readwrite");
      tx.objectStore(storeName).put(value);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Failed to store device key"));
    });
  }
}

export const deviceKeyStore = new DeviceKeyStore();
export default deviceKeyStore;
