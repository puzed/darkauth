# Embedded PGlite

Status: completed

## Delivered

- [x] Add embedded PGlite as the local database runtime.
- [x] Integrate database creation and reuse with installer/bootstrap behavior.
- [x] Keep generated database data out of version control and include migrations in release images.
- [x] Exercise install, audit, restart, and database reuse paths in the test suite.

## Evidence

- Embedded storage and install integration: commit `09a1f88`.
- Test-suite alignment: commit `17aeca2`.
- Runtime packaging: commit `66e2893`.
- Restart and PGlite reuse fix: commit `3a38962`.
