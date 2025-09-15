import { test, expect } from '@playwright/test';
import { createTestServers, destroyTestServers, type TestServers } from '../../setup/server.js';
import { installDarkAuth } from '../../setup/install.js';
import { FIXED_TEST_ADMIN } from '../../fixtures/testData.js';
import { getAdminBearerToken } from '../../setup/helpers/auth.js';

test.describe('API - OTP Group Policy', () => {
  let servers: TestServers;
  let adminToken: string;

  test.beforeAll(async () => {
    servers = await createTestServers({ testName: 'api-otp-group-policy' });
    await installDarkAuth({
      adminUrl: servers.adminUrl,
      adminEmail: FIXED_TEST_ADMIN.email,
      adminName: FIXED_TEST_ADMIN.name,
      adminPassword: FIXED_TEST_ADMIN.password,
      installToken: 'test-install-token'
    });
    adminToken = await getAdminBearerToken(servers, { email: FIXED_TEST_ADMIN.email, password: FIXED_TEST_ADMIN.password });
  });

  test.afterAll(async () => {
    if (servers) await destroyTestServers(servers);
  });

  test('Default group has requireOtp field and can be toggled', async () => {
    const listRes = await fetch(`${servers.adminUrl}/admin/groups`, {
      headers: { Authorization: `Bearer ${adminToken}`, Origin: servers.adminUrl }
    });
    expect(listRes.ok).toBeTruthy();
    const listJson = await listRes.json() as { groups: Array<{ key: string; requireOtp?: boolean }> };
    const def = listJson.groups.find(g => g.key === 'default');
    expect(def).toBeTruthy();

    const current = Boolean(def?.requireOtp);
    const updRes = await fetch(`${servers.adminUrl}/admin/groups/default`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}`, Origin: servers.adminUrl },
      body: JSON.stringify({ requireOtp: !current })
    });
    expect(updRes.ok).toBeTruthy();

    const listRes2 = await fetch(`${servers.adminUrl}/admin/groups`, {
      headers: { Authorization: `Bearer ${adminToken}`, Origin: servers.adminUrl }
    });
    expect(listRes2.ok).toBeTruthy();
    const listJson2 = await listRes2.json() as { groups: Array<{ key: string; requireOtp?: boolean }> };
    const def2 = listJson2.groups.find(g => g.key === 'default');
    expect(def2?.requireOtp).toBe(!current);
  });

  test('Creating group with requireOtp false persists', async () => {
    const key = `grp-${Date.now().toString(36)}`;
    const createRes = await fetch(`${servers.adminUrl}/admin/groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}`, Origin: servers.adminUrl },
      body: JSON.stringify({ key, name: 'OTP Optional', enableLogin: true, requireOtp: false })
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json() as { group: { key: string; requireOtp?: boolean } };
    expect(created.group.key).toBe(key);
    expect(created.group.requireOtp === undefined || created.group.requireOtp === false).toBeTruthy();
  });

  test('Updating group to requireOtp true persists', async () => {
    const key = `grp2-${Date.now().toString(36)}`;
    const createRes = await fetch(`${servers.adminUrl}/admin/groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}`, Origin: servers.adminUrl },
      body: JSON.stringify({ key, name: 'OTP Required', enableLogin: true, requireOtp: false })
    });
    expect(createRes.status).toBe(201);

    const updRes = await fetch(`${servers.adminUrl}/admin/groups/${key}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}`, Origin: servers.adminUrl },
      body: JSON.stringify({ requireOtp: true })
    });
    expect(updRes.ok).toBeTruthy();

    const listRes = await fetch(`${servers.adminUrl}/admin/groups`, {
      headers: { Authorization: `Bearer ${adminToken}`, Origin: servers.adminUrl }
    });
    expect(listRes.ok).toBeTruthy();
    const listJson = await listRes.json() as { groups: Array<{ key: string; requireOtp?: boolean }> };
    const row = listJson.groups.find(g => g.key === key);
    expect(row?.requireOtp).toBe(true);
  });
});

