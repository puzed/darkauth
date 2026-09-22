const databaseName = "darkauth-device-keys";
const storeName = "device_keys";

function storageError(error: unknown): Error {
  const name = error && typeof error === "object" && "name" in error ? String(error.name) : "";
  if (name === "QuotaExceededError") {
    return new Error(
      "This browser is out of storage for trusted-browser keys. Free up site storage and try again."
    );
  }
  return new Error(
    "This browser blocks the storage trusted-browser keys need, for example in private browsing. Allow site data for DarkAuth or use another unlock method."
  );
}

class DeviceKeyStore {
  async createKeyHandle(sub: string): Promise<{
    handle: string;
    key: CryptoKey;
    approvalPrivateKey: CryptoKey;
    approvalPublicJwk: JsonWebKey;
  }> {
    const handle = `dk_${crypto.randomUUID()}`;
    const [key, approvalKeyPair] = await Promise.all([
      crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]),
      crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]),
    ]);
    const approvalPublicJwk = await crypto.subtle.exportKey("jwk", approvalKeyPair.publicKey);
    await this.run("readwrite", (store) =>
      store.put({
        handle,
        sub,
        key,
        approvalPrivateKey: approvalKeyPair.privateKey,
        approvalPublicJwk,
        created_at: new Date().toISOString(),
      })
    );
    return { handle, key, approvalPrivateKey: approvalKeyPair.privateKey, approvalPublicJwk };
  }

  async getKey(handle: string): Promise<CryptoKey | null> {
    const value = await this.run<{ key?: CryptoKey } | undefined>("readonly", (store) =>
      store.get(handle)
    );
    return value?.key ?? null;
  }

  async getApprovalPrivateKey(handle: string): Promise<CryptoKey | null> {
    const value = await this.run<{ approvalPrivateKey?: CryptoKey } | undefined>(
      "readonly",
      (store) => store.get(handle)
    );
    return value?.approvalPrivateKey ?? null;
  }

  async deleteKey(handle: string): Promise<void> {
    await this.run("readwrite", (store) => store.delete(handle));
  }

  private async run<T>(
    mode: IDBTransactionMode,
    action: (store: IDBObjectStore) => IDBRequest
  ): Promise<T> {
    let db: IDBDatabase | null = null;
    try {
      db = await this.open();
      const tx = db.transaction(storeName, mode);
      const request = action(tx.objectStore(storeName));
      return await new Promise<T>((resolve, reject) => {
        tx.oncomplete = () => resolve(request.result as T);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    } catch (error) {
      throw storageError(error);
    } finally {
      db?.close();
    }
  }

  private open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(databaseName, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName, { keyPath: "handle" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
}

export const deviceKeyStore = new DeviceKeyStore();
export default deviceKeyStore;
