"use client";

// Wanted Try Request form — closed-alpha cold-start MVP.
//
// Plan: `docs/corent_wanted_try_request_slice_plan.md`.
//
// Mounted ONLY from /search empty state when `loadState === "loaded"`
// and the filtered listing list is empty (see SearchResults.tsx). The
// form converts a dead-end search into a demand signal by writing a
// `feedback_submissions` row with `kind = "wanted_item"`.
//
// Hard rules — pinned by tests:
//
//   - Reuses the existing client adapter `submitFeedback` from
//     `@/lib/client/feedbackClient`. The client adapter is the only
//     bridge into the server action; we never import a server-only
//     module here.
//
//   - The payload is a SubmitFeedbackPayload with `kind: "wanted_item"`,
//     `sourcePage: "/search?empty"`, and the four user-editable fields
//     (`message`, `itemName`, `category`, `contactEmail`). The form
//     never sends `profileId`, `borrowerId`, `sellerId`, `status`,
//     `price`, `payment`, `settlement`, or any address / location
//     field. `buildWantedTryRequestPayload` is exported for source-
//     level tests that pin this shape.
//
//   - Copy is calm and never promises automatic matching. Success copy
//     references "같은 물건을 가진 셀러가 보면 다시 안내드려요" — a
//     conditional, not a promise. Mock / local mode reuses the
//     existing FeedbackIntakeCard caption verbatim.
//
//   - BW Swiss Grid tokens only. No new colors, no decorative accents,
//     no shadows.

import { useState } from "react";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { CATEGORIES, type CategoryId } from "@/domain/categories";
import {
  submitFeedback,
  type FeedbackSubmitResult,
  type SubmitFeedbackPayload,
} from "@/lib/client/feedbackClient";

const MESSAGE_MAX = 2000;
const ITEM_NAME_MAX = 80;
const EMAIL_MAX = 254;

export const WANTED_SOURCE_PAGE = "/search?empty";

export type WantedTryRequestFormState = {
  message: string;
  itemName: string;
  category: CategoryId | "";
  contactEmail: string;
};

// Pure helper — converts the form's local state into the typed
// SubmitFeedbackPayload the client adapter accepts. Extracted so a
// test can pin the payload shape without mounting React. Returns
// only the six fields the SubmitFeedbackPayload type allows; the
// helper has no path to invent `profileId`, `id`, `status`, or any
// authority field — the type itself forbids them.
export function buildWantedTryRequestPayload(
  state: WantedTryRequestFormState,
): SubmitFeedbackPayload {
  const message = state.message.trim();
  const itemNameTrimmed = state.itemName.trim();
  const emailTrimmed = state.contactEmail.trim();
  return {
    kind: "wanted_item",
    message,
    itemName: itemNameTrimmed.length > 0 ? itemNameTrimmed : null,
    category: state.category === "" ? null : state.category,
    contactEmail: emailTrimmed.length > 0 ? emailTrimmed : null,
    sourcePage: WANTED_SOURCE_PAGE,
  };
}

type Props = {
  // Pre-fill values pulled from the parsed SearchIntent. All optional;
  // when absent the form starts empty.
  defaultMessage?: string;
  defaultCategory?: CategoryId | null;
};

type Toast =
  | { kind: "ok" }
  | { kind: "local" }
  | { kind: "input" }
  | { kind: "error" };

