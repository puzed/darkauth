import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = dirname(here);
const sourceExtensions = new Set([".ts", ".tsx"]);

function sourceFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) files.push(...sourceFiles(path));
    else if (sourceExtensions.has(extname(path))) files.push(path);
  }
  return files;
}

function statements(source) {
  return source
    .split("\n")
    .map((line, index) => ({ line: line.trim(), number: index + 1 }))
    .filter(({ line }) => /\b(localStorage|sessionStorage|indexedDB)\s*\.\s*\w/.test(line));
}

function guardedRanges(source) {
  const ranges = [];
  const lines = source.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    if (!/\btry\s*\{/.test(lines[index] ?? "")) continue;
    let depth = 0;
    for (let cursor = index; cursor < lines.length; cursor += 1) {
      const line = lines[cursor] ?? "";
      depth += (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
      if (depth <= 0) {
        ranges.push([index + 1, cursor + 1]);
        break;
      }
    }
  }
  return ranges;
}

test("browser storage access is always guarded so a storage failure cannot replace a real error", () => {
  const offenders = [];
  for (const file of sourceFiles(root)) {
    if (file.endsWith(".test.ts")) continue;
    const source = readFileSync(file, "utf8");
    const ranges = guardedRanges(source);
    for (const { line, number } of statements(source)) {
      const guarded = ranges.some(([start, end]) => number >= start && number <= end);
      if (!guarded) offenders.push(`${file.slice(root.length + 1)}:${number} ${line}`);
    }
  }
  assert.deepEqual(offenders, []);
});

test("legacy token cleanup swallows storage failures", async () => {
  const source = readFileSync(resolve(here, "api.ts"), "utf8");
  const start = source.indexOf("clearLegacyTokens(): void {");
  assert.notEqual(start, -1);
  const body = source.slice(start, source.indexOf("\n  }\n", start));
  assert.match(body, /try \{/);
  assert.match(body, /catch \(error\) \{/);
  assert.ok(body.indexOf("try {") < body.indexOf("localStorage.removeItem"));
});
