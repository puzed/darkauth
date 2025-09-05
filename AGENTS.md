# CLAUDE.md

This file provides guidance to AI agents when working with code in this repository.

Rules:
- ALWAYS consider removing things to fix the users issues. Not every needs an additive solution.
- Code should be simple and reusable. Don't overcomplicate things.
- NEVER write comments.
- Don't try and run the project. It's already running in another shell.
- ALWAYS follow the [specs/1_CODE_GUIDE.md](specs/1_CODE_GUIDE.md)
- If you are running the test-suite you must use the dot reporter or the tests will hang as they start an http server