export function WantedTryRequestForm({
  defaultMessage,
  defaultCategory,
}: Props) {
  const [message, setMessage] = useState<string>(defaultMessage ?? "");
  const [itemName, setItemName] = useState<string>("");
  const [category, setCategory] = useState<CategoryId | "">(
    defaultCategory ?? "",
  );
  const [contactEmail, setContactEmail] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);

  const submitDisabled = busy || message.trim().length === 0;

  const handleSubmit = async () => {
    setBusy(true);
    setToast(null);
    try {
      const payload = buildWantedTryRequestPayload({
        message,
        itemName,
        category,
        contactEmail,
      });
      const result: FeedbackSubmitResult = await submitFeedback(payload);
      if (result.kind === "ok") {
        setToast({ kind: "ok" });
        setMessage("");
        setItemName("");
        setCategory("");
        setContactEmail("");
        return;
      }
      if (result.kind === "local") {
        setToast({ kind: "local" });
        return;
      }
      if (result.reason === "input") {
        setToast({ kind: "input" });
        return;
      }
      setToast({ kind: "error" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      className="bg-white border border-[color:var(--ink-12)]"
      data-testid="wanted-try-request-form"
    >
      <header className="flex items-baseline justify-between border-b border-black px-6 py-4">
        <h3 className="text-title">이 물건을 사기 전에 써보고 싶어요</h3>
        <Badge variant="outline">베타</Badge>
      </header>
      <div className="px-6 py-6 flex flex-col gap-5">
        <p className="text-small text-[color:var(--ink-60)]">
          자동으로 정리한 안내예요. 카테고리·아이템 이름은 한 번 더 확인해
          주세요. 이 단계에서는 결제·픽업·정산이 시작되지 않아요.
        </p>

        <label className="flex flex-col gap-1">
          <span className="text-caption text-[color:var(--ink-60)]">
            어떤 물건을 써보고 싶으세요? (필수)
          </span>
          <textarea
            value={message}
            maxLength={MESSAGE_MAX}
            rows={3}
            placeholder="예: 다이슨 에어랩, 사기 전에 며칠 써보고 싶어요"
            disabled={busy}
            onChange={(e) => setMessage(e.target.value)}
            className="border border-[color:var(--ink-20)] px-3 py-2 text-body resize-y"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-caption text-[color:var(--ink-60)]">
            물건 이름 (선택)
          </span>
          <input
            type="text"
            value={itemName}
            maxLength={ITEM_NAME_MAX}
            placeholder="예: 다이슨 에어랩"
            disabled={busy}
            onChange={(e) => setItemName(e.target.value)}
            className="border border-[color:var(--ink-20)] px-3 py-2 text-body"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-caption text-[color:var(--ink-60)]">
            카테고리 (선택)
          </span>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as CategoryId | "")}
            disabled={busy}
            className="border border-[color:var(--ink-20)] px-3 py-2 text-body bg-white"
          >
            <option value="">선택 안 함</option>
            {CATEGORIES.filter((c) => c.enabled).map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-caption text-[color:var(--ink-60)]">
            연락 이메일 (선택)
          </span>
          <input
            type="email"
            value={contactEmail}
            maxLength={EMAIL_MAX}
            placeholder="example@domain.com"
            disabled={busy}
            onChange={(e) => setContactEmail(e.target.value)}
            className="border border-[color:var(--ink-20)] px-3 py-2 text-body"
          />
          <span className="text-caption text-[color:var(--ink-60)]">
            응답이 있을 때만 사용해요. 다른 채널로 전달되거나 셀러에게 노출되지
            않아요.
          </span>
        </label>

        <div className="flex items-center justify-end">
          <Button
            size="md"
            onClick={handleSubmit}
            disabled={submitDisabled}
            type="button"
          >
            써보고 싶다고 알리기
          </Button>
        </div>

        {toast?.kind === "ok" ? (
          <div
            role="status"
            aria-live="polite"
            data-testid="wanted-toast-ok"
            className="border border-dashed border-[color:var(--line-dashed)] px-4 py-3 flex flex-col gap-1"
          >
            <span className="text-body">받았어요.</span>
            <span className="text-small text-[color:var(--ink-60)]">
              같은 물건을 가진 셀러가 보면 다시 안내드려요. 자동으로 매칭되거나
              결제가 시작되지는 않아요.
            </span>
          </div>
        ) : null}

        {toast?.kind === "local" ? (
          <span
            role="status"
            aria-live="polite"
            data-testid="wanted-toast-local"
            className="text-small text-[color:var(--ink-60)] border border-dashed border-[color:var(--line-dashed)] px-3 py-2"
          >
            데모 환경에서는 저장되지 않아요. 클로즈드 알파 환경에서만 저장돼요.
          </span>
        ) : null}

        {toast?.kind === "input" ? (
          <span
            role="status"
            aria-live="polite"
            data-testid="wanted-toast-input"
            className="text-small text-[color:var(--ink-60)] border border-dashed border-[color:var(--line-dashed)] px-3 py-2"
          >
            입력 내용을 다시 확인해 주세요.
          </span>
        ) : null}

        {toast?.kind === "error" ? (
          <span
            role="status"
            aria-live="polite"
            data-testid="wanted-toast-error"
            className="text-small text-[color:var(--ink-60)] border border-dashed border-[color:var(--line-dashed)] px-3 py-2"
          >
            보내지 못했어요. 잠시 뒤 다시 시도해 주세요.
          </span>
        ) : null}
      </div>
    </section>
  );
}
