// Writer module. The only path that inserts rows into `growth_events` and
// `sanitizer_rejections`. Both tables have RLS enabled and only the
// service-role client can write. Callers must already have a sanitized row.
//
// Writer never logs raw inputs. On Supabase failure it logs only the error
// code/message via the redacted logger and surfaces a boolean result.

import { getServiceRoleClient } from "./supabase";
import type { RejectionRecord, SanitizedRow } from "./sanitize";
import { logServerError } from "@/server/logging/logger";

export type WriteResult =
  | { ok: true }
  | { ok: false; reason: "no_client" | "insert_failed" };

export async function writeEvent(
  row: SanitizedRow,
  rejections: RejectionRecord[],
): Promise<WriteResult> {
  const client = getServiceRoleClient();
  if (!client) return { ok: false, reason: "no_client" };

  // Insert the event row.
  const eventInsert = await client.from("growth_events").insert({
    event_kind: row.event_kind,
    event_schema_version: row.event_schema_version,
    category: row.category,
    region_coarse: row.region_coarse,
    properties: row.properties,
    session_hash: row.session_hash,
    consent_state: row.consent_state,
  });
  if (eventInsert.error) {
    logServerError("growth_events_insert_failed", {
      code: eventInsert.error.code,
      message: eventInsert.error.message,
    });
    return { ok: false, reason: "insert_failed" };
  }

  // Best-effort rejection logging — failure here does not block the event.
  if (rejections.length > 0) {
    const rejectionInsert = await client.from("sanitizer_rejections").insert(
      rejections.map((r) => ({
        event_kind: r.event_kind,
        dropped_keys: r.dropped_keys,
        reason: r.reason,
      })),
    );
    if (rejectionInsert.error) {
      logServerError("sanitizer_rejections_insert_failed", {
        code: rejectionInsert.error.code,
        message: rejectionInsert.error.message,
      });
      // Intentional: we do not propagate this failure to the client.
    }
  }

  return { ok: true };
}
