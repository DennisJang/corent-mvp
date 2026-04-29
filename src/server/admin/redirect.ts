// Open-redirect defense for the founder admin auth flow.
//
// The magic-link callback and the sign-in route both accept an optional
// `next` parameter so a deep-link can survive sign-in. The parameter is
// attacker-controlled, so we constrain it tightly:
//
//   - Must be a relative path (no scheme, no host).
//   - Must start with `/admin/` or be exactly `/admin`.
//   - Must not start with `//` (protocol-relative URL).
//   - Must not contain `\` (Windows-style path tricks).
//
// Anything else falls back to the default safe target.

export const DEFAULT_ADMIN_TARGET = "/admin/dashboard";

export function safeAdminNextPath(
  raw: string | null | undefined,
): string {
  if (!raw) return DEFAULT_ADMIN_TARGET;
  // Reject obvious shapes early.
  if (typeof raw !== "string") return DEFAULT_ADMIN_TARGET;
  if (raw.length === 0 || raw.length > 256) return DEFAULT_ADMIN_TARGET;
  if (raw.startsWith("//")) return DEFAULT_ADMIN_TARGET;
  if (raw.startsWith("/\\")) return DEFAULT_ADMIN_TARGET;
  if (raw.includes("\\")) return DEFAULT_ADMIN_TARGET;
  if (raw.includes("\n") || raw.includes("\r")) return DEFAULT_ADMIN_TARGET;
  // Reject anything that looks like an absolute URL (scheme present).
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw)) return DEFAULT_ADMIN_TARGET;
  // Must be a relative path under /admin.
  if (raw !== "/admin" && !raw.startsWith("/admin/")) {
    return DEFAULT_ADMIN_TARGET;
  }
  return raw;
}
