# Organization RBAC, federation, and SCIM

Status: completed

## Delivered

- [x] Replace legacy group authorization with organization-scoped roles and permissions.
- [x] Add organization membership, invitations, administrator safeguards, and organization switching.
- [x] Add enterprise organization schema and management flows for federation and SCIM provisioning.
- [x] Keep SCIM provisioning separate from authentication and require a configured authentication method.
- [x] Carry organization context through API, user/admin UI, SDK sessions, OTP policy, and OAuth clients.
- [x] Support clients that require organization selection and clients configured as organization-less.

## Evidence

- Organization RBAC: PR #91 (`44f0461`), led by commit `f63637c`.
- Legacy group removal: PR #115 (`0870b8d`).
- Organization selection: PR #130 (`d257d30`).
- Enterprise federation and SCIM phase: commits `69a78f7`, `139081c`, `66e2455`; merged in PR #151 (`28f5875`).
- Administrator guard: PR #155 (`0794b14`).
- Organization-less clients: PR #174 (`c37010b`).
