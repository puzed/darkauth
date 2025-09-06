/**
 * Complete Working Example: How to Use Cloudflare's opaque-ts Library
 * =====================================================================
 * 
 * This file demonstrates the CORRECT way to use the opaque-ts library for
 * implementing OPAQUE (Oblivious Pseudorandom Authenticated Key Exchange)
 * password authentication in Node.js.
 * 
 * OPAQUE allows password-based authentication where:
 * - The server NEVER learns the password
 * - Passwords are never transmitted in any form
 * - Export keys are deterministic (same password = same key every time)
 * - Session keys are ephemeral (different for each login)
 * - Protection against offline dictionary attacks
 * 
 * Date: 24-AUG-2025
 * Library: @cloudflare/opaque-ts
 */

import { webcrypto } from 'node:crypto';
import { randomBytes } from 'node:crypto';

// ============================================================================
// CRITICAL SETUP: Web Crypto API
// ============================================================================
// The opaque-ts library relies on the Web Crypto API which is not available
// globally in Node.js by default. This MUST be done before importing opaque-ts.
// Without this, you'll get cryptic errors about undefined crypto operations.
if (typeof globalThis.crypto === 'undefined') {
  (globalThis as any).crypto = webcrypto;
}

// Now we can safely import the opaque-ts library
import {
  OpaqueServer,
  OpaqueClient,
  OpaqueID,
  OpaqueConfig,
  // These types are used for type checking but also help understand the protocol
  type RegistrationRequest,
  type RegistrationResponse,
  type RegistrationRecord,
  type KE1,  // Key Exchange message 1 (client -> server)
  type KE2,  // Key Exchange message 2 (server -> client)
  type KE3,  // Key Exchange message 3 (client -> server)
} from '../packages/opaque-ts/lib/src/index.js';

// For proper elliptic curve key generation
import { generateKeyPair } from '@cloudflare/voprf-ts';

/**
 * Main demonstration function showing the complete OPAQUE flow
 * This includes both registration and authentication phases
 */
