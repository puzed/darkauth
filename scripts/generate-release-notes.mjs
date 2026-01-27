import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const tag = process.argv[2];
if (!tag) {
  console.error("Missing release tag argument");
  process.exit(1);
}

const promptPath = resolve(process.cwd(), ".github/prompts/github-create-release.md");
const startMarker = "<!--release-notes-start-->";
const endMarker = "<!--release-notes-end-->";
const message = [
  "Generate the markdown changelog body for release",
  tag,
  ".",
  "Return markdown only between the markers:",
  startMarker,
  "and",
  endMarker,
  "with no extra text.",
].join(" ");

const args = [
  "-y",
  "opencode-ai@latest",
  "run",
  "--model",
  "openrouter/z-ai/glm-4.7",
  "-f",
  promptPath,
  "--",
  message,
];

const permission = {
  read: { "*": "allow" },
  glob: { "*": "allow" },
  edit: "deny",
  bash: {
    "*": "deny",
    "git *": "allow",
    "ls *": "allow",
    "rg *": "allow",
    "cat *": "allow",
  },
};

const child = spawn("npx", args, {
  stdio: ["ignore", "pipe", "pipe"],
  env: {
    ...process.env,
    OPENCODE_PERMISSION: JSON.stringify(permission),
  },
});
let output = "";
let errorOutput = "";
child.stdout.on("data", (chunk) => {
  output += chunk.toString();
});
child.stderr.on("data", (chunk) => {
  const chunkString = chunk.toString();
  errorOutput += chunkString;
  process.stderr.write(chunkString);
});

const exitCode = await new Promise((resolveExit) => {
  child.on("close", resolveExit);
});

if (exitCode !== 0) {
  process.exit(exitCode);
}

const cleanOutput = (text) => text.replace(/\u001b\[[0-9;]*m/g, "");
const extractNotes = (text) => {
  const startIndex = text.indexOf(startMarker);
  const endIndex = text.indexOf(endMarker);
  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
    return null;
  }
  return text.slice(startIndex + startMarker.length, endIndex).replace(/^\s+|\s+$/g, "");
};
const extractFallbackNotes = (text) => {
  const lines = text.split("\n");
  const startLineIndex = lines.findIndex((line) => /^(#{1,6}\s|[-*]\s|\d+\.\s)/.test(line));
  if (startLineIndex === -1) {
    return null;
  }
  return lines.slice(startLineIndex).join("\n").replace(/^\s+|\s+$/g, "");
};
const cleanedOutput = cleanOutput(output);
const cleanedErrorOutput = cleanOutput(errorOutput);
const combinedOutput = `${cleanedOutput}\n${cleanedErrorOutput}`.trim();
let notes =
  extractNotes(cleanedOutput) || extractNotes(cleanedErrorOutput) || extractNotes(combinedOutput);
if (!notes) {
  notes = extractFallbackNotes(cleanedOutput) || extractFallbackNotes(cleanedErrorOutput);
}
if (!notes) {
  console.error("Release notes markers not found in OpenCode output");
  process.exit(1);
}

if (!notes) {
  console.error("Release notes content missing");
  process.exit(1);
}

await writeFile(resolve(process.cwd(), "release-notes.md"), `${notes}\n`, "utf8");
