import { existsSync, readdirSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path, { join, resolve } from "node:path";

async function ensureDir(p) {
  try {
    await mkdir(p, { recursive: true });
  } catch {}
}

function buildChangelog() {
  try {
    const changelogDir = join(process.cwd(), "../../changelog");
    if (!existsSync(changelogDir)) return JSON.stringify({ generatedAt: new Date().toISOString(), entries: [] }, null, 2);
    const files = readdirSync(changelogDir).filter((f) => f.endsWith(".md")).sort((a, b) => b.localeCompare(a));
    const entries = files.map((filename) => {
      const filePath = join(changelogDir, filename);
      const content = readFileSync(filePath, "utf8");
      const parts = content.split("---");
      if (parts.length < 2) return { date: "", title: "", changes: [], filename };
      const header = parts[0];
      const body = parts.slice(1).join("---").trim();
      let date = "";
      let title = "";
      const headerLines = header.split("\n");
      for (const line of headerLines) {
        if (line.startsWith("date: ")) date = line.replace("date: ", "").trim();
        else if (line.startsWith("title: ")) title = line.replace("title: ", "").trim();
      }
      const changes = body ? [body] : [];
      return { date, title, changes, filename };
    });
    return JSON.stringify({ generatedAt: new Date().toISOString(), entries }, null, 2);
  } catch {
    return JSON.stringify({ generatedAt: new Date().toISOString(), entries: [] }, null, 2);
  }
}

async function main() {
  const outDir = resolve(process.cwd(), "packages/brochureware/public");
  await ensureDir(outDir);
  const payload = buildChangelog();
  await writeFile(join(outDir, "changelog.json"), payload, "utf8");
}

main().catch(() => process.exit(1));