async function demonstrateOpaqueFlow() {
  console.log('=== OPAQUE Protocol Complete Demonstration ===\n');
  console.log('This example shows BOTH what to do AND what NOT to do.\n');
  
  // ============================================================================
  // PHASE 1: CONFIGURATION AND SERVER SETUP
  // ============================================================================
  console.log('📋 PHASE 1: Configuration and Server Setup');
  console.log('=' .repeat(50));
  
  // 1.1 - Configuration
  // The OpaqueConfig defines which cryptographic suite to use.
  // OpaqueID.OPAQUE_P256 uses P-256 elliptic curve with SHA-256
  const config = new OpaqueConfig(OpaqueID.OPAQUE_P256);
  console.log('✅ Created config with suite:', OpaqueID.OPAQUE_P256);
  console.log('   - Curve: P-256');
  console.log('   - Hash: SHA-256');
  console.log('   - OPRF group element size:', config.oprf.Noe, 'bytes');
  
  // 1.2 - OPRF Seed Generation
  // The OPRF (Oblivious Pseudorandom Function) seed is used for deterministic
  // password hashing. This MUST be:
  // - Kept SECRET (never expose this!)
  // - PERSISTENT (same seed across server restarts)
  // - RANDOM (use cryptographically secure randomness)
  const oprfSeed = Array.from(randomBytes(32));
  console.log('\n✅ Generated OPRF seed (32 bytes)');
  console.log('   ⚠️  In production: Store this securely and reuse it!');
  
  // 1.3 - Server AKE Keypair Generation
  // The server needs an elliptic curve keypair for the Authenticated Key Exchange.
  // IMPORTANT: This must be a proper EC keypair, not just random bytes!
  // 
  // WRONG WAY (what I tried initially):
  // const serverKeypair = {
  //   private_key: Array.from(randomBytes(32)),  // ❌ Not a valid EC key!
  //   public_key: Array.from(randomBytes(33))    // ❌ Not derived from private!
  // };
  //
  // RIGHT WAY: Use proper elliptic curve key generation
  const serverKeyPair = await generateKeyPair('P256-SHA256');
  const akeKeypair = {
    private_key: Array.from(serverKeyPair.privateKey),
    public_key: Array.from(serverKeyPair.publicKey)
  };
  console.log('\n✅ Generated server AKE keypair');
  console.log('   - Private key:', akeKeypair.private_key.length, 'bytes (keep SECRET!)');
  console.log('   - Public key:', akeKeypair.public_key.length, 'bytes (can be public)');
  
  // 1.4 - Server Initialization
  // The server identity is a string that identifies this server.
  // It's used in the key derivation process.
  // CRITICAL: Must match production exactly - use "DarkAuth" not "DarkAuth-server"!
  const serverIdentity = 'DarkAuth';
  const server = new OpaqueServer(config, oprfSeed, akeKeypair, serverIdentity);
  console.log('\n✅ Server initialized');
  console.log('   - Identity:', serverIdentity);
  console.log('   - Ready to handle registrations and logins');
  
  // ============================================================================
  // PHASE 2: USER REGISTRATION
  // ============================================================================
  console.log('\n\n📝 PHASE 2: User Registration');
  console.log('=' .repeat(50));
  
  // User credentials
  const password = 'mysecretpassword';
  const username = 'alice@example.com';  // This is the credential identifier
  console.log('User:', username);
  console.log('Password: [hidden]');
  
  // Step 2.1: Client initiates registration
  // The client creates a registration request using just the password.
  // This request contains a blinded version of the password.
  console.log('\n🔐 Step 2.1: Client initiates registration');
  const client = new OpaqueClient(config);
  const regRequest = await client.registerInit(password);
  
  // IMPORTANT: Check for errors! The library returns T | Error for async methods
  if (regRequest instanceof Error) {
    throw new Error(`Registration init failed: ${regRequest.message}`);
  }
  
  console.log('   ✓ Registration request created');
  console.log('   - Size:', regRequest.serialize().length, 'bytes');
  console.log('   - Contains: Blinded password element');
  
  // Step 2.2: Server evaluates and responds
  // The server evaluates the blinded element and returns:
  // - The evaluation (for the OPRF)
  // - The server's public key
  console.log('\n🖥️  Step 2.2: Server processes registration');
  const regResponse = await server.registerInit(regRequest, username);
  
  if (regResponse instanceof Error) {
    throw new Error(`Server registration failed: ${regResponse.message}`);
  }
  
  console.log('   ✓ Server created registration response');
  console.log('   - Evaluation size:', regResponse.evaluation.length, 'bytes');
  console.log('   - Server public key size:', regResponse.server_public_key.length, 'bytes');
  
  // Step 2.3: Client completes registration
  // The client:
  // - Unblinds the server's evaluation
  // - Derives keys from the password
  // - Creates an encrypted envelope containing the keys
  // - Generates an export key (deterministic, for app-level use)
  console.log('\n🔐 Step 2.3: Client completes registration');
  
  // CRITICAL: The client needs to know the server's identity!
  const regResult = await client.registerFinish(
    regResponse,
    serverIdentity,  // Must match what the server uses
    username         // Client identity (credential identifier)
  );
  
  if (regResult instanceof Error) {
    throw new Error(`Registration finish failed: ${regResult.message}`);
  }
  
  console.log('   ✓ Registration completed');
  console.log('   - Generated record for server storage');
  console.log('   - Export key:', Buffer.from(regResult.export_key).toString('hex').substring(0, 16) + '...');
  console.log('     (This key is deterministic - same password always gives same key)');
  
  // Step 2.4: Server stores the record
  // The server needs to store:
  // 1. The registration record (contains envelope + client public key)
  // 2. Association with the username
  // 3. The server public key used (from regResponse)
  console.log('\n💾 Step 2.4: Server stores user data');
  const userRecord = regResult.record;
  const storedServerPublicKey = regResponse.server_public_key;
  
  console.log('   ✓ Storing user record');
  console.log('   - Record size:', userRecord.serialize().length, 'bytes');
  console.log('   - Contains: Encrypted envelope + client public key');
  console.log('   - Server public key stored:', storedServerPublicKey.length, 'bytes');
  console.log('   - Server public key source: registration response (NOT serverSetup!)');
  console.log('   ⚠️  IMPORTANT: Store both the record AND server public key!');
  
  // ============================================================================
  // PHASE 3: USER AUTHENTICATION (LOGIN)
  // ============================================================================
  console.log('\n\n🔑 PHASE 3: User Authentication (Login)');
  console.log('=' .repeat(50));
  console.log('Simulating a new login session with the same credentials...');
  
  // Step 3.1: Client initiates login
  // Creates a new client instance (simulating a new session)
  console.log('\n🔐 Step 3.1: Client initiates login');
  console.log('🔵 ADMIN-UI: startLogin START');
  console.log('  email:', username);
  console.log('  password: [hidden]');
  
  const loginClient = new OpaqueClient(config);
  console.log('  Created OpaqueClient with config:', config.suite);
  
  const loginRequest = await loginClient.authInit(password);
  
  if (loginRequest instanceof Error) {
    console.error('  ❌ authInit failed:', loginRequest.message);
    throw new Error(`Login init failed: ${loginRequest.message}`);
  }
  
  const serialized = loginRequest.serialize();
  console.log('  ✅ KE1 created, size:', serialized.length, 'bytes');
  console.log('  First 10 bytes:', serialized.slice(0, 10));
  
  console.log('   ✓ Login request created (KE1 message)');
  console.log('   - Credential request size:', loginRequest.credential_request.serialize().length, 'bytes');
  console.log('   - Auth request contains: client nonce + ephemeral public key');
  
  // Step 3.2: Server responds with KE2
  // The server:
  // - Evaluates the credential request using the stored envelope
  // - Generates ephemeral keys for this session
  // - Creates a MAC to prove it knows the envelope
  console.log('\n🖥️  Step 3.2: Server processes login request');
  
  // CRITICAL BUG I HAD: Not passing client_identity parameter!
  // WRONG: const loginResponse = await server.authInit(loginRequest, userRecord, username);
  // RIGHT: Pass client_identity as 4th parameter
  const loginResponse = await server.authInit(
    loginRequest,
    userRecord,
    username,        // credential_identifier
    username         // client_identity - MUST be provided for MAC to verify!
  );
  
  if (loginResponse instanceof Error) {
    throw new Error(`Server auth init failed: ${loginResponse.message}`);
  }
  
  console.log('   ✓ Server created login response (KE2 message)');
  console.log('   - Credential response with masked envelope');
  console.log('   - Auth response with server\'s ephemeral key + MAC');
  
  // Step 3.3: Client completes authentication
  // The client:
  // - Recovers the envelope using the password
  // - Derives the same keys as during registration
  // - Verifies the server's MAC
  // - Generates session keys
  console.log('\n🔐 Step 3.3: Client completes authentication');
  
  // CRITICAL: In production, client uses STRINGS for identities and undefined for context!
  // This is different from some examples that show arrays. The production truth is strings.
  console.log('🔵 ADMIN-UI: finishLogin START');
  console.log('  Calling authFinish with production pattern:');
  console.log('🔐 Production pattern: Using STRINGS for identities:');
  console.log('   - serverIdentity (string):', serverIdentity);
  console.log('   - clientIdentity (string):', username);
  console.log('   - context: undefined (4th parameter)');
  
  const loginResult = await loginClient.authFinish(
    loginResponse,
    serverIdentity,  // STRING: Must be same as registration
    username,        // STRING: Must be same as registration  
    undefined        // UNDEFINED: Use default empty context
  );
  
  if (loginResult instanceof Error) {
    // This is where "handshake error" occurs if MAC verification fails
    // Common causes:
    // - Wrong server identity
    // - Wrong client identity  
    // - Server didn't pass client_identity to authInit
    // - Different keys used than during registration
    // EnvelopeRecoveryError is the most common failure - wrong password/identity mismatch
    if (loginResult.message.includes('EnvelopeRecoveryError')) {
      console.log('   ❌ EnvelopeRecoveryError - likely wrong password or identity mismatch');
      console.log('   Common causes:');
      console.log('     - Wrong password');
      console.log('     - Server identity mismatch between registration and login');
      console.log('     - Client identity mismatch between registration and login');
      console.log('     - Using wrong server public key (must be from registration response)');
      throw new Error('Incorrect password or identity mismatch');
    }
    throw new Error(`Client auth finish failed: ${loginResult.message}`);
  }
  
  console.log('   ✓ Client authentication successful');
  console.log('   - Generated KE3 message for server');
  console.log('   - Session key:', Buffer.from(loginResult.session_key).toString('hex').substring(0, 16) + '...');
  console.log('   - Export key:', Buffer.from(loginResult.export_key).toString('hex').substring(0, 16) + '...');
  console.log('     (Export key should match registration!)');
  
  // Step 3.4: Server verifies and completes
  // The server verifies the client's MAC and derives session keys
  console.log('\n🖥️  Step 3.4: Server verifies client authentication');
  
  // Note: authFinish is synchronous and returns T | Error
  const serverResult = server.authFinish(loginResult.ke3);
  
  if (serverResult instanceof Error) {
    throw new Error(`Server auth finish failed: ${serverResult.message}`);
  }
  
  console.log('   ✓ Server verification successful');
  console.log('   - Session key:', Buffer.from(serverResult.session_key).toString('hex').substring(0, 16) + '...');
  
  // ============================================================================
  // PHASE 4: VERIFICATION AND KEY PROPERTIES
  // ============================================================================
  console.log('\n\n✅ PHASE 4: Verification');
  console.log('=' .repeat(50));
  
  // Verify session keys match
  const clientSessionKey = Buffer.from(loginResult.session_key).toString('hex');
  const serverSessionKey = Buffer.from(serverResult.session_key).toString('hex');
  
  if (clientSessionKey === serverSessionKey) {
    console.log('🎉 SUCCESS: Session keys match!');
    console.log('   Both parties have established a shared secret.');
  } else {
    console.log('❌ ERROR: Session keys do not match!');
    console.log('   Something went wrong in the protocol.');
  }
  
  // Verify export key is deterministic
  const regExportKey = Buffer.from(regResult.export_key).toString('hex');
  const loginExportKey = Buffer.from(loginResult.export_key).toString('hex');
  
  if (regExportKey === loginExportKey) {
    console.log('🎉 SUCCESS: Export keys match!');
    console.log('   Same password produces same export key (deterministic).');
  } else {
    console.log('❌ ERROR: Export keys do not match!');
  }
  
  return {
    // Return key components for further testing if needed
    config,
    server,
    oprfSeed,
    akeKeypair,
    serverIdentity,
    userRecord,
    storedServerPublicKey,
    exportKey: loginResult.export_key,
    sessionKey: loginResult.session_key
  };
}

