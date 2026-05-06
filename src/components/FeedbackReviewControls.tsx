"use client";

// Founder-only feedback review row controls, rendered inside the
// founder validation cockpit (closed-alpha review workflow).
//
// Hard rules:
//
//   - The component receives ONLY `feedbackId` + the row's
//     current `status` via props. It never accepts or forwards
//     `message`, `contactEmail`, `profileId`, `borrowerId`,
//     `sellerId`, `kind`, or any other authority / PII field.
//
//   - The component never imports from `@/server/**` directly.
//     It calls `updateFeedbackStatusFromCockpit` from the
//     `@/lib/client/feedbackReviewClient` adapter.
//
//   - The founder authority signal lives inside the server
//     action (`requireFounderSession()`). If a non-founder ever
//     reaches this code path, the action returns
//     `kind: "unauthenticated"` and the controls render a calm
//     "founder session required" caption. Sellers / borrowers
//     cannot mutate feedback status through this surface.
//
//   - Calm, operational copy. The two affordances the founder
//     needs:
//       - `검토 완료` (mark as reviewed)  — visible only when
//         status is still `new`.
//       - `보관`     (archive)            — visible while status
//         is not yet `archived`.
//     Once a row is `archived`, the controls collapse to a
//     status label only.

import { useState } from "react";
import { Button } from "@/components/Button";
import {
  updateFeedbackStatusFromCockpit,
  type FeedbackReviewTargetStatus,
  type FeedbackReviewUiResult,
} from "@/lib/client/feedbackReviewClient";

type Props = {
  feedbackId: string;
  // The cockpit reader projects the column verbatim; this client
  // only reads three values.
  status: "new" | "reviewed" | "archived";
};

type SubmitState =
  | { state: "idle" }
  | { state: "busy"; target: FeedbackReviewTargetStatus }
  | {
      state: "ok";
      status: FeedbackReviewTargetStatus;
    }
  | {
      state: "blocked";
      reason: Exclude<FeedbackReviewUiResult, { kind: "ok" }>["kind"];
    };

const FAILURE_COPY: Record<
  Exclude<SubmitState, { state: "idle" } | { state: "busy" } | { state: "ok" }>["reason"],
  string
> = {
  unauthenticated: "운영자 세션이 필요해요.",
  input: "id 또는 상태 값이 올바르지 않아요.",
  unsupported: "데모 환경에서는 처리할 수 없어요.",
  error: "상태 변경에 실패했어요. 잠시 뒤 다시 시도해 주세요.",
};

const BUSY_COPY: Record<FeedbackReviewTargetStatus, string> = {
  reviewed: "검토 처리 중…",
  archived: "보관 처리 중…",
};

const OK_COPY: Record<FeedbackReviewTargetStatus, string> = {
  reviewed: "검토 완료 — 새로고침하면 반영돼요",
  archived: "보관됨 — 새로고침하면 반영돼요",
};

export function FeedbackReviewControls({ feedbackId, status }: Props) {
  const [submission, setSubmission] = useState<SubmitState>({ state: "idle" });

  const handleClick = async (target: FeedbackReviewTargetStatus) => {
    setSubmission({ state: "busy", target });
    const result = await updateFeedbackStatusFromCockpit({
      id: feedbackId,
      status: target,
    });
    if (result.kind === "ok") {
      setSubmission({ state: "ok", status: result.status });
      return;
    }
    setSubmission({ state: "blocked", reason: result.kind });
  };

  if (submission.state === "ok") {
    return (
      <span className="text-caption text-[color:var(--ink-60)]">
        {OK_COPY[submission.status]}
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

  // status === "archived": no actions remain. Render a calm label
  // so the row is visually consistent with the active cases.
  if (status === "archived") {
    return (
      <span className="text-caption text-[color:var(--ink-60)]">archived</span>
    );
  }

  const busyTarget =
    submission.state === "busy" ? submission.target : null;

  return (
    <div className="flex flex-col items-end gap-2">
      <span className="text-caption">{status}</span>
      <div className="flex flex-wrap gap-2 justify-end">
        {status === "new" ? (
          <Button
            size="md"
            variant="secondary"
            type="button"
            onClick={() => handleClick("reviewed")}
            disabled={submission.state === "busy"}
          >
            {busyTarget === "reviewed" ? BUSY_COPY.reviewed : "검토 완료"}
          </Button>
        ) : null}
        <Button
          size="md"
          variant="secondary"
          type="button"
          onClick={() => handleClick("archived")}
          disabled={submission.state === "busy"}
        >
          {busyTarget === "archived" ? BUSY_COPY.archived : "보관"}
        </Button>
      </div>
    </div>
  );
}
