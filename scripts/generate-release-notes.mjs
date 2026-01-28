import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const tag = process.argv[2];
if (!tag) {
  console.error("Missing release tag argument");
  process.exit(1);
}

const promptPath = resolve(process.cwd(), ".github/prompts/github-create-release.md");
const message = [
  "Generate the markdown changelog body for release",
  tag,
  ".",
  "Write the markdown changelog body to RELEASE.md with no extra text.",
].join(" ");

const args = [
  "-y",
  "opencode-ai@latest",
  "run",
  "--model",
  "openrouter/anthropic/claude-haiku-4.5",
  "-f",
  promptPath,
  "--",
  message,
];

const permission = {
  read: { "*": "allow" },
  glob: { "*": "allow" },
  edit: { "*": "allow" },
  bash: {
    "*": "deny",
    "git *": "allow",
    "ls *": "allow",
    "rg *": "allow",
    "cat *": "allow",
  },
};

const child = spawn("npx", args, {
  stdio: "inherit",
  env: {
    ...process.env,
    OPENCODE_PERMISSION: JSON.stringify(permission),
  },
});

const exitCode = await new Promise((resolveExit) => {
  child.on("close", resolveExit);
});

if (exitCode !== 0) {
  process.exit(exitCode);
}

const releasePath = resolve(process.cwd(), "RELEASE.md");
let notes = "";
try {
  notes = await readFile(releasePath, "utf8");
} catch {
  console.error("Release notes file missing");
  process.exit(1);
}

if (!notes.trim()) {
  console.error("Release notes content missing");
  process.exit(1);
}
