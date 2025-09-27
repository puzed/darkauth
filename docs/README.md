# DarkAuth Documentation

This directory contains comprehensive documentation for the DarkAuth project architecture and development patterns.

## Development Guides

### [Schema Conventions](./schema-conventions.md)
Complete guide to schema design patterns used throughout the project:
- Input validation and output serialization with Zod
- Schema organization by domain
- Type inference and transformation patterns
- Common schemas for pagination and error responses
- Best practices for maintainable schema design

### [OpenAPI Patterns](./openapi-patterns.md)
How to add OpenAPI documentation to new endpoints:
- Controller metadata collected via `ControllerSchema` exports and `zod/v4` `toJSONSchema`
- Request/response specification patterns
- Error response standardization
- Schema registration and documentation generation
- Complete examples for GET and POST endpoints

### [Naming Conventions](./naming-conventions.md)  
Coding standards and naming policies:
- No abbreviations internally; protocol fields preserved at boundaries
- File, variable, and function naming patterns
- Database schema conventions
- Protocol field preservation for OAuth/OIDC compliance
- Migration guidelines for refactoring

## Technical Deep Dives

### [OPAQUE Implementation Guide](./opaque-ts-complete-guide.md)
Comprehensive guide to the OPAQUE authentication protocol implementation.

### [OPAQUE Technical Reference](./how-opaque-ts-works.ts)
Detailed technical documentation and working examples of the OPAQUE protocol flow.

## Getting Started

For new contributors:

1. Review [Naming Conventions](./naming-conventions.md) for coding standards
2. Read [Schema Conventions](./schema-conventions.md) to understand validation patterns  
3. Follow [OpenAPI Patterns](./openapi-patterns.md) when adding new endpoints
4. Reference existing code examples in the `/src/` directory

## Contributing

When adding new features:

- Follow the established schema patterns for validation
- Export OpenAPI schemas for all new endpoints
- Use descriptive names without abbreviations
- Preserve protocol field naming at system boundaries
- Update documentation when introducing new patterns

These conventions ensure consistency, maintainability, and clear API documentation across the entire codebase.
