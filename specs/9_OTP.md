# DarkAuth v1 — OTP (One-Time Password) Extension Specification

**Status:** Planned for v1.x
**Dependencies:** Core authentication (OPAQUE), Admin UI, User UI

---

## 1. Overview

This specification extends DarkAuth v1 with TOTP (Time-based One-Time Password) support for both admin users and regular users. OTP provides an additional layer of security beyond password authentication.

**Key Features:**
- TOTP-based 2FA for both admin and user cohorts
- Self-service OTP setup through respective UIs
- Client-side QR code generation from provisioning URI
- Backup codes for account recovery
- Admin ability to reset OTP for any user (admin or regular)
- Rate-limited verification to prevent brute force
- Anti-replay protection via timestep tracking
- Per-group OTP requirement with admin-configurable toggle
- Default group requires OTP by default; configurable in Admin UI

**Security Principles:**
- OTP secrets encrypted at rest using KEK with AAD binding
- Backup codes hashed with Argon2 (one-way)
- DB-backed failure count + IP-based rate limiting
- Session binding during OTP setup/verification
- Audit logging via existing withAudit pattern
- TOTP anti-replay via last_used_step tracking
- ACR/AMR claims in ID tokens for MFA indication

---

## 2. Database Schema Extensions

### 2.1 New Tables

```typescript
// Unified OTP configurations for both cohorts
otp_configs: 
  cohort (enum 'user|admin')
  subject_id (text) // sub for users, admin_id for admins
  secret_enc (bytea) // AES-256-GCM encrypted TOTP secret
  verified (boolean default false) // true after first successful verification
  created_at (timestamp)
  updated_at (timestamp)
  last_used_at (timestamp nullable)
  last_used_step (bigint nullable) // TOTP timestep for anti-replay
  failure_count (integer default 0) // consecutive failures for rate limiting
  locked_until (timestamp nullable) // temporary lockout after failures
  PRIMARY KEY (cohort, subject_id)

// Unified backup codes for both cohorts
otp_backup_codes:
  id (uuid pk)
  cohort (enum 'user|admin')
  subject_id (text) // sub for users, admin_id for admins
  code_hash (text) // argon2 hash of backup code
  used_at (timestamp nullable)
  created_at (timestamp)
  INDEX (cohort, subject_id)

// OTP operations use existing audit_logs table with withAudit pattern
// No separate otp_audit_log table needed
```

### 2.2 Settings Extensions

Add to `settings` table:
```json
{
  "otp": {
    "enabled": true,
    "issuer": "DarkAuth",
    "algorithm": "SHA1", // SHA1 default for compatibility, SHA256/512 configurable
    "digits": 6,
    "period": 30,
    "window": 1, // allow ±1 time window for clock skew
    "backup_codes_count": 8,
    "max_failures": 5,
    "lockout_duration_minutes": 15,
    "require_for_admin": true, // toggleable in Admin UI; forced by default
    "require_for_users": false  // if true, all users must have OTP
  },
  "rate_limits": {
    // ... existing rate limits
    "otp": { "window_minutes": 15, "max_requests": 10, "enabled": true }
  }
}
```

Policy precedence when `otp.enabled = true`:
- Admins must complete OTP when `require_for_admin = true` (default is forced `true`).
- All users must complete OTP when `require_for_users = true`.
- Otherwise, OTP is required when any login-enabled group requires OTP.

Group evaluation only considers groups where `enable_login = true`.

### 2.3 Group Policy Extension

Add per-group OTP requirement toggle.

Schema:
```
ALTER TABLE groups ADD COLUMN require_otp boolean NOT NULL DEFAULT false;
```

Seeding:
- Ensure the `Default` group exists and set `require_otp = true` by default.

Behavior:
- On login, if the user is a member of any group with `enable_login = true` and `require_otp = true`, OTP is required.
- A single matching group is sufficient to require OTP.

---

