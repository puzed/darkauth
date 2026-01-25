Generate the markdown changelog body for the provided release version.

Rules:
- Do not create or modify any files.
- Do not run gh or attempt to publish a release.
- You may use read-only commands to inspect changelog files and git history if available.
- Output markdown only between the markers `<!--release-notes-start-->` and `<!--release-notes-end-->`.
- Do not include any extra text outside the markers.
