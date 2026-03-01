import type { TestServers } from '../server.js';

type AdminSession = { cookieHeader: string; csrfToken: string };

function adminHeaders(servers: TestServers, adminSession: AdminSession): Record<string, string> {
  return {
    Cookie: adminSession.cookieHeader,
    Origin: servers.adminUrl,
  };
}

function adminWriteHeaders(
  servers: TestServers,
  adminSession: AdminSession
): Record<string, string> {
  return {
    ...adminHeaders(servers, adminSession),
    'Content-Type': 'application/json',
    'x-csrf-token': adminSession.csrfToken,
  };
}

export async function getDefaultOrganizationId(
  servers: TestServers,
  adminSession: AdminSession
): Promise<string> {
  const res = await fetch(`${servers.adminUrl}/admin/organizations`, {
    headers: adminHeaders(servers, adminSession),
  });
  if (!res.ok) throw new Error(`failed to list organizations: ${res.status}`);
  const json = (await res.json()) as { organizations: Array<{ id: string; slug: string }> };
  const org = json.organizations.find((item) => item.slug === 'default');
  if (!org) throw new Error('default organization not found');
  return org.id;
}

export async function getRoleIdByKey(
  servers: TestServers,
  adminSession: AdminSession,
  roleKey: string
): Promise<string> {
  const res = await fetch(`${servers.adminUrl}/admin/roles`, {
    headers: adminHeaders(servers, adminSession),
  });
  if (!res.ok) throw new Error(`failed to list roles: ${res.status}`);
  const json = (await res.json()) as { roles: Array<{ id: string; key: string }> };
  const role = json.roles.find((item) => item.key === roleKey);
  if (!role) throw new Error(`role not found: ${roleKey}`);
  return role.id;
}

export async function getOrganizationMemberIdForUser(
  servers: TestServers,
  adminSession: AdminSession,
  organizationId: string,
  userSub: string
): Promise<string> {
  const res = await fetch(`${servers.adminUrl}/admin/organizations/${organizationId}/members`, {
    headers: adminHeaders(servers, adminSession),
  });
  if (!res.ok) throw new Error(`failed to list organization members: ${res.status}`);
  const json = (await res.json()) as { members: Array<{ membershipId: string; userSub: string }> };
  const member = json.members.find((item) => item.userSub === userSub);
  if (!member) throw new Error(`member not found for user ${userSub}`);
  return member.membershipId;
}

export async function setOrganizationMemberRoles(
  servers: TestServers,
  adminSession: AdminSession,
  organizationId: string,
  memberId: string,
  roleIds: string[]
): Promise<void> {
  const res = await fetch(`${servers.adminUrl}/admin/organizations/${organizationId}/members/${memberId}/roles`, {
    method: 'PUT',
    headers: adminWriteHeaders(servers, adminSession),
    body: JSON.stringify({ roleIds }),
  });
  if (!res.ok) throw new Error(`failed to update member roles: ${res.status}`);
}

export async function addOrganizationMember(
  servers: TestServers,
  adminSession: AdminSession,
  organizationId: string,
  userSub: string
): Promise<string> {
  const res = await fetch(`${servers.adminUrl}/admin/organizations/${organizationId}/members`, {
    method: 'POST',
    headers: adminWriteHeaders(servers, adminSession),
    body: JSON.stringify({ userSub }),
  });
  if (!res.ok) throw new Error(`failed to add organization member: ${res.status}`);
  const json = (await res.json()) as { membershipId: string };
  return json.membershipId;
}

export async function removeOrganizationMember(
  servers: TestServers,
  adminSession: AdminSession,
  organizationId: string,
  memberId: string
): Promise<void> {
  const res = await fetch(`${servers.adminUrl}/admin/organizations/${organizationId}/members/${memberId}`, {
    method: 'DELETE',
    headers: {
      ...adminHeaders(servers, adminSession),
      'x-csrf-token': adminSession.csrfToken,
    },
  });
  if (!res.ok) throw new Error(`failed to remove organization member: ${res.status}`);
}
