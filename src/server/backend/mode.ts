// Phase 2 backend mode selector. Server-only.
//
// CoRent's default runtime is "mock" — UI continues to use the in-memory
// + localStorage adapters, no backend writes happen. The "supabase" mode
// flips on Phase 2 server-only Supabase reads/writes. The mode is read
// from `CORENT_BACKEND_MODE` and can ONLY be opted into in dev.
//
// Hard rules:
//   - Default is "mock". An empty / missing / unknown value is "mock".
//   - In production (`NODE_ENV === 'production'`), the supabase mode is
//     refused and we fall back to "mock" — even if the env says
//     "supabase". Phase 2 cannot reach prod traffic.
//   - This module is server-only. It is never imported from a client
//     component or any file under `src/components/**`.
//
// The mode does NOT control the public default UI. Pages that want a
// Phase 2 read explicitly call `getBackendMode()` and decide what to do
// when it is "mock" (skip / show disabled state). This keeps the
// browser-demo behavior intact when env is missing.

export type BackendMode = "mock" | "supabase";

const ALLOWED: ReadonlySet<BackendMode> = new Set(["mock", "supabase"]);

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

export function getBackendMode(): BackendMode {
  const raw = (process.env.CORENT_BACKEND_MODE ?? "").trim();
  if (raw === "supabase") {
    if (isProduction()) {
      // Hard fail-closed in prod: the Phase 2 schema is dev-only and
      // must not be addressed from production traffic.
      return "mock";
    }
    return "supabase";
  }
  // Defense in depth: any value we don't explicitly allow becomes mock.
  return ALLOWED.has(raw as BackendMode) ? (raw as BackendMode) : "mock";
}

export function isSupabaseBackend(): boolean {
  return getBackendMode() === "supabase";
}
