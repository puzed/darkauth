export interface ParsedNoteContent {
  title: string;
  content: string;
  tags: string[];
}

function normalizeTag(value: string): string {
  return value.trim().toLowerCase();
}

export function normalizeTags(values: string[]): string[] {
  const unique = new Set<string>();

  for (const value of values) {
    const normalized = normalizeTag(value);
    if (!normalized) {
      continue;
    }
    unique.add(normalized);
  }

  return [...unique];
}

export function parseDecryptedNoteContent(decryptedContent: string): ParsedNoteContent {
  try {
    const parsed = JSON.parse(decryptedContent) as unknown;
    if (
      typeof parsed === "object" &&
      parsed &&
      (parsed as { title?: string }).title !== undefined
    ) {
      const title =
        typeof (parsed as { title?: unknown }).title === "string"
          ? (parsed as { title: string }).title
          : "";
      const content =
        typeof (parsed as { content?: unknown }).content === "string"
          ? (parsed as { content: string }).content
          : "";
      const rawTags = Array.isArray((parsed as { tags?: unknown }).tags)
        ? ((parsed as { tags: unknown[] }).tags.filter(
            (tag) => typeof tag === "string"
          ) as string[])
        : [];
      return {
        title: title || "Untitled",
        content,
        tags: normalizeTags(rawTags),
      };
    }
  } catch {}

  const lines = decryptedContent.split("\n");
  const title = lines[0]?.replace(/^#\s+/, "").replace(/<[^>]*>/g, "") || "Untitled";
  const content = lines.slice(1).join("\n");
  return {
    title,
    content,
    tags: [],
  };
}

export function getPreviewFromNoteContent(content: string): string {
  return content
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .substring(0, 150);
}
