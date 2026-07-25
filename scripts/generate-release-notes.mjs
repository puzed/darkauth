import { execFile, spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";

const tag = process.argv[2];
const execFileAsync = promisify(execFile);

if (!tag) {
  console.error("Missing release tag argument");
  process.exit(1);
}

async function runGit(args) {
  const { stdout } = await execFileAsync("git", args, {
    cwd: process.cwd(),
    env: process.env,
    maxBuffer: 10 * 1024 * 1024,
  });

  return stdout.trim();
}

async function getPreviousTag(targetTag) {
  await runGit(["rev-parse", "--verify", `refs/tags/${targetTag}^{commit}`]);

  try {
    return await runGit([
      "describe",
      "--tags",
      "--abbrev=0",
      "--match",
      "v*",
      `${targetTag}^`,
    ]);
  } catch {
    return null;
  }
}

async function getReleaseContext(targetTag) {
  const previousTag = await getPreviousTag(targetTag);
  const range = previousTag ? `${previousTag}..${targetTag}` : targetTag;
  const diffArgs = previousTag
    ? [range]
    : [await runGit(["hash-object", "-t", "tree", "/dev/null"]), targetTag];
  const [commits, changedFiles, diffStat] = await Promise.all([
    runGit(["log", "--reverse", "--format=%h %s", range]),
    runGit(["diff", "--name-status", ...diffArgs]),
    runGit(["diff", "--stat", ...diffArgs]),
  ]);

  return {
    previousTag,
    range,
    commits: commits || "(no commits found)",
    changedFiles: changedFiles || "(no changed files found)",
    diffStat: diffStat || "(no diff stat available)",
  };
}

const promptPath = resolve(process.cwd(), ".github/prompts/github-create-release.md");
const releaseContext = await getReleaseContext(tag);
const message = [
  "Generate the markdown changelog body for release",
  tag,
  ".",
  `Only summarize changes in ${releaseContext.range}.`,
  releaseContext.previousTag
    ? `The previous release tag is ${releaseContext.previousTag}.`
    : "There is no previous release tag.",
  "Do not include features, fixes, or dependency updates from earlier releases.",
  "Write the markdown changelog body to RELEASE.md with no extra text.",
  "",
  "Allowed release context:",
  "",
  `Target tag: ${tag}`,
  `Previous tag: ${releaseContext.previousTag ?? "(none)"}`,
  `Git range: ${releaseContext.range}`,
  "",
  "Commits in range:",
  releaseContext.commits,
  "",
  "Changed files in range:",
  releaseContext.changedFiles,
  "",
  "Diff stat:",
  releaseContext.diffStat,
].join("\n");

const args = [
  "dlx",
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

const child = spawn("pnpm", args, {
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