// ============================================================================
// DarkAuth PRODUCTION IMPLEMENTATION
// ============================================================================

/**
 * DarkAuth PRODUCTION IMPLEMENTATION
 * ================================
 * 
* This section documents how DarkAuth actually implements OPAQUE in production,
 * including all the wrapper layers, exact parameter orders, bug fixes, and
* integration patterns. This is the COMPLETE TRUTH about how DarkAuth works.
 * 
 * CRITICAL PRODUCTION DIFFERENCES FROM DEMO ABOVE:
* 1. Server identity is 'DarkAuth' (not 'DarkAuth-server' as in demo above)
 * 2. Complex wrapper layer architecture with parameter order differences
 * 3. Base64url encoding for HTTP transport
 * 4. Database storage with Buffer/bytea handling
 * 5. Multi-step session management for login flow
 * 6. Service layer that swaps parameter order from underlying library
 */

// ============================================================================
// ARCHITECTURE OVERVIEW
// ============================================================================

/**
 * DarkAuth OPAQUE ARCHITECTURE (from client to storage):
 * 
 * 1. ADMIN UI CLIENT (packages/admin-ui/src/services/opaque-cloudflare.ts)
 *    - Uses Cloudflare OpaqueClient directly
 *    - Handles base64url encoding/decoding for HTTP
 *    - Manages client-side state between requests
 * 
 * 2. API CONTROLLERS (packages/api/src/controllers/admin/opaqueLogin*.ts)
 *    - HTTP endpoints for login start/finish
 *    - Converts base64url to/from Uint8Array
 *    - Calls service layer
 * 
 * 3. SERVICE LAYER (packages/api/src/services/opaque.ts)
 *    - Wrapper around opaque-ts-wrapper
 *    - PARAMETER ORDER: (request, identityU, identityS)
 *    - Manages active sessions for multi-step login
 * 
 * 4. OPAQUE-TS WRAPPER (packages/api/src/lib/opaque/opaque-ts-wrapper.ts)
 *    - Wrapper around Cloudflare OpaqueServer/OpaqueClient
 *    - PARAMETER ORDER: (request, identityS, identityU) - DIFFERENT!
 *    - Handles serialization/deserialization
 *    - Proper EC keypair generation
 * 
 * 5. CLOUDFLARE OPAQUE-TS LIBRARY
 *    - Core OPAQUE implementation
 *    - Expects strings for identities, not arrays
 *    - Returns Error objects for failures
 * 
 * 6. DATABASE STORAGE
 *    - PostgreSQL with bytea columns
 *    - Envelope = RegistrationRecord serialized
 *    - ServerPubkey = from registration response
 */

