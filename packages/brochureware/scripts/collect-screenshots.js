import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function ensureDir(p) {
  await fs.mkdir(p, { recursive: true });
}

async function emptyDir(p) {
  try {
    await fs.rm(p, { recursive: true, force: true });
  } catch {}
  await ensureDir(p);
}

function isPng(name) {
  return name.toLowerCase().endsWith(".png");
}

function isTestFinished(name) {
  return /^test-finished-\d+\.png$/i.test(name);
}

async function collectDir(testResultsDir, outDir) {
  await emptyDir(outDir);
  let entries = [];
  try {
    entries = await fs.readdir(testResultsDir, { withFileTypes: true });
  } catch {
    await fs.writeFile(path.join(outDir, "index.json"), JSON.stringify([], null, 2));
    return;
  }
  const manifest = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const scenarioDir = path.join(testResultsDir, entry.name);
    const files = await fs.readdir(scenarioDir);
    const pngs = files.filter((f) => isPng(f) && isTestFinished(f));
    pngs.sort((a, b) => {
      const an = parseInt(a.match(/test-finished-(\d+)\.png/i)?.[1] || "0", 10);
      const bn = parseInt(b.match(/test-finished-(\d+)\.png/i)?.[1] || "0", 10);
      return an - bn;
    });
    for (const file of pngs) {
      const num = parseInt(file.match(/test-finished-(\d+)\.png/i)?.[1] || "0", 10);
      const src = path.join(scenarioDir, file);
      const buf = await fs.readFile(src);
      const hash = crypto.createHash("sha256").update(buf).digest("hex").slice(0, 10);
      const base = `${entry.name}-${num}-${hash}.png`;
      const dst = path.join(outDir, base);
      await fs.writeFile(dst, buf);
      const parsed = parseScenario(entry.name);
      const testSlug = (entry.name.replace(/-(chromium|firefox|webkit)$/i, "").split("--")[1] || "");
      const slugOrHints = testSlug || parsed.hints?.join(" ") || "";
      const pretty = await titleFromSpec(parsed.group1, parsed.group2, parsed.feature, slugOrHints);
      manifest.push({
        file: base,
        scenario: entry.name,
        step: num,
        group1: parsed.group1,
        group2: parsed.group2,
        feature: parsed.feature,
        title: `${pretty || parsed.title} #${num}`,
      });
    }
  }

  manifest.sort((a, b) => a.scenario.localeCompare(b.scenario) || a.step - b.step);
  await fs.writeFile(path.join(outDir, "index.json"), JSON.stringify(manifest, null, 2));
}

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function collect() {
  const baseResults = path.resolve(__dirname, "../../test-suite");
  const lightIn = path.join(baseResults, "test-results-light");
  const darkIn = path.join(baseResults, "test-results-dark");
  const defaultIn = path.join(baseResults, "test-results");

  const baseOut = path.resolve(__dirname, "../public/test-screenshots");
  const outLight = path.join(baseOut, "light");
  const outDark = path.join(baseOut, "dark");

  const hasLight = await exists(lightIn);
  const hasDark = await exists(darkIn);
  const hasDefault = await exists(defaultIn);

  if (hasLight || hasDark) {
    if (hasLight) await collectDir(lightIn, outLight);
    if (hasDark) await collectDir(darkIn, outDark);
    return;
  }
  await collectDir(defaultIn, baseOut);
}

collect().catch((err) => {
  console.error(err);
  process.exit(1);
});

function titleCase(s) {
  const small = new Set(["and", "or", "the", "a", "an", "to", "of", "in", "on", "with", "for", "but"]);
  const words = s.trim().split(/\s+/);
  return words
    .map((w, i) => {
      const lower = w.toLowerCase();
      if (i > 0 && small.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

function cleanToken(t) {
  return t.replace(/[^a-z0-9]/gi, " ").replace(/\s+/g, " ").trim();
}

function parseScenario(name) {
  const withoutBrowser = name.replace(/-(chromium|firefox|webkit)$/i, "");
  const parts = withoutBrowser.split("--");
  const prefix = parts[0];
  const testSlug = parts[1] || "";
  const tokens = prefix.split("-").filter(Boolean);
  const group1Raw = tokens[0] || "general";
  const group2Raw = tokens[1] || "general";
  const featureRaw = tokens[2] || "";
  const group1 = titleCase(cleanToken(group1Raw));
  const group2 = titleCase(cleanToken(group2Raw));
  const feature = titleCase(cleanToken(featureRaw));
  let pretty = "";
  if (testSlug) {
    const test = titleCase(cleanToken(testSlug.replace(/-/g, " ")));
    pretty = feature ? `${feature} — ${test}` : test;
  } else {
    const skip = new Set([featureRaw.toLowerCase(), group1Raw.toLowerCase(), group2Raw.toLowerCase()]);
    const filtered = tokens
      .filter((t) => !skip.has(t.toLowerCase()))
      .filter((t) => !/^authentica?$/i.test(t))
      .filter((t) => !/^[a-f0-9]{4,10}$/i.test(t));
    const rest = filtered.map(cleanToken).filter(Boolean).join(" ");
    const core = titleCase(rest || name);
    pretty = feature ? `${feature} — ${core}` : core;
  }
  const skip2 = new Set([featureRaw.toLowerCase(), group1Raw.toLowerCase(), group2Raw.toLowerCase()]);
  const hints = tokens
    .slice(3)
    .filter((t) => !skip2.has(t.toLowerCase()))
    .filter((t) => !/^authentica?$/i.test(t))
    .filter((t) => !/^[a-f0-9]{4,10}$/i.test(t))
    .map(cleanToken)
    .filter(Boolean);
  return { group1, group2, feature, title: pretty, hints };
}

async function titleFromSpec(group1, group2, feature, slugFromDir) {
  try {
    const g1 = (group1 || "").toLowerCase();
    const g2 = (group2 || "").toLowerCase();
    const feat = (feature || "").toLowerCase();
    if (!g1 || !g2 || !feat) return "";
    const specPath = path.resolve(__dirname, `../../test-suite/tests/${g1}/${g2}/${feat}.spec.ts`);
    const content = await fs.readFile(specPath, "utf8");
    const titles = Array.from(content.matchAll(/\btest\(\s*['"`]([^'"`]+)['"`]/g)).map((m) => m[1]);
    if (!titles.length) return "";
    const slugTokens = tokenize(slugFromDir);
    let best = titles[0];
    let bestScore = -1;
    for (const t of titles) {
      const tTokens = tokenize(t);
      const score = intersect(slugTokens, tTokens).length - t.length * 1e-6;
      if (score > bestScore) {
        bestScore = score;
        best = t;
      }
    }
    return titleCase(best);
  } catch {
    return "";
  }
}

function tokenize(s) {
  const stop = new Set(["a","an","the","and","or","but","with","to","of","in","on","is","are","be","can","cannot","not","both"]);
  return cleanToken(String(s).toLowerCase())
    .split(/\s+/)
    .filter((w) => w && w.length >= 3 && !stop.has(w));
}

function intersect(a, b) {
  const setB = new Set(b);
  return a.filter((x) => setB.has(x));
}
