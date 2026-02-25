# DarkAuth Documentation

This directory contains concise implementation-aligned documentation for DarkAuth.

## Getting Started

- Start with [Schema Conventions](./schema-conventions.md), [OpenAPI Patterns](./openapi-patterns.md), and [Naming Conventions](./naming-conventions.md).
- Use [Organization RBAC](./organization-rbac.md) for org-scoped authorization behavior and user/admin RBAC endpoints.

## API Behavior

- [Organization RBAC](./organization-rbac.md): org memberships, role/permission derivation, org context resolution (`ORG_CONTEXT_REQUIRED`), user org endpoints, admin org/member/role endpoints (including member role add/remove compatibility routes), token org claims, and global-group UI status.
- [Admin Table and List Standards](./admin-list-standards.md): shared admin table UX, list query contract, pagination shape, and list bounds.

## Development Guides

### [Schema Conventions](./schema-conventions.md)
- Input validation and output serialization with Zod
- Schema organization by domain
- Type inference and transformation patterns
- Common schemas for pagination and error responses
- Best practices for maintainable schema design

### [OpenAPI Patterns](./openapi-patterns.md)
- Controller metadata via `ControllerSchema` and `zod/v4` `toJSONSchema`
- Request/response patterns
- Error response patterns
- Schema registration and documentation generation

### [Naming Conventions](./naming-conventions.md)
- No internal abbreviations; preserve protocol fields at boundaries
- File, variable, and function naming patterns
- Database schema conventions

## Technical Deep Dives

### [OPAQUE Implementation Guide](./opaque-ts-complete-guide.md)
Comprehensive guide to the OPAQUE authentication protocol implementation.

### [OPAQUE Technical Reference](./how-opaque-ts-works.ts)
Detailed technical documentation and working examples of the OPAQUE protocol flow.

## Contributing

- Keep docs concise and aligned with implementation in `packages/api`.
- Update docs in the same change when behavior, schemas, or endpoints change.
- Prefer linking to focused docs pages instead of duplicating detailed behavior in this index.
