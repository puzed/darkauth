type LogLevel = "error" | "warn" | "info" | "debug";
type LogDetails = unknown;

const levelMethod: Record<LogLevel, (...data: unknown[]) => void> = {
  error: console.error.bind(console),
  warn: console.warn.bind(console),
  info: console.info.bind(console),
  debug: console.debug.bind(console),
};

function serialize(details: LogDetails) {
  if (details == null) return undefined;
  if (details instanceof Error) {
    return {
      error: {
        name: details.name,
        message: details.message,
        stack: details.stack,
      },
    };
  }
  if (typeof details === "string") return { detail: details };
  if (Array.isArray(details)) return { detail: details };
  if (typeof details === "object") return details as Record<string, unknown>;
  return { detail: details };
}

function emit(level: LogLevel, details?: LogDetails, message?: string) {
  const payload: Record<string, unknown> = {
    level,
    timestamp: new Date().toISOString(),
  };
  if (message) payload.message = message;
  const extra = serialize(details);
  if (extra && typeof extra === "object") Object.assign(payload, extra);
  levelMethod[level](JSON.stringify(payload));
}

export const logger = {
  error(details?: LogDetails, message?: string) {
    emit("error", details, message);
  },
  warn(details?: LogDetails, message?: string) {
    emit("warn", details, message);
  },
  info(details?: LogDetails, message?: string) {
    emit("info", details, message);
  },
  debug(details?: LogDetails, message?: string) {
    emit("debug", details, message);
  },
};
