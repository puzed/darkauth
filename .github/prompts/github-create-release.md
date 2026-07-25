Generate the markdown changelog body for the provided release version.

Rules:
- Treat the provided previous-tag-to-target-tag git range as the only source of release changes.
- Do not summarize commits, pull requests, release bodies, or project files from outside the provided range as current-release changes.
- If you inspect git history, use only the provided range, for example `git log PREVIOUS_TAG..TARGET_TAG`.
- If you inspect diffs, use only the provided range, for example `git diff PREVIOUS_TAG..TARGET_TAG`.
- Project files show the final state, not proof that a feature was introduced in this release. Only claim a feature was introduced when the provided commits or diff show that introduction happened in this range.
- Do not include features, fixes, dependency updates, or workflows that were already present in earlier releases.
- Avoid words like "introduced", "added", or "new" for existing features that were only fixed, tuned, documented, or touched in this release.
- Do not include any front matter or metadata lines (date/title/commits/reviewed) or a leading `---`
- Do not attempt to publish a release.
- You may use read-only commands to inspect files and git history if available.
- Write the markdown changelog body to `RELEASE.md`.
- Do not output any extra text.
- Format the body with a short intro sentence followed by sections that match the established release style.
- Use markdown headings with hashes: `##` for top-level sections and `###` for subheadings.
- Use 2-5 top-level sections with emoji headings (e.g. `## ✨ Features`, `## 🛠 Improvements`, `## 🐛 Fixes`, `## 🧪 Tests`, `## 📦 Dependencies`, `## 📝 Documentation`).
- Under each section, use 1-3 emoji subheadings and 1-4 bullet points each (e.g. `### 🔐 Session Management`).
- Leave a blank line between headings and lists, and between sections.
- Bullets should be specific and written in past tense, avoiding generic phrasing like "updated stuff".
