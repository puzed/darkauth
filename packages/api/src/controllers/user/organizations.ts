import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { genericErrors } from "../../http/openapi-helpers.js";
import {
  assignMemberRoles,
  createOrganization,
  createOrganizationInvite,
  listOrganizationMembers,
  listOrganizationsForUser,
  removeMemberRole,
  requireOrganizationMembership,
} from "../../models/organizations.js";
import { requireSession } from "../../services/sessions.js";
import type { Context, ControllerSchema } from "../../types.js";
import { withAudit } from "../../utils/auditWrapper.js";
import { parseJsonSafely, readBody, sendJson } from "../../utils/http.js";

const OrganizationSchema = z.object({
  organizationId: z.string().uuid(),
  slug: z.string(),
  name: z.string(),
  membershipId: z.string().uuid(),
  status: z.string(),
});

const MemberSchema = z.object({
  membershipId: z.string().uuid(),
  userSub: z.string(),
  status: z.string(),
  email: z.string().nullable().optional(),
  name: z.string().nullable().optional(),
  roles: z.array(
    z.object({
      id: z.string().uuid(),
      key: z.string(),
      name: z.string(),
    })
  ),
});

export async function getOrganizations(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse
) {
  const session = await requireSession(context, request, false);
  const organizations = await listOrganizationsForUser(context, session.sub as string);
  sendJson(response, 200, { organizations });
}

export const postOrganizations = withAudit({
  eventType: "ORGANIZATION_CREATE",
  resourceType: "organization",
})(async function postOrganizations(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse
) {
  const session = await requireSession(context, request, false);
  const body = parseJsonSafely(await readBody(request));
  const Req = z.object({ name: z.string().min(1), slug: z.string().optional() });
  const parsed = Req.parse(body);
  const organization = await createOrganization(context, session.sub as string, parsed);
  sendJson(response, 201, { organization });
});

export async function getOrganization(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  organizationId: string
) {
  const session = await requireSession(context, request, false);
  const org = await requireOrganizationMembership(context, session.sub as string, organizationId);
  sendJson(response, 200, { organization: org });
}

export async function getOrganizationMembers(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  organizationId: string
) {
  const session = await requireSession(context, request, false);
  const members = await listOrganizationMembers(context, session.sub as string, organizationId);
  sendJson(response, 200, { members });
}

export const postOrganizationInvites = withAudit({
  eventType: "ORGANIZATION_INVITE_CREATE",
  resourceType: "organization_invite",
})(async function postOrganizationInvites(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  organizationId: string
) {
  const session = await requireSession(context, request, false);
  const body = parseJsonSafely(await readBody(request));
  const Req = z.object({
    email: z.string().email(),
    roleIds: z.array(z.string().uuid()).optional(),
    expiresAt: z.coerce.date().optional(),
  });
  const parsed = Req.parse(body);
  const invite = await createOrganizationInvite(
    context,
    session.sub as string,
    organizationId,
    parsed
  );
  sendJson(response, 201, { invite });
});

export const postOrganizationMemberRoles = withAudit({
  eventType: "ORGANIZATION_MEMBER_ROLES_ASSIGN",
  resourceType: "organization_member",
})(async function postOrganizationMemberRoles(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  organizationId: string,
  memberId: string
) {
  const session = await requireSession(context, request, false);
  const body = parseJsonSafely(await readBody(request));
  const Req = z
    .object({
      roleIds: z.array(z.string().uuid()).optional(),
      roleId: z.string().uuid().optional(),
    })
    .refine((data) => (data.roleIds && data.roleIds.length > 0) || data.roleId, {
      message: "Provide roleIds or roleId",
    });
  const parsed = Req.parse(body);
  const roleIds = parsed.roleIds || (parsed.roleId ? [parsed.roleId] : []);
  const assigned = await assignMemberRoles(
    context,
    session.sub as string,
    organizationId,
    memberId,
    roleIds
  );
  sendJson(response, 200, { assigned });
});

export const deleteOrganizationMemberRole = withAudit({
  eventType: "ORGANIZATION_MEMBER_ROLE_REMOVE",
  resourceType: "organization_member",
})(async function deleteOrganizationMemberRole(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  organizationId: string,
  memberId: string,
  roleId: string
) {
  const session = await requireSession(context, request, false);
  const result = await removeMemberRole(
    context,
    session.sub as string,
    organizationId,
    memberId,
    roleId
  );
  sendJson(response, 200, result);
});

