# DarkAuth

A zero-knowledge authentication system with OIDC compatibility. DarkAuth implements OPAQUE (RFC 9380) for password authentication where the server never learns the password, and provides optional zero-knowledge delivery of Data Root Keys (DRK) to trusted clients.

## Features

- **Zero-Knowledge Password Auth**: OPAQUE protocol ensures passwords never reach the server
- **OIDC Compatible**: Standard OAuth 2.0/OpenID Connect for universal compatibility
- **Zero-Knowledge DRK Delivery**: Optional fragment-based JWE delivery for trusted clients
- **Database-Driven Configuration**: All settings stored in PostgreSQL (no config files)
- **Two-Port Architecture**: Separate ports for user (9090) and admin (9081). First-run installer is served on the admin port until setup completes.
- **Secure Key Storage**: Optional encryption of private keys at rest using Argon2id-derived KEK
- **RBAC Support**: Fine-grained permissions and groups for users
- **Production Ready**: CSP headers, rate limiting, session management

## Quick Start

### Prerequisites

- Node.js 20+
- PostgreSQL 15+
- Docker & Docker Compose (optional, for PostgreSQL)

### 1. Start PostgreSQL

Using Docker Compose:
```bash
docker-compose up -d
```

Or use an existing PostgreSQL instance and configure the `postgresUri` in `config.yaml`.

### 2. Install Dependencies

```bash
npm install
```

### 3. Run Database Migrations

```bash
npm run db:push
```

### 4. Configuration

Create a `config.yaml` file in the project root:

```yaml
postgresUri: postgresql://username:password@localhost:5432/darkauth
userPort: 9090
adminPort: 9081
proxyUi: false  # Set to true for development
kekPassphrase: "your-strong-passphrase"
```

### 5. Initial Setup

#### Option A: Interactive Web Installer (Recommended)

```bash
npm start
```

Visit the installation URL shown in the console (includes a one-time token).

#### Option B: CLI Installation

```bash
npm run install:script
```

### 6. Start the Server

```bash
npm start
```

### 7. Access the System

- **User/OIDC**: http://localhost:9090 (or configured `userPort`)
- **Admin Panel**: http://localhost:9081 (or configured `adminPort`)
- **OIDC Discovery**: http://localhost:9090/api/.well-known/openid-configuration

## Development Mode

Run with hot-reloading and Vite dev servers:

```bash
# Set proxyUi: true in config.yaml for proxied development
npm run dev
```

This runs all three services concurrently:
- API server with hot-reloading
- User UI on Vite dev server
- Admin UI on Vite dev server

## Architecture

### Port Allocation

- **9090**: User-facing OIDC/Auth endpoints and UI
- **9081**: Admin interface and API (also serves the installation wizard until setup completes)

### Project Structure

DarkAuth is organized as a monorepo with npm workspaces:

```
packages/
├── api/           # Main server and API
├── user-ui/       # User-facing React application
├── admin-ui/      # Admin panel React application  
├── test-suite/    # Playwright end-to-end tests
└── ...
```

### URL Structure

- `/api/*`: Backend API endpoints
- `/`: React UI applications

### Database Schema

All configuration and state stored in PostgreSQL:

- **settings**: System configuration
- **jwks**: Signing keys (EdDSA/Ed25519)
- **clients**: OAuth/OIDC client registrations
- **users**: User accounts
- **opaque_records**: OPAQUE authentication data
- **wrapped_root_keys**: Encrypted DRK storage
- **auth_codes**: Authorization codes
- **sessions**: Active sessions
- **pending_auth**: In-progress auth requests
- **admin_users**: Admin accounts (separate cohort)
- **permissions/groups**: RBAC configuration

## Default Clients

Two clients are created during installation:

### app-web (Public Client)
- **Type**: Public
- **PKCE**: Required
- **ZK Delivery**: fragment-jwe (enabled)
- **Redirect URIs**: http://localhost:3000/callback

### support-desk (Confidential Client)
- **Type**: Confidential
- **Auth Method**: client_secret_basic
- **ZK Delivery**: None
- **Redirect URIs**: http://localhost:4000/callback