## 3. API Endpoints

### 3.1 User OTP Endpoints (port 9080)

All endpoints require authenticated user session.

#### Setup Flow

**POST `/otp/setup/init`**
- Generates new TOTP secret
- Returns provisioning URI and QR code data
- Creates unverified OTP config
- Rate limited: 3 requests per hour

Request: (empty)

Response:
```json
{
  "secret": "JBSWY3DPEHPK3PXP", // base32 encoded
  "provisioning_uri": "otpauth://totp/DarkAuth:user@example.com?secret=...&issuer=DarkAuth"
  // Client generates QR code from provisioning_uri
}
```

**POST `/otp/setup/verify`**
- Verifies first OTP code to complete setup
- Marks OTP as verified
- Returns backup codes
- Rate limited: 10 attempts per hour

Request:
```json
{
  "code": "123456"
}
```

Response:
```json
{
  "success": true,
  "backup_codes": [
    "XXXX-XXXX-XXXX",
    "YYYY-YYYY-YYYY",
    // ... 8 codes total
  ]
}
```

#### Authentication Flow

**POST `/otp/verify`**
- Called after successful OPAQUE login when OTP is enabled
- Extends session with OTP verification flag
- Rate limited per failure count

Request:
```json
{
  "code": "123456" // or backup code "XXXX-XXXX-XXXX"
}
```

Response:
```json
{
  "success": true,
  "is_backup_code": false
}
```

#### Management

**GET `/otp/status`**
- Returns current OTP configuration status

Response:
```json
{
  "enabled": true,
  "pending": false,
  "verified": true,
  "created_at": "2024-01-01T00:00:00Z",
  "last_used_at": "2024-01-15T12:00:00Z",
  "backup_codes_remaining": 5,
  "required": true
}
```

- `enabled` only becomes `true` after a code has been successfully verified and backup codes generated.
- `pending` is `true` when a secret has been issued but `enabled` is still `false` because verification has not completed yet.

### 3.2 Admin OTP Endpoints (port 9081)

Identical structure to user endpoints but under `/admin/otp/*` path:
- `/admin/otp/setup/init`
- `/admin/otp/setup/verify`
- `/admin/otp/verify`
- `/admin/otp/status`

### 3.3 Admin Management Endpoints (port 9081)

Requires admin session with `role=write`.

**GET `/admin/users/:sub/otp`**
- View user's OTP status

Response:
```json
{
  "enabled": true,
  "verified": true,
  "created_at": "2024-01-01T00:00:00Z",
  "last_used_at": "2024-01-15T12:00:00Z",
  "failure_count": 0,
  "locked_until": null
}
```

**DELETE `/admin/users/:sub/otp`**
- Forcibly remove user's OTP configuration
- Audit logged with admin identity

**POST `/admin/users/:sub/otp/unlock`**
- Clear failure count and locked_until
- For helping locked-out users

**GET `/admin/admins/:id/otp`**
- View another admin's OTP status
- Requires `role=write`

**DELETE `/admin/admins/:id/otp`**
- Remove another admin's OTP configuration
- Cannot remove own OTP this way
- Audit logged

---

## 4. Authentication Flow Modifications

### 4.1 User Login Flow

1. User initiates OPAQUE login via `/opaque/login/start` and `/opaque/login/finish`
2. On successful OPAQUE:
   - Evaluate OTP policy using precedence and group membership
   - If required, create partial session with `otp_required=true`
   - Return `{ otp_required: true }` in login response
3. User submits OTP via `/otp/verify`
4. On successful OTP verification:
   - Update session with `otp_verified=true`
   - Remove `otp_required` flag
   - Session is now fully authenticated

### 4.2 Admin Login Flow

Identical to user flow but through admin endpoints:
1. OPAQUE via `/admin/opaque/login/*`
2. Check admin OTP policy using precedence
3. OTP verification via `/admin/otp/verify`

### 4.3 Session Management

