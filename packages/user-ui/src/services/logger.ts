const methodByLevel: Record<string, keyof Console> = {
  error: "error",
  warn: "warn",
  info: "info",
  debug: "debug",
};

type Level = keyof typeof methodByLevel;
type Detail = unknown;

function format(detail: Detail) {
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

function emit(level: Level, detail?: Detail, message?: string) {
  const method = methodByLevel[level] || "log";
  const payload: Record<string, unknown> = {
    level,
    timestamp: new Date().toISOString(),
  };
  if (message) payload.message = message;
  const extra = format(detail);
  if (extra && typeof extra === "object") Object.assign(payload, extra);
  const target =
    (console as unknown as Record<string, (...args: unknown[]) => void>)[method] || console.log;
  target.call(console, JSON.stringify(payload));
}

export const logger = {
  error(detail?: Detail, message?: string) {
    emit("error", detail, message);
  },
  warn(detail?: Detail, message?: string) {
    emit("warn", detail, message);
  },
  info(detail?: Detail, message?: string) {
    emit("info", detail, message);
  },
  debug(detail?: Detail, message?: string) {
    emit("debug", detail, message);
  },
};