// ============================================================================
// PRODUCTION REGISTRATION FLOW (postInstallComplete.ts)
// ============================================================================

async function demonstrateProductionRegistrationFlow() {
  console.log('\n\n📋 DarkAuth PRODUCTION REGISTRATION FLOW');
  console.log('=' .repeat(50));
  console.log('This shows EXACTLY how DarkAuth registers the admin user during installation.');
  
  const adminEmail = 'admin@example.com';
  const adminPassword = 'securepassword123';
  
  // Step 1: Client-side registration start (in postInstallComplete.ts)
  console.log('\n🔐 Step 1: Client starts registration (postInstallComplete.ts)');
  console.log('  Location: packages/api/src/controllers/install/postInstallComplete.ts:164-167');
  console.log(`  
  const client = new OpaqueClient();
  await client.initialize();
  const clientRegistrationStart = await client.startRegistration(adminPassword, adminEmail);
  `);
  
  // This creates a RegistrationRequest and client state
  
  // Step 2: Server processes registration start
  console.log('\n🖥️  Step 2: Service processes registration (postInstallComplete.ts)');
  console.log('  Location: packages/api/src/controllers/install/postInstallComplete.ts:175-179');
  console.log('  SERVICE CALL: opaque.startRegistration(request, identityU, identityS)');
  console.log(`  
  const serverRegistrationResponse = await context.services.opaque.startRegistration(
    clientRegistrationStart.request,    // Uint8Array from client
    adminEmail,                         // identityU (client identity) - PARAM 2
    "DarkAuth"                           // identityS (server identity) - PARAM 3
  );
  `);
  
  // Step 3: Service layer calls wrapper (different parameter order!)
  console.log('\n🔄 Step 3: Service calls wrapper with DIFFERENT parameter order');
  console.log('  Location: packages/api/src/services/opaque.ts:54-71');
  console.log('  WRAPPER CALL: opaqueServer.startRegistration(request, identityS, identityU)');
  console.log(`  
  // Service receives: (request, identityU, identityS)
  // Wrapper expects: (request, identityS, identityU) - SWAPPED!
  const result = await opaqueServer.startRegistration(request, identityS, identityU);
  `);
  
  // Step 4: Client finishes registration
  console.log('\n🔐 Step 4: Client finishes registration (postInstallComplete.ts)');
  console.log('  Location: packages/api/src/controllers/install/postInstallComplete.ts:191-197');
  console.log(`  
  const clientRegistrationFinish = await client.finishRegistration(
    serverRegistrationResponse.message,  // Response from server
    clientRegistrationStart.state,       // Client state
    serverPublicKey,                     // Server public key (Uint8Array)
    "DarkAuth",                           // Server identity (STRING)
    adminEmail                          // Client identity (STRING)
  );
  `);
  
  // Step 5: Database storage
  console.log('\n💾 Step 5: Database storage (postInstallComplete.ts)');
  console.log('  Location: packages/api/src/controllers/install/postInstallComplete.ts:211-216');
  console.log(`  
  await context.db.insert(adminOpaqueRecords).values({
    adminId,
    envelope: Buffer.from(clientRegistrationFinish.upload),        // RegistrationRecord
    serverPubkey: Buffer.from(serverRegistrationResponse.serverPublicKey), // From response
    updatedAt: new Date(),
  });
  `);
  
  console.log('\n✅ CRITICAL REGISTRATION FACTS:');
  console.log('  - Server identity is "DarkAuth" (not "DarkAuth-server")');
  console.log('  - Client identity is the admin email address');
  console.log('  - Service layer swaps parameter order vs wrapper');
  console.log('  - Client finishes with STRINGS not arrays for identities');
  console.log('  - Database stores upload (RegistrationRecord) as envelope');
  console.log('  - Database stores serverPublicKey from registration response');
}

