export interface ClientScopeDefinition {
  key: string;
  description?: string;
}

function normalizeEntry(input: unknown): ClientScopeDefinition | null {
  if (typeof input === "string") {
    const raw = input.trim();
    if (!raw) return null;
    if (raw.startsWith("{")) {
      try {
        const parsed = JSON.parse(raw) as { key?: unknown; description?: unknown };
        if (typeof parsed.key === "string" && parsed.key.trim()) {
          const key = parsed.key.trim();
          const description =
            typeof parsed.description === "string" ? parsed.description.trim() : "";
          return description ? { key, description } : { key };
        }
      } catch {}
    }
    return { key: raw };
  }

  if (input && typeof input === "object") {
    const parsed = input as { key?: unknown; description?: unknown };
    if (typeof parsed.key === "string" && parsed.key.trim()) {
      const key = parsed.key.trim();
      const description = typeof parsed.description === "string" ? parsed.description.trim() : "";
      return description ? { key, description } : { key };
    }
  }

  return null;
}

export function parseClientScopeDefinitions(scopes: unknown): ClientScopeDefinition[] {
  if (!Array.isArray(scopes)) return [];
  const seen = new Set<string>();
  const normalized: ClientScopeDefinition[] = [];
  for (const item of scopes) {
    const entry = normalizeEntry(item);
    if (!entry || seen.has(entry.key)) continue;
    seen.add(entry.key);
    normalized.push(entry);
  }
  return normalized;
}

export function serializeClientScopeDefinitions(scopes: unknown): string[] {
  const normalized = parseClientScopeDefinitions(scopes);
  return normalized.map((entry) =>
    entry.description
      ? JSON.stringify({ key: entry.key, description: entry.description })
      : entry.key
  );
}

export function resolveClientScopeKeys(scopes: unknown): string[] {
  return parseClientScopeDefinitions(scopes).map((entry) => entry.key);
}

export function resolveClientScopeDescriptions(
  scopes: unknown,
  requestedScopes: string[]
): Record<string, string> {
  const requested = new Set(requestedScopes);
  const result: Record<string, string> = {};
  for (const entry of parseClientScopeDefinitions(scopes)) {
    if (!requested.has(entry.key)) continue;
    if (!entry.description) continue;
    result[entry.key] = entry.description;
  }
  return result;
}