OTP state stored in `sessions.data` (jsonb):
```typescript
sessions.data: {
  // ... existing data
  otp_required?: boolean  // Set after OPAQUE if OTP enabled
  otp_verified?: boolean  // Set after successful OTP verification
}
```

Middleware must check:
- Protected endpoints require `data.otp_verified=true` when OTP is enabled
- OTP verification endpoints only accessible when `data.otp_required=true`
- No schema migration needed (uses existing jsonb field)

---

## 5. UI Implementation

### 5.1 Client-Side Routing & Redirect Rules

**Login finish handler (client):**
1. If `otpRequired` is false → proceed as normal
2. If `otpRequired` is true → call `/otp/status` and:
   - If `enabled === true` → `replace('/otp/verify')` (auth layout)
   - If `pending === true` or `enabled === false` → `replace('/otp/setup?forced=1')` (auth layout; cannot navigate away)

**Route guards (client):**
- Wrap all in-app routes (e.g. `/dashboard`, `/change-password`, settings pages) in an `OtpGate` component:
- Fetch `/otp/status`
  - If `required && enabled` → `Navigate('/otp/verify')`
  - If `required && (!enabled || pending)` → `Navigate('/otp/setup?forced=1')`
  - Otherwise render children
- `/otp/setup` (without `forced=1`) remains available for optional/manage flow from dashboard
- `/otp` redirects to `/otp/verify`
- Legacy `/otp-setup` redirects to `/otp/setup`

### 5.2 UI & Layout Rules

**Shared OTP component (single source of truth):**
- Props: `mode: 'setup' | 'verify'`, `layout: 'auth' | 'dashboard'`, `provisioningUri?: string`, `secret?: string`, handlers for verify
- Setup mode:
  - Shows centered QR (192px) with adequate vertical spacing
  - "Can't scan? Show secret" link reveals base32 secret + copy action
  - 6-digit input sized to 192px; Verify button below with spacing
  - Never calls `/otp/setup/init` in verify mode
- Verify mode:
  - Shows a single input (192px) + Verify button
  - No QR in confirm flow
- Layout:
  - `auth` renders inside the login card (same container as LoginView)
  - `dashboard` renders inside the dashboard card (same container as ChangePasswordView)

### 5.3 User UI (port 9080)

**Setup Flow:**
1. User navigates to Account Settings → Security → Two-Factor Authentication
2. Click "Enable 2FA"
3. UI calls `/otp/setup/init`, receives provisioning URI
4. UI generates QR code client-side from provisioning URI
5. User scans with authenticator app
6. User enters code, UI calls `/otp/setup/verify`
7. Display backup codes with download/print options
8. Require user confirmation before completing

**Login Flow:**
1. After OPAQUE login, check response for `otp_required`
2. Show OTP input screen
3. Submit to `/otp/verify`
4. Option to use backup code (different input format)

**Management:**
- Show OTP status in security settings
- Disable button (requires password reauth)
- Regenerate backup codes button
- View remaining backup codes count

### 5.4 Admin UI (port 9081)

**Own OTP Management:**
- Same as User UI but under admin profile settings

**User/Admin OTP Management:**
- Users list shows OTP status indicator
- User detail page shows OTP configuration
- "Remove OTP" button for write-role admins
- "Unlock OTP" button if user is locked out
- Audit log viewer showing OTP operations

**Group Policy Management:**
- Group Create/Edit: add Require OTP toggle in the Settings section
- Default state: on for the `Default` group, off for new groups
- Help text: any login-enabled group with Require OTP enforces OTP for members

---

## 6. Security Implementation Details

### 6.1 Secret Storage

