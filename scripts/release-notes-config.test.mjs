import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("release notes prompt requires the exact release diff range", async () => {
  const prompt = await readFile(
    new URL("../.github/prompts/github-create-release.md", import.meta.url),
    "utf8",
  );

  assert.match(prompt, /previous-tag-to-target-tag git range/);
  assert.match(
    prompt,
    /Do not summarize commits, pull requests, release bodies, or project files from outside the provided range/,
  );
  assert.match(
    prompt,
    /Only claim a feature was introduced when the provided commits or diff show that introduction happened in this range/,
  );
});

test("release notes generator passes bounded git context to the model", async () => {
  const script = await readFile(
    new URL("./generate-release-notes.mjs", import.meta.url),
    "utf8",
  );

  assert.match(script, /getPreviousTag/);
  assert.match(script, /Git range:/);
  assert.match(script, /Commits in range:/);
  assert.match(script, /Changed files in range:/);
  assert.match(
    script,
    /Do not include features, fixes, or dependency updates from earlier releases/,
  );
});
