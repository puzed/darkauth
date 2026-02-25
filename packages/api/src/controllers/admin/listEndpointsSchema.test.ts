import assert from "node:assert/strict";
import { test } from "node:test";
import { AuditLogsListResponseSchema, schema as auditLogsSchema } from "./auditLogs.js";
import { ClientsListResponseSchema, schema as clientsSchema } from "./clients.js";
import { schema as groupUsersSchema } from "./groupUsers.js";
import { LIST_PAGE_MAX, LIST_SEARCH_MAX_LENGTH } from "./listQueryBounds.js";
import { PermissionsListResponseSchema, schema as permissionsSchema } from "./permissions.js";
import { schema as rolesSchema } from "./roles.js";
import { UsersListResponseSchema, schema as usersSchema } from "./users.js";

test("users schema supports standard pagination, search and sorting query fields", () => {
  const parsed = usersSchema.query.parse({
    page: 1,
    limit: 20,
    search: "term",
    sortBy: "email",
    sortOrder: "asc",
  });
  assert.equal(parsed.sortBy, "email");
  assert.equal(parsed.sortOrder, "asc");
});

test("clients schema supports standard pagination, search and sorting query fields", () => {
  const parsed = clientsSchema.query.parse({
    page: 1,
    limit: 20,
    search: "app",
    sortBy: "name",
    sortOrder: "desc",
  });
  assert.equal(parsed.sortBy, "name");
  assert.equal(parsed.sortOrder, "desc");
});

test("roles, permissions and group users schemas expose sorting query fields", () => {
  const roleQuery = rolesSchema.query.parse({ sortBy: "key", sortOrder: "asc" });
  const permissionQuery = permissionsSchema.query.parse({
    sortBy: "description",
    sortOrder: "desc",
  });
  const groupUsersQuery = groupUsersSchema.query.parse({ sortBy: "name", sortOrder: "asc" });
  assert.equal(roleQuery.sortBy, "key");
  assert.equal(permissionQuery.sortBy, "description");
  assert.equal(groupUsersQuery.sortBy, "name");
});

test("users and clients responses require pagination object", () => {
  const usersParsed = UsersListResponseSchema.parse({
    users: [],
    pagination: {
      page: 1,
      limit: 20,
      total: 0,
      totalPages: 0,
      hasNext: false,
      hasPrev: false,
    },
  });
  const clientsParsed = ClientsListResponseSchema.parse({
    clients: [],
    pagination: {
      page: 1,
      limit: 20,
      total: 0,
      totalPages: 0,
      hasNext: false,
      hasPrev: false,
    },
  });
  assert.equal(usersParsed.pagination.page, 1);
  assert.equal(clientsParsed.pagination.limit, 20);
});

test("permissions and audit logs responses require pagination with sort filters support", () => {
  const permissionsParsed = PermissionsListResponseSchema.parse({
    permissions: [],
    pagination: {
      page: 1,
      limit: 20,
      total: 0,
      totalPages: 0,
      hasNext: false,
      hasPrev: false,
    },
  });
  const auditParsed = AuditLogsListResponseSchema.parse({
    auditLogs: [],
    pagination: {
      page: 1,
      limit: 20,
      total: 0,
      totalPages: 0,
      hasNext: false,
      hasPrev: false,
    },
    filters: {
      sortBy: "timestamp",
      sortOrder: "desc",
    },
  });
  assert.equal(permissionsParsed.pagination.total, 0);
  assert.equal(auditParsed.filters.sortBy, "timestamp");
});

test("audit logs schema supports sorting query fields while preserving existing filters", () => {
  const parsed = auditLogsSchema.query.parse({
    page: 1,
    limit: 20,
    eventType: "LOGIN_SUCCESS",
    search: "login",
    sortBy: "eventType",
    sortOrder: "asc",
  });
  assert.equal(parsed.eventType, "LOGIN_SUCCESS");
  assert.equal(parsed.sortBy, "eventType");
});

test("list schemas reject page above max bound", () => {
  assert.throws(() => usersSchema.query.parse({ page: LIST_PAGE_MAX + 1 }));
  assert.throws(() => clientsSchema.query.parse({ page: LIST_PAGE_MAX + 1 }));
  assert.throws(() => auditLogsSchema.query.parse({ page: LIST_PAGE_MAX + 1 }));
});

test("list schemas reject search over max length", () => {
  const longSearch = "a".repeat(LIST_SEARCH_MAX_LENGTH + 1);
  assert.throws(() => usersSchema.query.parse({ search: longSearch }));
  assert.throws(() => clientsSchema.query.parse({ search: longSearch }));
  assert.throws(() => permissionsSchema.query.parse({ search: longSearch }));
  assert.throws(() => auditLogsSchema.query.parse({ search: longSearch }));
});
