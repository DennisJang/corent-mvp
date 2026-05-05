"use client";

// Founder-only publish button, surfaced inside the founder
// validation cockpit (Bundle 2 Slice 4).
//
// Hard rules:
//
//   - The component receives ONLY `listingId` via props. It never
//     accepts or forwards `sellerId`, `status`, `adminId`,
//     `role`, `capability`, `approval`, or any other authority
//     field. The server action's payload type forbids those
//     anyway, but the button does not even type-allow them on
//     its prop surface.
//
//   - The component never imports from `@/server/**` directly
//     (boundary test). It calls `publishListingFromCockpit` from
//     the established `@/lib/client/publishListingClient` hop.
//
//   - The founder authority signal lives inside the server
//     action (`requireFounderSession()`). If a non-founder ever
//     reaches this code path, the action returns
//     `kind: "unauthenticated"` and the button renders a calm
//     "founder session required" caption. Sellers cannot
//     self-publish through this surface.
//
//   - Pre-payment posture: the button label says "공개로 승인"
//     (publish/approve), not "결제" / "환불" / anything that
//     implies money movement. The success caption explicitly
//     says the listing is now public, not that any rental has
//     been confirmed.

import { useState } from "react";
import { Button } from "@/components/Button";
import {
  publishListingFromCockpit,
  type PublishListingUiResult,
} from "@/lib/client/publishListingClient";

type Props = {
  listingId: string;
};

type SubmitState =
  | { state: "idle" }
  | { state: "busy" }
  | {
      state: "ok";
      alreadyApproved: boolean;
    }
  | {
      state: "blocked";
      reason: Exclude<PublishListingUiResult, { kind: "ok" }>["kind"];
    };

const FAILURE_COPY: Record<
  Exclude<SubmitState, { state: "idle" } | { state: "busy" } | { state: "ok" }>["reason"],
  string
> = {
  unauthenticated: "운영자 세션이 필요해요.",
  not_found: "이 리스팅을 찾을 수 없어요.",
  input: "리스팅 id가 올바르지 않아요.",
  unsupported: "데모 환경에서는 공개할 수 없어요.",
  error: "공개 처리에 실패했어요. 잠시 뒤 다시 시도해 주세요.",
};

export function PublishListingButton({ listingId }: Props) {
  const [submission, setSubmission] = useState<SubmitState>({ state: "idle" });

  const handleClick = async () => {
    setSubmission({ state: "busy" });
    const result = await publishListingFromCockpit({ listingId });
    if (result.kind === "ok") {
      setSubmission({
        state: "ok",
        alreadyApproved: result.alreadyApproved,
      });
      return;
    }
    setSubmission({ state: "blocked", reason: result.kind });
  };

  if (submission.state === "ok") {
    return (
      <span className="text-caption text-[color:var(--ink-60)]">
        {submission.alreadyApproved
          ? "이미 공개됨"
          : "공개로 승인됨 — 새로고침하면 반영돼요"}
      </span>
    );
  }

  if (submission.state === "blocked") {
    return (
      <span
        role="status"
        className="text-caption border border-dashed border-[color:var(--line-dashed)] px-2 py-1"
      >
        {FAILURE_COPY[submission.reason]}
      </span>
    );
  }

  return (
    <Button
      size="md"
      variant="secondary"
      onClick={handleClick}
      disabled={submission.state === "busy"}
      type="button"
    >
      {submission.state === "busy" ? "공개 처리 중…" : "공개로 승인"}
    </Button>
  );
}
