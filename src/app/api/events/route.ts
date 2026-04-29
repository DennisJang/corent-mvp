// Phase 1 analytics ingestion endpoint. POST-only. Strict input shape via
// the sanitizer module. Disabled-by-default behind ENABLE_ANALYTICS_BETA.
//
// Implements:
// - flag check (returns 204 with no body when off)
// - method check (only POST)
// - content-type check (415 if not application/json)
// - body size cap (413 if > 4 KB pre-sanitize)
// - JSON parse (400 on malformed)
// - sanitize (400 on shape failure)
// - write through service-role client (200 on success)
//
// Region pinned to Seoul (`icn1`) so the round-trip stays in-region.

import { NextResponse } from "next/server";
import {
  RAW_BODY_BYTE_CAP,
  sanitize,
  type SanitizerInput,
} from "@/server/analytics/sanitize";
import { isAnalyticsBetaEnabled } from "@/server/analytics/env";
import { writeEvent } from "@/server/analytics/writer";
import { logServerWarn, logServerError } from "@/server/logging/logger";

export const runtime = "nodejs";
export const preferredRegion = ["icn1"];
export const dynamic = "force-dynamic";

function noContent(): NextResponse {
  return new NextResponse(null, { status: 204 });
}

function rejection(status: number): NextResponse {
  return new NextResponse(null, { status });
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!isAnalyticsBetaEnabled()) {
    return noContent();
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return rejection(415);
  }

  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return rejection(400);
  }

  if (Buffer.byteLength(raw, "utf8") > RAW_BODY_BYTE_CAP) {
    return rejection(413);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return rejection(400);
  }

  const result = sanitize(parsed as SanitizerInput);
  if (!result.ok) {
    logServerWarn("sanitizer_rejected_request", { reason: result.reason });
    return rejection(400);
  }

  const write = await writeEvent(result.row, result.rejections);
  if (!write.ok) {
    logServerError("analytics_write_failed", { reason: write.reason });
    // Fail closed: do not leak whether the client environment is misconfigured.
    return rejection(503);
  }

  return new NextResponse(null, { status: 200 });
}

// Other verbs are not allowed.
export async function GET(): Promise<NextResponse> {
  return rejection(405);
}
export async function PUT(): Promise<NextResponse> {
  return rejection(405);
}
export async function PATCH(): Promise<NextResponse> {
  return rejection(405);
}
export async function DELETE(): Promise<NextResponse> {
  return rejection(405);
}