// ============================================================================
// PRODUCTION LOGIN FLOW (Admin UI + API)
// ============================================================================

async function demonstrateProductionLoginFlow() {
  console.log('\n\n🔑 DarkAuth PRODUCTION LOGIN FLOW');
  console.log('=' .repeat(50));
  console.log('This shows EXACTLY how DarkAuth handles admin login in production.');
  
  const adminEmail = 'admin@example.com';
  const adminPassword = 'securepassword123';
  
  // Phase 1: Client starts login (Admin UI)
  console.log('\n🔐 Phase 1: Admin UI starts login');
  console.log('  Location: packages/admin-ui/src/services/opaque-cloudflare.ts:82-114');
  console.log(`  
  const client = new CloudflareOpaqueClient(this.config);
  const ke1 = await client.authInit(password);
  
  // Serialize and encode for HTTP transport
  const serialized = ke1.serialize();
  const encoded = toBase64Url(serialized);
  
  return {
    request: encoded,           // base64url string for HTTP
    state: { client, password, email }
  };
  `);
  
  // Phase 2: API receives login start
  console.log('\n🖥️  Phase 2: API processes login start');
  console.log('  Location: packages/api/src/controllers/admin/opaqueLoginStart.ts:45-109');
  console.log(`  
  // Decode base64url to Uint8Array
  const requestBuffer = fromBase64Url(data.request);
  
  // Load user record from database
  const adminUser = await context.db.query.adminUsers.findFirst({
    where: eq(adminUsers.email, data.email),
    with: { opaqueRecord: true }
  });
  
  // Handle PostgreSQL bytea -> Buffer conversion
  const envelopeBuffer = typeof adminUser.opaqueRecord.envelope === "string" 
    ? Buffer.from(adminUser.opaqueRecord.envelope.slice(2), "hex")
    : adminUser.opaqueRecord.envelope;
  
  // Call service
  const loginResponse = await context.services.opaque.startLogin(
    requestBuffer,
    { envelope: new Uint8Array(envelopeBuffer), ... },
    data.email  // identityU
  );
  `);
  
  // Phase 3: Service calls wrapper
  console.log('\n🔄 Phase 3: Service calls wrapper (session management)');
  console.log('  Location: packages/api/src/services/opaque.ts:100-132');
  console.log(`  
  const result = await opaqueServer.startLogin(
    request,                 // KE1 from client
    record.envelope,         // RegistrationRecord
    record.serverPublicKey,  // Server public key
    identityS,              // "DarkAuth" 
    identityU               // admin email
  );
  
  // Store server state for finish step
  const sessionId = toBase64Url(request.slice(0, 16));
  activeSessions.set(sessionId, {
    serverState: result.state,
    identityS,
    identityU,
  });
  `);
  
  // Phase 4: Client finishes login
  console.log('\n🔐 Phase 4: Admin UI finishes login');
  console.log('  Location: packages/admin-ui/src/services/opaque-cloudflare.ts:117-157');
  console.log(`  
  const responseBytes = fromBase64Url(serverResponse);
  const ke2 = KE2.deserialize(this.config, responseBytes);
  
  // CRITICAL: Production uses STRINGS for identities (not arrays)!
  // This must match EXACTLY what was used during registration.
  const serverIdentity = "DarkAuth";
  const clientIdentity = state.email;

  console.log('\ud83d\udd35 ADMIN-UI: Calling authFinish with:');
  console.log('  serverIdentity (string):', serverIdentity);
  console.log('  clientIdentity (string):', clientIdentity);
  console.log('  context: undefined');

  // CRITICAL: authFinish expects undefined as 4th parameter for context
  const result = await state.client.authFinish(ke2, serverIdentity, clientIdentity, undefined);
  
  return {
    request: toBase64Url(result.ke3.serialize()),  // KE3 for server
    sessionKey: result.session_key,
  };
  `);
  
  // Phase 5: API finishes login
  console.log('\n🖥️  Phase 5: API finishes login and creates session');
  console.log('  Location: packages/api/src/controllers/admin/opaqueLoginFinish.ts:50-82');
  console.log(`  
  const finishBuffer = fromBase64Url(data.finish);  // KE3 from client
  
  const loginResult = await context.services.opaque.finishLogin(finishBuffer, sessionId);
  
  // Create admin session and return tokens
  const sessionId = await createSession(context, "admin", {
    adminId: adminUser.id,
    email: adminUser.email,
    name: adminUser.name,
    adminRole: adminUser.role,
  });
  
  // Respond with accessToken (sessionId) and refreshToken in JSON
  `);
  
  console.log('\n✅ CRITICAL LOGIN FACTS:');
  console.log('  - Client uses STRINGS for identities in authFinish (not arrays!)');
  console.log('  - Client passes undefined as 4th parameter (context) to authFinish');
  console.log('  - Server uses strings for identities everywhere');
  console.log('  - Base64url encoding for HTTP transport');
  console.log('  - Session management for multi-step protocol');
  console.log('  - PostgreSQL bytea handling with hex conversion');
  console.log('  - Export key is deterministic (same user+password = same key)');
  console.log('  - Session key is ephemeral (different each login)');
  console.log('  - EnvelopeRecoveryError indicates wrong password or identity mismatch');
}

