import assert from "node:assert/strict";
import { test } from "node:test";
import { getPreviewFromNoteContent, parseDecryptedNoteContent } from "../src/utils/noteContent.ts";

test("parseDecryptedNoteContent preserves structured JSON as plain values", () => {
  const parsed = parseDecryptedNoteContent(
    JSON.stringify({ title: "<b>Title</b>", content: "<p>Hello</p>", tags: [" Work ", "work"] })
  );

  assert.deepEqual(parsed, {
    title: "<b>Title</b>",
    content: "<p>Hello</p>",
    tags: ["work"],
  });
});

test("parseDecryptedNoteContent escapes fallback titles instead of stripping tags", () => {
  const parsed = parseDecryptedNoteContent(
    `# <ScRiPt>alert(1)</ScRiPt><img src=x onerror=alert(2)>\nBody`
  );

  assert.equal(
    parsed.title,
    "&lt;ScRiPt&gt;alert(1)&lt;/ScRiPt&gt;&lt;img src=x onerror=alert(2)&gt;"
  );
  assert.equal(parsed.content, "Body");
});

test("parseDecryptedNoteContent escapes malformed fallback title tags", () => {
  const parsed = parseDecryptedNoteContent(`# <script>alert(1)</SCRIPT<script>\nBody`);

  assert.equal(parsed.title, "&lt;script&gt;alert(1)&lt;/SCRIPT&lt;script&gt;");
});

test("getPreviewFromNoteContent escapes markup and event attributes", () => {
  const preview = getPreviewFromNoteContent(`<img src="x" onerror='alert(1)'> Hello\nworld`);

  assert.equal(preview, "&lt;img src=&quot;x&quot; onerror=&#39;alert(1)&#39;&gt; Hello world");
});

test("getPreviewFromNoteContent escapes repeated script fragments", () => {
  const preview = getPreviewFromNoteContent(`javajavascript:script:<ScRiPt>alert(1)</ScRiPt>`);

  assert.equal(preview, "javajavascript:script:&lt;ScRiPt&gt;alert(1)&lt;/ScRiPt&gt;");
});