```typescript
// Encryption using KEK service with AAD
function encryptOtpSecret(
  context: Context,
  secret: string,
  cohort: 'user' | 'admin',
  subjectId: string
): Buffer {
  if (!context.services.kek) {
    throw new Error('KEK unavailable - cannot encrypt OTP secret');
  }
  
  const aad = JSON.stringify({ cohort, subject_id: subjectId });
  return context.services.kek.encrypt(secret, aad);
}

function decryptOtpSecret(
  context: Context,
  encrypted: Buffer,
  cohort: 'user' | 'admin',
  subjectId: string
): string {
  if (!context.services.kek) {
    throw new Error('KEK unavailable - cannot decrypt OTP secret');
  }
  
  const aad = JSON.stringify({ cohort, subject_id: subjectId });
  return context.services.kek.decrypt(encrypted, aad);
}
```

### 6.2 TOTP Implementation

Implement using Node.js crypto only (no external dependencies):

```typescript
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

// Generate secret (160 bits for SHA1)
function generateTotpSecret(): string {
  return randomBytes(20).toString('base32'); // Use base32 encoding
}

// Calculate TOTP
function calculateTotp(
  secret: Buffer,
  timestep: number,
  algorithm: string = 'sha1',
  digits: number = 6
): string {
  // Convert timestep to 8-byte buffer (big-endian)
  const timeBuffer = Buffer.alloc(8);
  timeBuffer.writeBigInt64BE(BigInt(timestep));
  
  // HMAC
  const hmac = createHmac(algorithm, secret);
  hmac.update(timeBuffer);
  const hash = hmac.digest();
  
  // Dynamic truncation
  const offset = hash[hash.length - 1] & 0x0f;
  const binary = 
    ((hash[offset] & 0x7f) << 24) |
    ((hash[offset + 1] & 0xff) << 16) |
    ((hash[offset + 2] & 0xff) << 8) |
    (hash[offset + 3] & 0xff);
  
  const otp = binary % Math.pow(10, digits);
  return otp.toString().padStart(digits, '0');
}

// Verify with window and anti-replay
function verifyTotp(
  input: string,
  secret: Buffer,
  lastUsedStep: number | null,
  options: { period: number; window: number; algorithm: string; digits: number }
): { valid: boolean; timestep?: number } {
  const currentTime = Math.floor(Date.now() / 1000);
  const currentStep = Math.floor(currentTime / options.period);
  
  // Check window
  for (let i = -options.window; i <= options.window; i++) {
    const timestep = currentStep + i;
    
    // Anti-replay: reject if timestep was already used
    if (lastUsedStep !== null && timestep <= lastUsedStep) {
      continue;
    }
    
    const expected = calculateTotp(secret, timestep, options.algorithm, options.digits);
    
    // Constant-time comparison
    if (timingSafeEqual(Buffer.from(input), Buffer.from(expected))) {
      return { valid: true, timestep };
    }
  }
  
  return { valid: false };
}

// Create provisioning URI
function createProvisioningUri(
  secret: string,
  accountName: string,
  issuer: string,
  options: { algorithm?: string; digits?: number; period?: number }
): string {
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: options.algorithm || 'SHA1',
    digits: String(options.digits || 6),
    period: String(options.period || 30)
  });
  
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(accountName)}?${params}`;
}
```

### 6.3 Backup Codes

```typescript
// Generate backup codes
function generateBackupCodes(count: number): string[] {
  const codes = [];
  for (let i = 0; i < count; i++) {
    const code = crypto.randomBytes(12)
      .toString('base64')
      .replace(/[^A-Z0-9]/gi, '')
      .substring(0, 12)
      .match(/.{1,4}/g)
      .join('-');
    codes.push(code);
  }
  return codes;
}

// Hash for storage (using Argon2)
async function hashBackupCode(code: string): Promise<string> {
  return argon2.hash(code.replace(/-/g, ''));
}

