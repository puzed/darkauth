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

export async function getOrganizationMembershipsForUser(
  servers: TestServers,
  adminSession: AdminSession,
  userSub: string
): Promise<Array<{ organizationId: string; membershipId: string; status: string }>> {
  const organizationsRes = await fetch(`${servers.adminUrl}/admin/organizations?limit=100`, {
    headers: adminHeaders(servers, adminSession),
  });
  if (!organizationsRes.ok) throw new Error(`failed to list organizations: ${organizationsRes.status}`);
  const organizationsJson = (await organizationsRes.json()) as {
    organizations: Array<{ id?: string; organizationId?: string }>;
  };
  const memberships: Array<{ organizationId: string; membershipId: string; status: string }> = [];
  for (const organization of organizationsJson.organizations) {
    const organizationId = organization.organizationId || organization.id;
    if (!organizationId) continue;
    const membersRes = await fetch(`${servers.adminUrl}/admin/organizations/${organizationId}/members`, {
      headers: adminHeaders(servers, adminSession),
    });
    if (!membersRes.ok) throw new Error(`failed to list organization members: ${membersRes.status}`);
    const membersJson = (await membersRes.json()) as {
      members: Array<{ membershipId: string; userSub: string; status: string }>;
    };
    const member = membersJson.members.find((item) => item.userSub === userSub);
    if (member) {
      memberships.push({
        organizationId,
        membershipId: member.membershipId,
        status: member.status,
      });
    }
  }
  return memberships;
}

export async function getOnlyOrganizationMembershipForUser(
  servers: TestServers,
  adminSession: AdminSession,
  userSub: string
): Promise<{ organizationId: string; membershipId: string; status: string }> {
  const memberships = await getOrganizationMembershipsForUser(servers, adminSession, userSub);
  if (memberships.length !== 1) {
    throw new Error(`expected one organization membership for user ${userSub}, found ${memberships.length}`);
  }
  const membership = memberships[0];
  if (!membership) throw new Error(`expected one organization membership for user ${userSub}`);
  return membership;
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

export async function setOrganizationForceOtp(
  servers: TestServers,
  adminSession: AdminSession,
  organizationId: string,
  forceOtp: boolean
): Promise<void> {
  const res = await fetch(`${servers.adminUrl}/admin/organizations/${organizationId}`, {
    method: 'PUT',
    headers: adminWriteHeaders(servers, adminSession),
    body: JSON.stringify({ forceOtp }),
  });
  if (!res.ok) throw new Error(`failed to update organization force OTP: ${res.status}`);
}
