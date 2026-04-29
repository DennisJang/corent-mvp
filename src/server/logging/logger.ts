// Server-only redacting logger. The only allowed log path under
// `src/server/**`. Direct `console.log` / `console.error` etc. in
// `src/server/**` are banned by the smoke runbook check
// `scripts/check-server-no-console.sh`.
//
// Logger never serializes raw request bodies or known-PII keys. It accepts
// only structured key/value contexts and applies a redaction pass before
// emitting.

const REDACTED_KEYS = new Set([
  "email",
  "phone",
  "address",
  "name",
  "serial",
  "raw",
  "rawInput",
  "rawBody",
  "body",
  "userAgent",
  "ua",
  "ip",
  "cookie",
  "authorization",
  "auth",
  "token",
  "session",
  "session_token",
  "access_token",
  "refresh_token",
]);

const DENY_VALUE_PATTERNS: RegExp[] = [
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/, // email
  /0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4}/, // KR phone
  /\+82[-.\s]?\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4}/, // KR phone intl
  /\d{6}[-\s]?\d{7}/, // RRN
  /\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}/, // 16-digit card-like
];

const REDACTED = "[redacted]";

function redactValue(value: unknown): unknown {
  if (typeof value === "string") {
    for (const p of DENY_VALUE_PATTERNS) {
      if (p.test(value)) return REDACTED;
    }
    if (value.length > 256) return REDACTED;
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (value === null || value === undefined) return value;
  // Refuse to log nested objects, arrays, errors, etc. — surfaces are too
  // wide to scan reliably.
  return REDACTED;
}

function redact(context: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(context)) {
    if (REDACTED_KEYS.has(key.toLowerCase())) {
      out[key] = REDACTED;
      continue;
    }
    out[key] = redactValue(value);
  }
  return out;
}

type Level = "info" | "warn" | "error";

function emit(level: Level, code: string, context?: Record<string, unknown>): void {
  // Single-line structured logs. `process.stdout.write` to avoid the
  // `console.*` ban that the server-no-console scanner enforces, and to
  // keep formatting predictable for log shipping later.
  const payload = {
    level,
    code,
    ...(context ? redact(context) : {}),
    at: new Date().toISOString(),
  };
  const line = JSON.stringify(payload) + "\n";
  if (level === "error") {
    process.stderr.write(line);
  } else {
    process.stdout.write(line);
  }
}

export function logServerInfo(code: string, context?: Record<string, unknown>): void {
  emit("info", code, context);
}

export function logServerWarn(code: string, context?: Record<string, unknown>): void {
  emit("warn", code, context);
}

export function logServerError(code: string, context?: Record<string, unknown>): void {
  emit("error", code, context);
}

// Test seam — the redactor is the load-bearing piece, exposed for tests.
export const _redactForTests = redact;
