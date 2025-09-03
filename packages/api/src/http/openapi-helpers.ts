export const genericErrors = {
  400: {
    description: "Bad Request",
    content: {
      "application/json": {
        schema: { $ref: "#/components/schemas/ValidationErrorResponse" },
      },
    },
  },
  401: {
    description: "Unauthorized",
    content: {
      "application/json": {
        schema: { $ref: "#/components/schemas/UnauthorizedResponse" },
      },
    },
  },
  403: {
    description: "Forbidden",
    content: {
      "application/json": {
        schema: { $ref: "#/components/schemas/ForbiddenResponse" },
      },
    },
  },
  404: {
    description: "Not Found",
    content: {
      "application/json": {
        schema: { $ref: "#/components/schemas/NotFoundResponse" },
      },
    },
  },
  429: {
    description: "Too Many Requests",
    content: {
      "application/json": {
        schema: { $ref: "#/components/schemas/TooManyRequestsResponse" },
      },
    },
  },
  500: {
    description: "Internal Server Error",
    content: {
      "application/json": {
        schema: { $ref: "#/components/schemas/ErrorResponse" },
      },
    },
  },
} as const;
