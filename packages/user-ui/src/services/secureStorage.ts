class SecureStorageService {
  private exportKeys = new Map<string, Uint8Array>();

  async saveExportKey(sub: string, key: Uint8Array): Promise<void> {
    this.exportKeys.set(sub, new Uint8Array(key));
  }

  async loadExportKey(sub: string): Promise<Uint8Array | null> {
    const key = this.exportKeys.get(sub);
    return key ? new Uint8Array(key) : null;
  }

  clearExportKey(sub: string): void {
    this.exportKeys.delete(sub);
  }

  clearAllExportKeys(): void {
    this.exportKeys.clear();
  }

  getSecurityStatus(): {
    sessionId: string;
    keyRotationCount: number;
    hasKeys: boolean;
    lastAccess: number | null;
    suspiciousActivity: boolean;
  } {
    return {
      sessionId: "memory",
      keyRotationCount: 0,
      hasKeys: this.exportKeys.size > 0,
      lastAccess: null,
      suspiciousActivity: false,
    };
  }
}

export const secureStorageService = new SecureStorageService();
export default secureStorageService;