// ============================================================================
// BUG FIXES AND LESSONS LEARNED
// ============================================================================

function documentCriticalBugFixes() {
  console.log('\n\n🐛 CRITICAL BUG FIXES AND LESSONS LEARNED');
  console.log('=' .repeat(50));
  
  console.log('\n❌ BUG #1: Invalid EC Keypair Generation');
  console.log('  WRONG: const keypair = { private_key: randomBytes(32), public_key: randomBytes(33) }');
  console.log('  RIGHT: const keypair = await generateKeyPair("P256-SHA256")');
  console.log('  ISSUE: Random bytes are not valid elliptic curve keys!');
  
  console.log('\n❌ BUG #2: Array vs String Identity Confusion AND Missing Context Parameter');
  console.log('  WRONG: client.authFinish(ke2, "DarkAuth", email, [])');
  console.log('  WRONG: client.authFinish(ke2, Array.from(encoder.encode("DarkAuth")), Array.from(encoder.encode(email)), [])');
  console.log('  RIGHT: client.authFinish(ke2, "DarkAuth", email, undefined)');
  console.log('  ISSUE: Production uses STRINGS for identities and undefined for context!');
  
  console.log('\n❌ BUG #3: Missing 4th Parameter in authInit');
  console.log('  WRONG: server.authInit(ke1, record, credential_identifier)');
  console.log('  RIGHT: server.authInit(ke1, record, credential_identifier, client_identity)');
  console.log('  ISSUE: Without client_identity, MAC verification fails with "handshake error"');
  
  console.log('\n❌ BUG #4: Parameter Order Mismatch');
  console.log('  SERVICE: startRegistration(request, identityU, identityS)');
  console.log('  WRAPPER: startRegistration(request, identityS, identityU)');
  console.log('  ISSUE: Service layer intentionally swaps parameters vs wrapper');
  
  console.log('\n❌ BUG #5: Server Identity Inconsistency');
  console.log('  DEMO: "DarkAuth-server"');
  console.log('  PROD: "DarkAuth"');
  console.log('  ISSUE: Must be consistent between registration and login');
  
  console.log('\n❌ BUG #6: Wrong Server Public Key Storage');
  console.log('  WRONG: Store server public key from serverSetup()');
  console.log('  RIGHT: Store server public key from registration response');
  console.log('  ISSUE: Different keys cause login failures');
  
  console.log('\n✅ PRODUCTION FIXES IMPLEMENTED:');
  console.log('  1. Proper EC keypair generation using @cloudflare/voprf-ts');
  console.log('  2. Client uses STRINGS for identities and undefined for context in authFinish');
  console.log('  3. Always pass client_identity to authInit');
  console.log('  4. Service layer parameter order documented and consistent');
  console.log('  5. Server identity "DarkAuth" used consistently');
  console.log('  6. Server public key from registration response stored (not serverSetup!)');
  console.log('  7. EnvelopeRecoveryError handling for better user experience');
}

