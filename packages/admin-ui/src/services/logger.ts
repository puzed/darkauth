const levelMethod: Record<string, keyof Console> = {
  error: "error",
  warn: "warn",
  info: "info",
  debug: "debug",
};

type LogLevel = keyof typeof levelMethod;
type LogDetail = unknown;

function serialize(detail: LogDetail) {
  if (detail == null) return undefined;
  if (detail instanceof Error) {
    return {
      error: {
        name: detail.name,
        message: detail.message,
        stack: detail.stack,
      },
    };
  }
  if (typeof detail === "string") return { detail };
  if (Array.isArray(detail)) return { detail };
  if (typeof detail === "object") return detail as Record<string, unknown>;
  return { detail };
}

function emit(level: LogLevel, detail?: LogDetail, message?: string) {
  const method = levelMethod[level] || "log";
  const payload: Record<string, unknown> = {
    level,
    timestamp: new Date().toISOString(),
  };
  if (message) payload.message = message;
  const extra = serialize(detail);
  if (extra && typeof extra === "object") Object.assign(payload, extra);
  (console[method] || console.log).call(console, JSON.stringify(payload));
}

export const logger = {
  error(detail?: LogDetail, message?: string) {
    emit("error", detail, message);
  },
  warn(detail?: LogDetail, message?: string) {
    emit("warn", detail, message);
  },
  info(detail?: LogDetail, message?: string) {
    emit("info", detail, message);
  },
  debug(detail?: LogDetail, message?: string) {
    emit("debug", detail, message);
  },
};
