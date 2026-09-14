const REDACTED_KEYS = /token|secret|key|authorization|refresh|password/i;

function redact(value) {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(redact);

  return Object.fromEntries(
    Object.entries(value).map(([key, val]) => [
      key,
      REDACTED_KEYS.test(key) ? "[redacted]" : redact(val),
    ]),
  );
}

function emit(level, message, context) {
  const entry = {
    level,
    message,
    time: new Date().toISOString(),
    ...(context ? redact(context) : {}),
  };
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  info: (message, context) => emit("info", message, context),
  warn: (message, context) => emit("warn", message, context),
  error: (message, context) => emit("error", message, context),
};
