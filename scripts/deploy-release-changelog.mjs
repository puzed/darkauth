import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import uploadToBunny from "upload-to-bunny";

const accessKey = process.env.RELEASE_DEPLOY_ACCESS_KEY;
const storageZoneName = process.env.RELEASE_DEPLOY_STORAGE_ZONE;

if (!accessKey || !storageZoneName) {
  console.error("Missing required environment variables:");
  console.error("- RELEASE_DEPLOY_ACCESS_KEY");
  console.error("- RELEASE_DEPLOY_STORAGE_ZONE");
  process.exit(1);
}

const changelogDir = resolve(process.cwd(), "changelog");
const outDir = resolve(process.cwd(), ".release-dist");
const outChangelogDir = join(outDir, "changelog");

if (!existsSync(changelogDir)) {
  console.error(`Missing changelog directory at ${changelogDir}`);
  process.exit(1);
}

function parseVersion(filename) {
  const base = filename.replace(/\.md$/, "");
  return base
    .replace(/^v/, "")
    .split(".")
    .map((value) => Number(value) || 0);
}

async function buildChangelogJson(files) {
  const entries = await Promise.all(
    files.map(async (filename) => {
      const filePath = join(changelogDir, filename);
      const content = await readFile(filePath, "utf8");
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
    })
  );
  return JSON.stringify({ generatedAt: new Date().toISOString(), entries }, null, 2);
}

function sortFiles(files) {
  return files
    .filter((file) => file.endsWith(".md"))
    .sort((a, b) => {
      const left = parseVersion(a);
      const right = parseVersion(b);
      const length = Math.max(left.length, right.length);
      for (let index = 0; index < length; index += 1) {
        const diff = (right[index] || 0) - (left[index] || 0);
        if (diff !== 0) return diff;
      }
      return b.localeCompare(a);
    });
}

const files = sortFiles(await readdir(changelogDir));

await rm(outDir, { recursive: true, force: true });
await mkdir(outChangelogDir, { recursive: true });

await Promise.all(
  files.map(async (filename) => {
    const source = join(changelogDir, filename);
    const content = await readFile(source, "utf8");
    await writeFile(join(outChangelogDir, filename), content, "utf8");
  })
);

const payload = await buildChangelogJson(files);
await writeFile(join(outDir, "changelog.json"), payload, "utf8");

console.log("Uploading release changelog to Bunny CDN...");
console.log(`Storage Zone: ${storageZoneName}`);
console.log(`Source: ${outDir}`);

try {
  await uploadToBunny(outDir, "/", {
    storageZoneName,
    accessKey,
    cleanDestination: false,
    maxConcurrentUploads: 10,
  });
  console.log("Release changelog deployment successful");
} catch (error) {
  console.error("Release changelog deployment failed:", error);
  process.exit(1);
}