// Verify backup code
async function verifyBackupCode(
  input: string,
  hash: string
): Promise<boolean> {
  const normalized = input.replace(/-/g, '');
  return argon2.verify(hash, normalized);
}
```

### 6.4 Rate Limiting

```typescript
// Use existing rate limit framework + DB-backed failure tracking
async function checkOtpRateLimit(
  context: Context,
  subjectId: string,
  cohort: 'user' | 'admin'
): Promise<{ allowed: boolean; lockedUntil?: Date }> {
  const config = await context.db.query.otp_configs.findFirst({
    where: and(
      eq(otp_configs.cohort, cohort),
      eq(otp_configs.subject_id, subjectId)
    )
  });

  if (!config) {
    return { allowed: true }; // No OTP configured
  }

  if (config.locked_until && config.locked_until > new Date()) {
    return { allowed: false, lockedUntil: config.locked_until };
  }

  return { allowed: true };
}

async function recordOtpFailure(
  context: Context,
  subjectId: string,
  cohort: 'user' | 'admin'
): Promise<void> {
  const settings = await getSettings(context);
  const maxFailures = settings.otp.max_failures;
  const lockoutMinutes = settings.otp.lockout_duration_minutes;
  
  await context.db.update(otp_configs)
    .set({
      failure_count: sql`failure_count + 1`,
      locked_until: sql`
        CASE 
          WHEN failure_count >= ${maxFailures - 1}
          THEN NOW() + INTERVAL '${lockoutMinutes} minutes'
          ELSE locked_until
        END
      `
    })
    .where(and(
      eq(otp_configs.cohort, cohort),
      eq(otp_configs.subject_id, subjectId)
    ));
    
  // Also use existing IP-based rate limiting
  await recordRateLimitAttempt(context, 'otp', context.ip);
}

async function recordOtpSuccess(
  context: Context,
  subjectId: string,
  cohort: 'user' | 'admin',
  timestep: number
): Promise<void> {
  await context.db.update(otp_configs)
    .set({
      failure_count: 0,
      locked_until: null,
      last_used_at: new Date(),
      last_used_step: timestep // Anti-replay protection
    })
    .where(and(
      eq(otp_configs.cohort, cohort),
      eq(otp_configs.subject_id, subjectId)
    ));
}
```

---

## 7. Migration and Rollout Strategy

### 7.1 Phased Rollout

**Phase 1: Default enforced for admins**
- Deploy with `require_for_admin: true, require_for_users: false`
- New admins must complete OTP during first login before accessing dashboard

**Phase 2: Group-based requirement for users**
- Add `groups.require_otp boolean` with default false
- Seed `Default` group with `require_otp = true`
- Admin UI exposes Require OTP toggle on Group create/edit
- Enforcement uses login-enabled groups to decide requirement

**Phase 3: Required for all users (optional)**
- Set `require_for_users: true`
- Grace period for existing users
- New users must set up OTP during onboarding

### 7.2 Backward Compatibility

- Existing sessions remain valid until expiry
- OTP requirement checked at next login
- APIs return `otp_required` flag for clients to handle
- Non-OTP clients continue working for users without OTP

---

## 8. Testing Requirements

### 8.1 Unit Tests

- TOTP generation and verification with time windows
- Backup code generation and verification
- Encryption/decryption of secrets
- Rate limiting logic
- Session state transitions
- Policy evaluation with groups and `enable_login`
- Default group seeded with `require_otp = true`

### 8.2 Integration Tests

- Complete setup flow (init → verify → backup codes)
- Login flow with OTP (OPAQUE → OTP → full session)
- Backup code usage and invalidation
- Admin operations (view, remove, unlock)
- Group Require OTP toggle enforces OTP when enabled
- Rate limiting and lockout behavior
- KEK rotation with encrypted secrets

### 8.3 E2E Tests

- User enables OTP through UI
- User logs in with OTP
- User recovers account with backup code
- Admin removes user's OTP
- Admin unlocks rate-limited user
- Clock skew tolerance (±30 seconds)

---

## 9. Monitoring and Alerts

### 9.1 Metrics

- OTP adoption rate (% users with OTP enabled)
- OTP verification success/failure rates
- Backup code usage frequency
- Rate limit triggers
- Setup abandonment rate

### 9.2 Audit Events

All OTP operations logged via existing `withAudit` pattern:
```typescript
await withAudit(context, {
  action: 'otp.setup_initiated',
  cohort,
  subjectId,
  metadata: { ip: request.ip }
}, async () => {
  // Setup logic
});
```

Audit actions:
- `otp.setup_initiated` / `otp.setup_completed`
- `otp.verified` / `otp.failed`
- `otp.disabled` / `otp.reset_by_admin`
- `otp.backup_code_used` / `otp.backup_codes_regenerated`
- `otp.unlocked_by_admin`

### 9.3 Alerts

- High failure rate (possible attack)
- Unusual backup code usage patterns
- Admin OTP removals
- Multiple locked accounts

---

## 10. Client Library Support

### 10.1 SDK Extensions

JavaScript/TypeScript SDK additions:
```typescript
interface OtpStatus {
  enabled: boolean;
  verified: boolean;
  backupCodesRemaining: number;
}

