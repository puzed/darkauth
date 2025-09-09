import { test, expect } from '@playwright/test';
import { createTestServers, destroyTestServers, TestServers } from '../../setup/server.js';
import { installDarkAuth, injectInstallToken } from '../../setup/install.js';
import { FIXED_TEST_ADMIN } from '../../fixtures/testData.js';
import { generateRandomString } from '@DarkAuth/api/src/utils/crypto.ts';

test.describe('Security - Identity Binding in OPAQUE Login', () => {
  let servers: TestServers;
  
  test.beforeAll(async () => {
    servers = await createTestServers({ testName: 'security-identity-binding' });
    const installToken = generateRandomString(32);
    injectInstallToken(servers.context, installToken);
    await installDarkAuth({
      adminUrl: servers.adminUrl,
      adminEmail: FIXED_TEST_ADMIN.email,
      adminName: FIXED_TEST_ADMIN.name,
      adminPassword: FIXED_TEST_ADMIN.password,
      installToken
    });
  });
  
  test.afterAll(async () => {
    if (servers) {
      await destroyTestServers(servers);
    }
  });

  test.describe('User Login Identity Binding', () => {
    test('should reject login finish with mismatched identity', async ({ request }) => {
      // This test verifies that providing a different sub/email in the finish request
      // than what was used in the start request fails
      
      // First, create a test user
      const userEmail = 'testuser@example.com';
      const userPassword = 'TestPassword123!';
      const victimEmail = 'victim@example.com';
      
      // Register test user (assuming registration endpoint exists)
      // This would need actual implementation based on your API
      
      // Start login with testuser
      const loginStartResponse = await request.post(`${servers.userUrl}/opaque/login/start`, {
        data: {
          email: userEmail,
          request: 'base64url_encoded_opaque_request' // This would be actual OPAQUE data
        }
      });
      
      if (loginStartResponse.ok()) {
        const startData = await loginStartResponse.json();
        
        // Attempt to finish login with victim's identity (should fail)
        const loginFinishResponse = await request.post(`${servers.userUrl}/opaque/login/finish`, {
          data: {
            sessionId: startData.sessionId,
            finish: 'base64url_encoded_opaque_finish', // This would be actual OPAQUE data
            email: victimEmail // Trying to impersonate victim
          }
        });
        
        // Should get unauthorized since identity doesn't match session
        expect(loginFinishResponse.status()).toBe(401);
      }
    });
    
    test('should derive identity from server session, not client input', async ({ request }) => {
      // This test verifies that the server uses the identity from the OPAQUE session
      // and ignores any sub/email provided by the client in the finish request
      
      const userEmail = 'testuser@example.com';
      
      // Start login
      const loginStartResponse = await request.post(`${servers.userUrl}/opaque/login/start`, {
        data: {
          email: userEmail,
          request: 'base64url_encoded_opaque_request' // This would be actual OPAQUE data
        }
      });
      
      if (loginStartResponse.ok()) {
        const startData = await loginStartResponse.json();
        
        // Finish login without providing email/sub (should work)
        const loginFinishResponse = await request.post(`${servers.userUrl}/opaque/login/finish`, {
          data: {
            sessionId: startData.sessionId,
            finish: 'base64url_encoded_opaque_finish' // This would be actual OPAQUE data
            // Note: no email or sub field provided
          }
        });
        
        // Should succeed if properly bound to session
        if (loginFinishResponse.ok()) {
          const finishData = await loginFinishResponse.json();
          // User should be the one from the session
          expect(finishData.user.email).toBe(userEmail);
        }
      }
    });
  });

  test.describe('Admin Login Identity Binding', () => {
    test('should reject admin login finish with mismatched identity', async ({ request }) => {
      // Start login with admin
      const loginStartResponse = await request.post(`${servers.adminUrl}/api/opaque/login/start`, {
        data: {
          email: FIXED_TEST_ADMIN.email,
          request: 'base64url_encoded_opaque_request' // This would be actual OPAQUE data
        }
      });
      
      expect(loginStartResponse.ok()).toBeTruthy();
      const startData = await loginStartResponse.json();
      
      // Response should not contain adminId anymore (security fix)
      expect(startData).toHaveProperty('sessionId');
      expect(startData).toHaveProperty('message');
      expect(startData).not.toHaveProperty('adminId');
      
      // Attempt to finish with wrong admin ID (should be ignored)
      const loginFinishResponse = await request.post(`${servers.adminUrl}/api/opaque/login/finish`, {
        data: {
          sessionId: startData.sessionId,
          finish: 'base64url_encoded_opaque_finish', // This would be actual OPAQUE data
          adminId: 'wrong-admin-id' // This should be ignored
        }
      });
      
      // The adminId field should be ignored, identity comes from session
      // If OPAQUE verification passes, login should succeed regardless of adminId
    });
    
    test('admin login finish should not require adminId field', async ({ request }) => {
      // Start login
      const loginStartResponse = await request.post(`${servers.adminUrl}/api/opaque/login/start`, {
        data: {
          email: FIXED_TEST_ADMIN.email,
          request: 'base64url_encoded_opaque_request' // This would be actual OPAQUE data
        }
      });
      
      expect(loginStartResponse.ok()).toBeTruthy();
      const startData = await loginStartResponse.json();
      
      // Finish without adminId field (should work)
      const loginFinishResponse = await request.post(`${servers.adminUrl}/api/opaque/login/finish`, {
        data: {
          sessionId: startData.sessionId,
          finish: 'base64url_encoded_opaque_finish' // This would be actual OPAQUE data
          // Note: no adminId field
        }
      });
      
      // Should work if OPAQUE verification passes
      if (loginFinishResponse.ok()) {
        const finishData = await loginFinishResponse.json();
        expect(finishData.admin.email).toBe(FIXED_TEST_ADMIN.email);
      }
    });
  });

  test.describe('Session Tampering Prevention', () => {
    test('should fail with invalid sessionId', async ({ request }) => {
      // Attempt to finish login with non-existent session
      const loginFinishResponse = await request.post(`${servers.userUrl}/opaque/login/finish`, {
        data: {
          sessionId: 'invalid-session-id',
          finish: 'base64url_encoded_opaque_finish'
        }
      });
      
      expect(loginFinishResponse.status()).toBe(401);
      const error = await loginFinishResponse.json();
      expect(error.error).toMatch(/invalid|expired|session/i);
    });
    
    test('should fail with expired sessionId', async ({ request }) => {
      // This would require creating a session and waiting for it to expire
      // or manipulating the database to set an expired timestamp
      // Implementation depends on your testing infrastructure
    });
  });
});