// ============================================================================
// TRANSPORT AND ENCODING DETAILS
// ============================================================================

function documentTransportDetails() {
  console.log('\n\n🌐 TRANSPORT AND ENCODING DETAILS');
  console.log('=' .repeat(50));
  
  console.log('\n📡 HTTP TRANSPORT:');
  console.log('  - All OPAQUE messages transported as base64url strings');
  console.log('  - JSON requests/responses for API communication');
  console.log('  - Uint8Array <-> base64url conversion at API boundaries');
  console.log(`  
  // Client -> Server
  const encoded = toBase64Url(uint8Array);
  
  // Server <- Client  
  const decoded = fromBase64Url(base64urlString);
  `);
  
  console.log('\n💾 DATABASE STORAGE:');
  console.log('  - PostgreSQL bytea columns for binary data');
  console.log('  - Envelope = RegistrationRecord.serialize()');
  console.log('  - ServerPubkey = from registration response (not serverSetup)');
  console.log('  - Hex string format with \\x prefix when retrieved');
  console.log(`  
  // Storage
  envelope: Buffer.from(registrationRecord.serialize())
  serverPubkey: Buffer.from(registrationResponse.serverPublicKey)
  
  // Retrieval (handle hex string format)
  const buffer = typeof record.envelope === "string" 
    ? Buffer.from(record.envelope.slice(2), "hex")
    : record.envelope;
  `);
  
  console.log('\n🔧 UTILITY FUNCTIONS:');
  console.log('  - toBase64Url(): Uint8Array -> base64url string');
  console.log('  - fromBase64Url(): base64url string -> Uint8Array');
  console.log('  - Handle padding and URL-safe character substitution');
  console.log('  - Different implementations in browser vs Node.js');
}

// ============================================================================
// COMMON INTEGRATION PITFALLS
// ============================================================================

function documentCommonPitfalls() {
  console.log('\n\n⚠️  COMMON INTEGRATION PITFALLS');
  console.log('=' .repeat(50));
  
  console.log('\n1. IDENTITY MISMATCH ERRORS:');
  console.log('  - MUST use same identities for registration and login');
  console.log('  - Client identity = user email/identifier');
  console.log('  - Server identity = "DarkAuth" consistently');
  console.log('  - Case sensitive! "DarkAuth" ≠ "DarkAuth-server"');
  
  console.log('\n2. PARAMETER ORDER CONFUSION:');
  console.log('  - Service layer: (request, identityU, identityS)');
  console.log('  - Wrapper layer: (request, identityS, identityU)');
  console.log('  - Library: depends on method (check docs!)');
  
  console.log('\n3. TYPE MISMATCHES:');
  console.log('  - Server methods: expect strings for identities');
  console.log('  - Client authFinish: expects STRINGS for identities (production truth!)');
  console.log('  - HTTP transport: base64url strings');
  console.log('  - Database: Buffer objects');
  
  console.log('\n4. MISSING ERROR HANDLING:');
  console.log('  - Library returns Error objects, not exceptions');
  console.log('  - Always check: if (result instanceof Error) throw result');
  console.log('  - "handshake error" usually means identity/parameter issues');
  
  console.log('\n5. IMPROPER KEY GENERATION:');
  console.log('  - NEVER use randomBytes for EC keypairs');
  console.log('  - Use generateKeyPair from @cloudflare/voprf-ts');
  console.log('  - Store and reuse OPRF seed across server restarts');
  
  console.log('\n6. SESSION MANAGEMENT ISSUES:');
  console.log('  - Login is multi-step: start -> finish');
  console.log('  - Must store server state between steps');
  console.log('  - Clean up sessions after completion/failure');
  
  console.log('\n7. DATABASE SERIALIZATION:');
  console.log('  - Store RegistrationRecord, not CredentialFile');
  console.log('  - Store serverPublicKey from registration response');
  console.log('  - Handle PostgreSQL hex string format correctly');
}

