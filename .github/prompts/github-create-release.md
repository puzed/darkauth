Generate the markdown changelog body for the provided release version.

Rules:
- Read some of the other changelog files, so you understand the feel, tone, structure of them and be consistent in yours
- Do not include any front matter or metadata lines (date/title/commits/reviewed) or a leading `---`
- Do not attempt to publish a release.
- You may use read-only commands to inspect files and git history if available.
- Use parallel agents when exploring.
- Write the markdown changelog body to `RELEASE.md`.
- Do not output any extra text.
- Format the body with a short intro sentence followed by sections that match the established release style.
- Use 2-5 top-level sections with emoji headings (e.g. ✨ Features, 🛠 Improvements, 🐛 Fixes, 🧪 Tests, 📦 Dependencies, 📝 Documentation).
- Under each section, use 1-3 emoji subheadings and 1-4 bullet points each.
- Bullets should be specific and written in past tense, avoiding generic phrasing like "updated stuff".