interface AuthResult {
  // ... existing fields
  otpRequired?: boolean;
}

// ID Token claims when MFA is used
interface IdTokenClaims {
  // ... existing claims
  amr?: string[];  // ['pwd', 'otp'] when MFA used
  acr?: string;    // 'urn:ietf:params:acr:mfa' when MFA verified
}

class DarkAuthClient {
  // ... existing methods
  
  async setupOtp(): Promise<{
    secret: string;
    provisioningUri: string;
    qrCode: string;
  }>;
  
  async verifyOtpSetup(code: string): Promise<{
    success: boolean;
    backupCodes: string[];
  }>;
  
  async verifyOtp(code: string): Promise<{
    success: boolean;
    isBackupCode: boolean;
  }>;
  
  async getOtpStatus(): Promise<OtpStatus>;
}
```

### 10.2 UI Components

Provide reference React components:
- `<OtpSetup />` - Provisioning URI to QR code generation and verification
- `<OtpInput />` - 6-digit code input with formatting (use existing input-otp if available)
- `<BackupCodeInput />` - Backup code format input
- `<OtpStatus />` - Status display with management options
- Client-side QR generation from provisioning URI (using qrcode.js or similar)

---

## 11. Security Considerations

### 11.1 Threat Model

**Threats:**
- Brute force OTP codes (mitigated by DB + IP rate limiting)
- Secret extraction from database (mitigated by KEK encryption with AAD)
- Backup code exhaustion (mitigated by regeneration)
- Session hijacking post-OPAQUE (mitigated by OTP requirement)
- Clock skew attacks (mitigated by time window)
- Code replay attacks (mitigated by last_used_step tracking)
- QR code interception during setup (mitigated by HTTPS + session binding)

### 11.2 Best Practices

- Never log OTP codes, secrets, or decrypted values
- Encrypt secrets at rest with AAD binding
- Hash backup codes with Argon2 (one-way)
- Rate limit via DB failure count + IP limits
- Audit log all operations via withAudit
- Require recent password verification (reauth token) for changes
- Clear OTP secrets from memory after use
- Use constant-time comparison (timingSafeEqual)
- Fail closed if KEK unavailable
- Return uniform errors to prevent enumeration

### 11.3 Compliance

- NIST SP 800-63B compliance for authentication
- Support for authenticator apps (something you have)
- Backup codes for account recovery
- Admin oversight capabilities
- Audit trail for compliance reporting

---

## 12. Implementation Priority

### 12.1 MVP (Phase 1)

**Backend:**
- Database schema for OTP configs and backup codes
- Basic TOTP generation and verification
- Setup and verify endpoints
- Rate limiting

**Frontend:**
- Basic setup flow with QR code
- OTP input during login
- Status display

### 12.2 Enhanced (Phase 2)

**Backend:**
- Admin management endpoints
- Audit logging
- Backup code regeneration
- Advanced rate limiting with lockout

**Frontend:**
- Polished UI components
- Backup code management
- Admin management interface

### 12.3 Advanced (Phase 3)

**Backend:**
- Selective OTP requirements
- Advanced threat detection
- WebAuthn integration preparation

**Frontend:**
- Improved UX with animations
- Mobile-optimized flows
- Accessibility improvements

---

## 13. Dependencies

### 13.1 Required Libraries

```json
{
  "dependencies": {
    "argon2": "^0.30.0"      // Already in use for KEK, also for backup codes
    // No external TOTP library needed - using Node crypto
    // QR code generation happens client-side
  }
}
```

### 13.2 Database Migrations

```sql
-- Create unified OTP tables
CREATE TYPE otp_cohort AS ENUM ('user', 'admin');

