# DarkAuth Test Suite

End-to-end test suite for DarkAuth using real databases, real servers, and Playwright.

## Prerequisites

- PostgreSQL server running locally
- Node.js 18+
- All DarkAuth packages built

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Ensure PostgreSQL is running and accessible with the default credentials:
   - Host: localhost:5432
   - User: postgres
   - Password: postgres
   
   Or set custom credentials in environment variables:
   ```bash
   export POSTGRES_HOST=localhost
   export POSTGRES_PORT=5432
   export POSTGRES_USER=your_user
   export POSTGRES_PASSWORD=your_password
   ```

3. Make sure the `@darkauth/api` package is built:
   ```bash
   cd ../api && npm run build
   ```

## Running Tests

Run all tests:
```bash
npm test
```

Run specific test suites:
```bash
npm run test:auth
```

Debug tests with headed browser:
```bash
npm run test:headed
```

Debug tests with Playwright inspector:
```bash
npm run test:debug
```

## Test Architecture

Each test suite:
1. Creates an isolated PostgreSQL database
2. Starts real HTTP servers using the production code
3. Completes system installation
4. Runs tests against the live system
5. Cleans up servers and database

## Test Isolation

- Each test file gets its own database
- No shared state between test files
- No mocking - all tests use real systems
- Parallel execution safe

## Writing Tests

Tests should:
- Use the `beforeAll`/`afterAll` pattern for setup/cleanup
- Test complete user workflows
- Assert on real UI elements and API responses
- Include both success and failure scenarios