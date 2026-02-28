export class AppError extends Error {
  code?: string;
  statusCode: number;

  constructor(message: string, code?: string, statusCode = 500) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

export class ValidationError extends AppError {
  details?: unknown;

  constructor(message: string, details?: unknown) {
    super(message, "VALIDATION_ERROR", 400);
    this.details = details;
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Resource not found") {
    super(message, "NOT_FOUND", 404);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, "CONFLICT", 409);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized") {
    super(message, "UNAUTHORIZED", 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Forbidden") {
    super(message, "FORBIDDEN", 403);
  }
}

export class OAuthError extends AppError {
  error: string;
  error_description?: string;

  constructor(error: string, error_description?: string, statusCode = 400) {
    super(error_description || error, error, statusCode);
    this.error = error;
    this.error_description = error_description;
  }
}

export class InvalidRequestError extends OAuthError {
  constructor(description?: string) {
    super("invalid_request", description, 400);
  }
}

export class UnauthorizedClientError extends OAuthError {
  constructor(description?: string) {
    super("unauthorized_client", description, 401);
  }
}

export class AccessDeniedError extends OAuthError {
  constructor(description?: string) {
    super("access_denied", description, 403);
  }
}

export class UnsupportedResponseTypeError extends OAuthError {
  constructor(description?: string) {
    super("unsupported_response_type", description, 400);
  }
}

export class InvalidGrantError extends OAuthError {
  constructor(description?: string) {
    super("invalid_grant", description, 400);
  }
}

export class ServerError extends OAuthError {
  constructor(description?: string) {
    super("server_error", description, 500);
  }
}

export class InstallError extends AppError {
  constructor(message: string, code: string) {
    super(message, code, 403);
  }
}

export class ForbiddenInstallTokenError extends InstallError {
  constructor() {
    super("Invalid install token", "FORBIDDEN_INSTALL_TOKEN");
  }
}

export class ExpiredInstallTokenError extends InstallError {
  constructor() {
    super("Install token has expired", "EXPIRED_INSTALL_TOKEN");
  }
}

export class AlreadyInitializedError extends InstallError {
  constructor() {
    super("System is already initialized", "ALREADY_INITIALIZED");
  }
}

export class TooManyRequestsError extends AppError {
  constructor(message = "Too many requests") {
    super(message, "TOO_MANY_REQUESTS", 429);
  }
}