CREATE TABLE otp_configs (
  cohort otp_cohort NOT NULL,
  subject_id TEXT NOT NULL,
  secret_enc BYTEA NOT NULL,
  verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  last_used_at TIMESTAMP,
  last_used_step BIGINT,
  failure_count INTEGER DEFAULT 0,
  locked_until TIMESTAMP,
  PRIMARY KEY (cohort, subject_id)
);

CREATE TABLE otp_backup_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort otp_cohort NOT NULL,
  subject_id TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  used_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_otp_backup_codes_lookup ON otp_backup_codes(cohort, subject_id);
```

---

## 14. Implementation Plan

### 14.1 Client-Side Implementation Steps

1. **Client redirects**
   - Update login finish path: after receiving `otpRequired`, fetch `/otp/status` and branch to `/otp/verify` vs `/otp/setup?forced=1`

2. **Route guard**
   - Create/finish `OtpGate` and wrap: `/dashboard`, `/change-password`, any other private routes
   - Guard logic uses `/otp/status` per the rules above

3. **Routes**
   - Keep `/otp/setup` (optional/manage) → dashboard layout
   - Add forced flag via `?forced=1` to render the auth layout wrapper for setup when required
   - Keep `/otp/verify` (confirm) → auth layout only
   - Redirects: `/otp` → `/otp/verify`, `/otp-setup` → `/otp/setup`

4. **Shared OTP component**
   - Extract current logic from `OtpFlow` into a reusable component
   - `OtpSetupView` uses it with `mode='setup'` and `layout` depending on `forced` query param
   - `OtpVerifyView` uses it with `mode='verify'` and `layout='auth'`

5. **API usage correctness**
   - Setup mode calls `/otp/setup/init` to obtain `{ provisioning_uri, secret }`
   - Verify mode never calls `/otp/setup/init`
   - After successful verify, redirect to `/dashboard`

6. **Navigation hardening**
   - Header dropdown actions respect gating due to `OtpGate`
   - Optional/manage link points to `/otp/setup` (no forced flag)

### 14.2 Database & Settings
- Add `otp_configs` and `otp_backup_codes` tables as unified cohort tables
- Seed `settings.otp` with sensible defaults
- Add dedicated "otp" rate limit configuration

### 14.3 OTP Service (services/otp.ts)
- TOTP implementation using Node crypto only:
  - Base32 decode for secret handling
  - HMAC computation (SHA1/256/512 support)
  - Dynamic truncation per RFC 6238
  - Timestep calculation and window validation
  - Constant-time comparison with timingSafeEqual
- Secret encryption/decryption via `services.kek` with AAD
- Backup code generation, hashing (Argon2), verification
- Rate limit helpers integrated with existing framework
- Anti-replay via last_used_step tracking

### 14.4 User Controllers (port 9080)
- `/otp/setup/init`: Create unverified secret, return provisioning URI
- `/otp/setup/verify`: Verify code, mark verified, generate backup codes
- `/otp/status`: Return enabled/verified/last_used/backup count
- `/otp/verify`: Require partial session, verify code/backup, set session.data.otp_verified

### 14.5 Admin Controllers (port 9081)
- Mirror user endpoints under `/admin/otp/*`
- Management endpoints:
  - `GET /admin/users/:sub/otp`
  - `DELETE /admin/users/:sub/otp` (cannot self-delete)
  - `POST /admin/users/:sub/otp/unlock`
  - Same for `/admin/admins/:id/otp`

### 14.6 Login Flow Changes
- After `/opaque/login/finish`, check OTP config
- Create session with `data.otp_required=true` if OTP enabled
- Return `{ otp_required: true }` in response
- Middleware enforces `data.otp_verified=true` for protected endpoints

### 14.7 Token Issuance
- Include AMR: `['pwd', 'otp']` when MFA verified
- Include ACR: `'urn:ietf:params:acr:mfa'` for MFA sessions

### 14.8 UI Implementation
- User UI: Settings page for OTP setup/management
- Admin UI: Dedicated `/otp` route that mirrors user setup/verify flows, forces redirect when `require_for_admin` is true, and surfaces management tools for other principals
- Client-side QR generation from provisioning URI
- Use existing input-otp component if available

## 15. Acceptance Criteria

### 15.1 Forced Group, OTP Pending Setup
- After login, user is taken to `/otp/setup?forced=1` in the auth layout
- Setup screen stays visible (QR + input) until a valid code is entered
- Completing verification issues backup codes and redirects to `/dashboard`

### 15.2 Forced Group, OTP Configured
- After login, user is taken to `/otp/verify` in the auth layout
- All other app routes redirect back to `/otp/verify` until session verification succeeds
- Entering valid code proceeds to `/dashboard`

### 15.3 Not Forced
- Normal login goes to `/dashboard`
- Visiting `/otp/setup` shows the dashboard layout setup card, works end-to-end

### 15.4 Visual Requirements
- Auth layout flows match login card; dashboard flows match Change Password card
- QR centered with comfortable spacing; 192px input/buttons aligned; link to reveal/copy secret works

### 15.5 Test Checklist
- Login finish redirect matrix:
  - `(required=true, enabled=true)` → `/otp/verify`
  - `(required=true, enabled=false, pending=true)` → `/otp/setup?forced=1`
  - `(required=true, enabled=false, pending=false)` → `/otp/setup?forced=1`
  - `(required=false)` → `/dashboard`
- Route gating:
  - While required && enabled, navigating to `/dashboard` or `/change-password` redirects to `/otp/verify`
  - While required && (!enabled || pending), navigation redirects to `/otp/setup?forced=1`
- Setup flow:
  - `/otp/setup` shows QR; verify succeeds; backup codes appear; returns to dashboard
- Verify flow:
  - `/otp/verify` shows single input; verify succeeds; returns to dashboard

## 16. Decisions on Open Questions

### Per-User Required Flags
**Decision:** Defer to Phase 3. For v1.x, use cohort-wide settings (`require_for_admin`, `require_for_users`). Add per-user `require_otp` field later if needed.

### Rate Limit Configuration
**Decision:** Use dedicated "otp" rate limit bucket with conservative defaults (10 requests per 15 minutes). This separates OTP attempts from general auth attempts and allows fine-tuning.

---

## Appendix A: TOTP Algorithm Reference

TOTP uses HMAC-based One-Time Password (HOTP) with Unix time:

```
TOTP = HOTP(Secret, T)
T = floor(Current Unix time / Period)
Period = 30 seconds (default)
```

Standard: RFC 6238

## Appendix B: Authenticator App Compatibility

Tested with:
- Google Authenticator
- Microsoft Authenticator  
- Authy
- 1Password
- Bitwarden
- FreeOTP

All apps support:
- TOTP with SHA1
- 6-digit codes
- 30-second periods
- QR code provisioning via otpauth:// URI
