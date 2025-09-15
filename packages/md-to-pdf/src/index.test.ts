import assert from "node:assert/strict";
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { markdownFileToPdf } from "./index.js";

test("converts markdown file to pdf", async () => {
	const dir = await mkdtemp(join(tmpdir(), "md-to-pdf-"));
	const mdPath = join(dir, "sample.md");
	const pdfPath = join(dir, "sample.pdf");
	const md = "# Title\n\nHello world.\n\n- One\n- Two\n- Three";
	await writeFile(mdPath, md, "utf8");
	await markdownFileToPdf(mdPath, pdfPath);
	const s = await stat(pdfPath);
	assert.ok(s.size > 500);
	await rm(dir, { recursive: true, force: true });
});
