// Open-redirect defense for the closed-alpha CoRent user auth flow
// (Slice A PR 5C).
//
// The user-side magic-link initiation and callback both accept an
// optional `next` parameter so a deep-link can survive sign-in. The
// parameter is attacker-controlled, so we constrain it tightly:
//
//   - Must be a relative path (no scheme, no host).
//   - Must NOT start with `/admin/` or be exactly `/admin` — the
//     admin surface is a different identity space (founder allowlist
//     gate). Defense in depth: a normal-user sign-in must never land
//     on the admin surface even though the admin gate would 404 the
//     attempt.
//   - Must not start with `//` (protocol-relative URL).
//   - Must not contain `\` (Windows-style path tricks).
//   - Must not contain newlines.
//   - Must not contain a URL scheme.
//
// Anything else falls back to the default safe target (the public
// homepage, which exists for both authenticated and anonymous
// visitors and is a calm landing surface during closed-alpha).
//
// Mirrors the shape of `safeAdminNextPath` in
// `src/server/admin/redirect.ts` but with a different default and an
// extra rejection rule for `/admin*`.

export const DEFAULT_USER_TARGET = "/";

export function safeUserNextPath(
  raw: string | null | undefined,
): string {
  if (!raw) return DEFAULT_USER_TARGET;
  if (typeof raw !== "string") return DEFAULT_USER_TARGET;
  if (raw.length === 0 || raw.length > 256) return DEFAULT_USER_TARGET;
  if (raw.startsWith("//")) return DEFAULT_USER_TARGET;
  if (raw.startsWith("/\\")) return DEFAULT_USER_TARGET;
  if (raw.includes("\\")) return DEFAULT_USER_TARGET;
  if (raw.includes("\n") || raw.includes("\r")) return DEFAULT_USER_TARGET;
  // Reject anything that looks like an absolute URL (scheme present).
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw)) return DEFAULT_USER_TARGET;
  // Must be a relative path (start with `/`).
  if (!raw.startsWith("/")) return DEFAULT_USER_TARGET;
  // Reject any path under /admin — defense in depth alongside the
  // founder allowlist on the admin surface.
  if (raw === "/admin" || raw.startsWith("/admin/")) {
    return DEFAULT_USER_TARGET;
  }
  return raw;
}