export const organizationsSchema = {
  method: "GET",
  path: "/organizations",
  tags: ["Organizations"],
  summary: "List organizations",
  responses: {
    200: {
      description: "OK",
      content: {
        "application/json": {
          schema: z.object({ organizations: z.array(OrganizationSchema) }),
        },
      },
    },
    ...genericErrors,
  },
} as const satisfies ControllerSchema;

export const createOrganizationSchema = {
  method: "POST",
  path: "/organizations",
  tags: ["Organizations"],
  summary: "Create organization",
  body: {
    description: "",
    required: true,
    contentType: "application/json",
    schema: z.object({ name: z.string().min(1), slug: z.string().optional() }),
  },
  responses: {
    201: {
      description: "Created",
      content: {
        "application/json": {
          schema: z.object({
            organization: OrganizationSchema,
          }),
        },
      },
    },
    ...genericErrors,
  },
} as const satisfies ControllerSchema;

export const organizationSchema = {
  method: "GET",
  path: "/organizations/{organizationId}",
  tags: ["Organizations"],
  summary: "Get organization",
  params: z.object({ organizationId: z.string().uuid() }),
  responses: {
    200: {
      description: "OK",
      content: {
        "application/json": {
          schema: z.object({ organization: OrganizationSchema }),
        },
      },
    },
    ...genericErrors,
  },
} as const satisfies ControllerSchema;

export const organizationMembersSchema = {
  method: "GET",
  path: "/organizations/{organizationId}/members",
  tags: ["Organizations"],
  summary: "List organization members",
  params: z.object({ organizationId: z.string().uuid() }),
  responses: {
    200: {
      description: "OK",
      content: {
        "application/json": {
          schema: z.object({ members: z.array(MemberSchema) }),
        },
      },
    },
    ...genericErrors,
  },
} as const satisfies ControllerSchema;

export const organizationInvitesSchema = {
  method: "POST",
  path: "/organizations/{organizationId}/invites",
  tags: ["Organizations"],
  summary: "Create organization invite",
  params: z.object({ organizationId: z.string().uuid() }),
  body: {
    description: "",
    required: true,
    contentType: "application/json",
    schema: z.object({
      email: z.string().email(),
      roleIds: z.array(z.string().uuid()).optional(),
      expiresAt: z.string().optional(),
    }),
  },
  responses: {
    201: {
      description: "Created",
      content: {
        "application/json": {
          schema: z.object({
            invite: z.object({
              id: z.string().uuid(),
              email: z.string(),
              expiresAt: z.union([z.string(), z.date()]),
              token: z.string(),
            }),
          }),
        },
      },
    },
    ...genericErrors,
  },
} as const satisfies ControllerSchema;

export const organizationMemberRolesSchema = {
  method: "POST",
  path: "/organizations/{organizationId}/members/{memberId}/roles",
  tags: ["Organizations"],
  summary: "Assign roles to member",
  params: z.object({ organizationId: z.string().uuid(), memberId: z.string().uuid() }),
  body: {
    description: "",
    required: true,
    contentType: "application/json",
    schema: z
      .object({
        roleIds: z.array(z.string().uuid()).optional(),
        roleId: z.string().uuid().optional(),
      })
      .refine((data) => (data.roleIds && data.roleIds.length > 0) || data.roleId, {
        message: "Provide roleIds or roleId",
      }),
  },
  responses: {
    200: {
      description: "OK",
      content: {
        "application/json": {
          schema: z.object({
            assigned: z.array(
              z.object({ id: z.string().uuid(), key: z.string(), name: z.string() })
            ),
          }),
        },
      },
    },
    ...genericErrors,
  },
} as const satisfies ControllerSchema;

export const organizationMemberRoleDeleteSchema = {
  method: "DELETE",
  path: "/organizations/{organizationId}/members/{memberId}/roles/{roleId}",
  tags: ["Organizations"],
  summary: "Remove role from member",
  params: z.object({
    organizationId: z.string().uuid(),
    memberId: z.string().uuid(),
    roleId: z.string().uuid(),
  }),
  responses: {
    200: {
      description: "OK",
      content: {
        "application/json": {
          schema: z.object({ success: z.boolean() }),
        },
      },
    },
    ...genericErrors,
  },
} as const satisfies ControllerSchema;
