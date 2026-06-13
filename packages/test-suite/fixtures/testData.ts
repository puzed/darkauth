import { randomBytes } from 'node:crypto';

export interface TestUser {
  username: string;
  email: string;
  password: string;
  name: string;
}

export interface TestAdmin {
  email: string;
  name: string;
  password: string;
}

function randomId(): string {
  return randomBytes(4).toString('hex');
}

export function createTestAdmin(overrides: Partial<TestAdmin> = {}): TestAdmin {
  return {
    email: `admin_${randomId()}@test.com`,
    name: `Test Admin ${randomId()}`,
    password: 'AdminTestPass123!',
    ...overrides
  };
}

export function createTestUser(overrides: Partial<TestUser> = {}): TestUser {
  return {
    username: `user_${randomId()}`,
    email: `user_${randomId()}@test.com`,
    password: 'UserTestPass123!',
    name: `Test User ${randomId()}`,
    ...overrides
  };
}

// Fixed test data for consistent testing
export const FIXED_TEST_ADMIN: TestAdmin = {
  email: 'admin@example.com',
  name: 'Test Admin',
  password: 'SecureAdminPass123!'
};

export const FIXED_TEST_USER: TestUser = {
  username: 'testuser',
  email: 'test-user@example.com',
  password: 'SecureUserPass123!',
  name: 'Test User'
};
