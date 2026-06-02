import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { genericErrors } from "../../http/openapi-helpers.ts";
import {
  assignMemberRoles,
  createOrganization,
  createOrganizationInvite,
  deleteOrganization,
  leaveOrganization,
  listAssignableRoles,
  listOrganizationMembers,
  listOrganizationsForUser,
  removeMemberRole,
  removeOrganizationMember,
  requireOrganizationMembership,
} from "../../models/organizations.ts";
import { requireSession } from "../../services/sessions.ts";
import type { Context, ControllerSchema } from "../../types.ts";
import { withAudit } from "../../utils/auditWrapper.ts";
import { parseJsonSafely, readBody, sendJson } from "../../utils/http.ts";

const OrganizationSchema = z.object({
  organizationId: z.string().uuid(),
  slug: z.string(),
  name: z.string(),
  forceOtp: z.boolean(),
  membershipId: z.string().uuid(),
  status: z.string(),
});

const RoleSummarySchema = z.object({
  id: z.string().uuid(),
  key: z.string(),
  name: z.string(),
});

const OrganizationListItemSchema = OrganizationSchema.extend({
  roles: z.array(RoleSummarySchema),
});

const MemberRoleSchema = RoleSummarySchema.extend({
  grantsOrgManage: z.boolean().optional(),
});

const MemberSchema = z.object({
  membershipId: z.string().uuid(),
  userSub: z.string(),
  status: z.string(),
  email: z.string().nullable().optional(),
  name: z.string().nullable().optional(),
  roles: z.array(MemberRoleSchema),
});

const AssignableRoleSchema = z.object({
  id: z.string().uuid(),
  key: z.string(),
  name: z.string(),
  description: z.string().nullable().optional(),
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
  eventType: "USER_ORG_CREATE",
  resourceType: "organization",
  extractResourceId: (_body: unknown, _params: string[]) => undefined,
  extractAuditContext: (_body, responseData) => {
    const org =
      responseData && typeof responseData === "object"
        ? (responseData as { organization?: { organizationId?: string } }).organization
        : undefined;
    return org?.organizationId ? { organizationId: org.organizationId } : undefined;
  },
})(async function postOrganizations(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse
) {
  const session = await requireSession(context, request, false);
  const body = parseJsonSafely(await readBody(request));
  const Req = z.object({
    name: z.string().min(1),
    slug: z.string().optional(),
    forceOtp: z.boolean().optional(),
  });
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

export async function getOrganizationAssignableRoles(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  organizationId: string
) {
  const session = await requireSession(context, request, false);
  const roles = await listAssignableRoles(context, session.sub as string, organizationId);
  sendJson(response, 200, { roles });
}

export const postOrganizationInvites = withAudit({
  eventType: "USER_ORG_MEMBER_ADD",
  resourceType: "organization_invite",
  extractAuditContext: (_body, _responseData, params) => ({ organizationId: params[0] }),
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
  eventType: "USER_ORG_MEMBER_ROLE_ADD",
  resourceType: "organization_member",
  extractResourceId: (_body: unknown, params: string[]) => params[1],
  extractAuditContext: (_body, _responseData, params) => ({ organizationId: params[0] }),
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
  eventType: "USER_ORG_MEMBER_ROLE_REMOVE",
  resourceType: "organization_member",
  extractResourceId: (_body: unknown, params: string[]) => params[1],
  extractAuditContext: (_body, _responseData, params) => ({ organizationId: params[0] }),
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

export const deleteOrganizationMember = withAudit({
  eventType: "USER_ORG_MEMBER_REMOVE",
  resourceType: "organization_member",
  extractResourceId: (_body: unknown, params: string[]) => params[1],
  extractAuditContext: (_body, _responseData, params) => ({ organizationId: params[0] }),
})(async function deleteOrganizationMember(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  organizationId: string,
  memberId: string
) {
  const session = await requireSession(context, request, false);
  const result = await removeOrganizationMember(
    context,
    session.sub as string,
    organizationId,
    memberId
  );
  sendJson(response, 200, result);
});

export const postOrganizationLeave = withAudit({
  eventType: "USER_ORG_LEAVE",
  resourceType: "organization",
  extractResourceId: (_body: unknown, params: string[]) => params[0],
  extractAuditContext: (_body, _responseData, params) => ({ organizationId: params[0] }),
})(async function postOrganizationLeave(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  organizationId: string
) {
  const session = await requireSession(context, request, false);
  const result = await leaveOrganization(context, session.sub as string, organizationId);
  sendJson(response, 200, result);
});

export const deleteOrganizationController = withAudit({
  eventType: "USER_ORG_DELETE",
  resourceType: "organization",
  extractResourceId: (_body: unknown, params: string[]) => params[0],
  extractAuditContext: (_body, _responseData, params) => ({ organizationId: params[0] }),
})(async function deleteOrganizationController(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  organizationId: string
) {
  const session = await requireSession(context, request, false);
  const body = parseJsonSafely(await readBody(request));
  const Req = z.object({ confirm: z.literal(true) });
  Req.parse(body);
  const result = await deleteOrganization(context, session.sub as string, organizationId);
  sendJson(response, 200, result);
});

export const organizationsSchema = {
  method: "GET",
  path: "/organizations",
  tags: ["Organizations"],
  summary: "List organizations",
  description:
    "Lists the current user's active organization memberships with role summaries for app switcher UIs.",
  responses: {
    200: {
      description: "OK",
      content: {
        "application/json": {
          schema: z.object({ organizations: z.array(OrganizationListItemSchema) }),
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
    schema: z.object({
      name: z.string().min(1),
      slug: z.string().optional(),
      forceOtp: z.boolean().optional(),
    }),
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

export const organizationAssignableRolesSchema = {
  method: "GET",
  path: "/organizations/{organizationId}/roles/assignable",
  tags: ["Organizations"],
  summary: "List assignable organization roles",
  params: z.object({ organizationId: z.string().uuid() }),
  responses: {
    200: {
      description: "OK",
      content: {
        "application/json": {
          schema: z.object({ roles: z.array(AssignableRoleSchema) }),
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

export const organizationMemberDeleteSchema = {
  method: "DELETE",
  path: "/organizations/{organizationId}/members/{memberId}",
  tags: ["Organizations"],
  summary: "Remove organization member",
  params: z.object({ organizationId: z.string().uuid(), memberId: z.string().uuid() }),
  responses: {
    200: {
      description: "OK",
      content: { "application/json": { schema: z.object({ success: z.boolean() }) } },
    },
    ...genericErrors,
  },
} as const satisfies ControllerSchema;

export const organizationLeaveSchema = {
  method: "POST",
  path: "/organizations/{organizationId}/leave",
  tags: ["Organizations"],
  summary: "Leave organization",
  params: z.object({ organizationId: z.string().uuid() }),
  responses: {
    200: {
      description: "OK",
      content: { "application/json": { schema: z.object({ success: z.boolean() }) } },
    },
    ...genericErrors,
  },
} as const satisfies ControllerSchema;

export const organizationDeleteSchema = {
  method: "DELETE",
  path: "/organizations/{organizationId}",
  tags: ["Organizations"],
  summary: "Delete organization",
  params: z.object({ organizationId: z.string().uuid() }),
  body: {
    description: "",
    required: true,
    contentType: "application/json",
    schema: z.object({ confirm: z.literal(true) }),
  },
  responses: {
    200: {
      description: "OK",
      content: { "application/json": { schema: z.object({ success: z.boolean() }) } },
    },
    ...genericErrors,
  },
} as const satisfies ControllerSchema;