## Security Modes

- Private keys are always encrypted at rest using KEK
- KEK derived from passphrase using Argon2id  
- Passphrase configured in `config.yaml`
- KDF parameters stored in database

## Configuration

All configuration is managed via `config.yaml`. Create this file in the project root:

```yaml
# Required
postgresUri: postgresql://username:password@localhost:5432/darkauth
kekPassphrase: "your-strong-passphrase"

# Optional (with defaults)
userPort: 9090            # User/OIDC server port
adminPort: 9081           # Admin server port  
proxyUi: false            # Proxy to Vite dev servers (development only)
publicOrigin: "http://localhost:9090"  # Public-facing origin
issuer: "http://localhost:9090"        # OIDC issuer URL
rpId: "localhost"         # Relying party identifier
```

## API Endpoints

### OIDC Discovery
- `GET /api/.well-known/openid-configuration`
- `GET /api/.well-known/jwks.json`

### Authorization
- `GET /api/authorize` - OAuth authorization endpoint
- `POST /api/authorize/finalize` - Complete authorization (internal)
- `POST /api/token` - Token exchange endpoint

### OPAQUE Authentication
- `POST /api/opaque/register/start`
- `POST /api/opaque/register/finish`
- `POST /api/opaque/login/start`
- `POST /api/opaque/login/finish`

### DRK Management
- `GET /api/crypto/wrapped-drk` - Retrieve wrapped DRK
- `PUT /api/crypto/wrapped-drk` - Store wrapped DRK

### Session
- `GET /api/session` - Current session info
- `POST /api/logout` - End session

### Admin API (Port 9081)
- `/api/admin/users` - User management
- `/api/admin/clients` - Client management
- `/api/admin/settings` - System settings
- `/api/admin/jwks` - Key management

## Changelog

- Markdown entries live in `changelog/` as `YYYY-MM-DD.md`
- Generate new entries from git: `npm run generate-changelog-entries`
- The admin UI exposes `/changelog.json` and a page at `/changelog`

## Zero-Knowledge Flow

### Registration
1. Client generates OPAQUE registration request
2. Server stores opaque envelope (never sees password)
3. Client derives stable `export_key` from password
4. Client generates random DRK (32 bytes)
5. DRK wrapped with key derived from `export_key`
6. Wrapped DRK stored on server

### Login with ZK Delivery
1. Client includes ephemeral ECDH public key in `/authorize`
2. OPAQUE login produces `export_key`
3. Client unwraps DRK using `export_key`
4. DRK encrypted to app's ephemeral key (JWE)
5. JWE delivered via URL fragment (never hits server)
6. App verifies hash binding and decrypts DRK

## Building for Production

```bash
# Build all packages
npm run build

# Type checking
npm run typecheck

# Linting
npm run lint

# Code formatting
npm run format

# Start production server (ensure config.yaml is configured)
npm start
```

## Testing

The project uses Playwright for end-to-end testing:

```bash
# Install Playwright browsers (first time only)
npm run test:install

# Run all tests
npm test

# Run with detailed output
npm run test:report

# Run in headed mode (with browser UI)
npm run test:headed

# Debug tests
npm run test:debug
```

## Security Considerations

1. **Always use HTTPS in production** - Cookies are marked Secure
2. **Strong KEK passphrase** - Use 32+ characters for production in `config.yaml`
3. **Secure config.yaml** - Protect the config file as it contains the KEK passphrase
4. **Database security** - Encrypt PostgreSQL connections and storage
5. **CSP Headers** - Strict Content Security Policy enforced
6. **Rate limiting** - Configurable per endpoint
7. **Session security** - Short-lived sessions with CSRF protection

## Support

For issues and feature requests, please use the GitHub issue tracker.

## License

- Core and most packages are licensed under AGPL-3.0. See the root `LICENSE` and individual package LICENSE files.
- `packages/demo-app` and `packages/darkauth-client` are licensed under MIT.
- `packages/opaque-ts` is licensed under BSD-3-Clause.

Refer to each package's `package.json` and `LICENSE` file for the authoritative license.