// ============================================================================
// WRAPPER LAYER PARAMETER MAPPING REFERENCE
// ============================================================================

function documentWrapperParameterMapping() {
  console.log('\n\n🔄 WRAPPER LAYER PARAMETER MAPPING REFERENCE');
  console.log('=' .repeat(50));
  console.log('This documents the EXACT parameter flow through all layers.');
  
  console.log('\n🔵 REGISTRATION FLOW:');
  console.log('  1. Client: startRegistration(password, identityU)');
  console.log('     Returns: { request: Uint8Array, state: Uint8Array }');
  
  console.log('\n  2. Service: startRegistration(request, identityU, identityS="DarkAuth")');
  console.log('     Calls wrapper with SWAPPED parameters:');
  console.log('     wrapper.startRegistration(request, identityS, identityU)');
  
  console.log('\n  3. Wrapper: startRegistration(request, identityS, identityU)');
  console.log('     Calls Cloudflare library:');
  console.log('     server.registerInit(RegistrationRequest, identityU)');
  
  console.log('\n  4. Client: finishRegistration(response, state, serverPubkey, identityS, identityU)');
  console.log('     Calls Cloudflare library:');
  console.log('     client.registerFinish(RegistrationResponse, identityS, identityU)');
  
  console.log('\n🔵 LOGIN FLOW:');
  console.log('  1. Client: startLogin(password, identityU)');
  console.log('     Returns: { request: Uint8Array, state: Uint8Array }');
  
  console.log('\n  2. Service: startLogin(request, record, identityU, identityS="DarkAuth")');
  console.log('     Calls wrapper:');
  console.log('     wrapper.startLogin(request, envelope, serverPubkey, identityS, identityU)');
  
  console.log('\n  3. Wrapper: startLogin(request, envelope, serverPubkey, identityS, identityU)');
  console.log('     Calls Cloudflare library:');
  console.log('     server.authInit(KE1, RegistrationRecord, identityU, identityU)');
  console.log('     Note: client_identity is same as credential_identifier');
  
  console.log('\n  4. Client: finishLogin(response, state, serverPubkey, identityS, identityU)');
  console.log('     Calls Cloudflare library with STRINGS:');
  console.log('     client.authFinish(KE2, identityS, identityU, undefined)');
  
  console.log('\n✅ KEY INSIGHTS:');
  console.log('  - Service swaps identityU/identityS vs wrapper for consistency');
  console.log('  - Client authFinish uses STRINGS for identities (not arrays!)');
  console.log('  - Server methods always expect strings for identities');
  console.log('  - client_identity = credential_identifier in authInit');
  console.log('  - Context is undefined (not empty array) for production');
}

// ============================================================================
// RUN ALL DEMONSTRATIONS
// ============================================================================
console.log('🚀 Starting OPAQUE Protocol Demonstrations\n');
console.log('This demonstrates BOTH the basic flow AND the production DarkAuth implementation.\n');

async function runAllDemonstrations() {
  try {
    // Original basic demonstration
    await demonstrateOpaqueFlow();
    
    // Production DarkAuth implementations
    await demonstrateProductionRegistrationFlow();
    await demonstrateProductionLoginFlow();
    
    // Bug fixes and lessons learned
    documentCriticalBugFixes();
    documentTransportDetails();
    documentCommonPitfalls();
    documentWrapperParameterMapping();
    
    console.log('\n\n🎉 ALL DEMONSTRATIONS COMPLETE!');
    console.log('=' .repeat(50));
    console.log('You now have the COMPLETE picture of:');
    console.log('1. How OPAQUE works (basic example)');
    console.log('2. How DarkAuth implements it in production');
    console.log('3. All the bugs we found and fixed');
    console.log('4. Transport and encoding details');
    console.log('5. Common pitfalls to avoid');
    console.log('6. Exact parameter mapping through all layers');
    console.log('\nThis documentation is the DEFINITIVE GUIDE to DarkAuth OPAQUE implementation.');
    
  } catch (error) {
    console.error('\n\n❌ DEMONSTRATION FAILED!');
    console.error('=' .repeat(50));
    console.error('Error:', error.message);
    console.error('\nStack trace:');
    console.error(error.stack);
    console.error('\nPlease check the error and review the implementation details.');
  }
}

runAllDemonstrations();
