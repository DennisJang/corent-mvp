"use client";

// Closed-alpha feedback / wishlist intake form (Validation Bundle 1,
// Part 2). Mounts on the landing page below the trust system. The
// form is OPTIONALLY anonymous; signed-in testers get their
// `profile_id` attached server-side automatically.
//
// Hard rules:
//
//   - Reads the Korean copy here, not from any shared copy module —
//     this is a small, scoped surface and adding it to
//     `lib/copy/returnTrust.ts` would mix concerns.
//   - Uses ONLY existing design tokens: black/white, dashed-border
//     captions, existing Button + Badge variants. No new colors,
//     no motion.
//   - Mock / default backend mode is surfaced explicitly through
//     the `kind: "local"` path so the user sees
//     "데모 환경에서는 의견을 저장하지 않아요." instead of a fake
//     "saved" toast.

import { useState } from "react";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { CATEGORIES, type CategoryId } from "@/domain/categories";
import {
  submitFeedback,
  type SubmitFeedbackPayload,
} from "@/lib/client/feedbackClient";

const KIND_OPTIONS: Array<{
  value: SubmitFeedbackPayload["kind"];
  label: string;
}> = [
  { value: "wanted_item", label: "사고 싶은 / 써보고 싶은 물건" },
  { value: "can_lend_item", label: "빌려줄 수 있는 물건" },
  { value: "feature_request", label: "기능 제안" },
  { value: "bug", label: "버그 / 문제" },
  { value: "general", label: "일반 의견" },
];

const MESSAGE_MAX = 2000;
const ITEM_NAME_MAX = 80;

type Props = {
  // Optional source-page tag. Defaults to the route the form is
  // mounted on. Bounded by SQL CHECK constraint at 80 chars.
  sourcePage?: string;
};

export function FeedbackIntakeCard({ sourcePage }: Props) {
  const [kind, setKind] = useState<SubmitFeedbackPayload["kind"]>(
    "wanted_item",
  );
  const [message, setMessage] = useState("");
  const [itemName, setItemName] = useState("");
  const [category, setCategory] = useState<CategoryId | "">("");
  const [contactEmail, setContactEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const showItemFields = kind === "wanted_item" || kind === "can_lend_item";

  const handleSubmit = async () => {
    setBusy(true);
    setToast(null);
    try {
      const result = await submitFeedback({
        kind,
        message,
        itemName: showItemFields && itemName ? itemName : null,
        category: showItemFields && category ? category : null,
        contactEmail: contactEmail || null,
        sourcePage: sourcePage ?? null,
      });
      if (result.kind === "ok") {
        setToast("의견을 받았어요. 감사합니다.");
        setMessage("");
        setItemName("");
        setCategory("");
        setContactEmail("");
        return;
      }
      if (result.kind === "local") {
        setToast(
          "데모 환경에서는 의견을 저장하지 않아요. 클로즈드 알파 환경에서만 저장돼요.",
        );
        return;
      }
      if (result.reason === "input") {
        setToast("입력 내용을 다시 확인해 주세요.");
        return;
      }
      setToast("의견을 보내지 못했어요. 잠시 뒤 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  };

  const submitDisabled = busy || message.trim().length === 0;

  return (
    <section className="bg-white border border-[color:var(--ink-12)]">
      <header className="flex items-baseline justify-between border-b border-black px-6 py-4">
        <h3 className="text-title">의견 / 위시리스트 보내기</h3>
        <Badge variant="outline">베타</Badge>
      </header>
      <div className="px-6 py-6 flex flex-col gap-5">
        <p className="text-small text-[color:var(--ink-60)]">
          어떤 물건이 있으면 빌려 써보고 싶으세요? 또는 무엇을 빌려줄 수
          있으세요? 짧은 한 줄도 도움이 돼요. 로그인 없이도 보낼 수 있어요.
        </p>

        <label className="flex flex-col gap-1">
          <span className="text-caption text-[color:var(--ink-60)]">종류</span>
          <select
            value={kind}
            onChange={(e) =>
              setKind(e.target.value as SubmitFeedbackPayload["kind"])
            }
            disabled={busy}
            className="border border-[color:var(--ink-20)] px-3 py-2 text-body bg-white"
          >
            {KIND_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>

        {showItemFields ? (
          <>
            <label className="flex flex-col gap-1">
              <span className="text-caption text-[color:var(--ink-60)]">
                물건 이름 (선택)
              </span>
              <input
                type="text"
                value={itemName}
                maxLength={ITEM_NAME_MAX}
                placeholder="예: 다이슨 슈퍼소닉"
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
          </>
        ) : null}

        <label className="flex flex-col gap-1">
          <span className="text-caption text-[color:var(--ink-60)]">
            메모 (필수)
          </span>
          <textarea
            value={message}
            maxLength={MESSAGE_MAX}
            rows={3}
            placeholder="구체적일수록 좋아요. 어떤 상황에서 며칠 써보면 좋을지 알려 주세요."
            disabled={busy}
            onChange={(e) => setMessage(e.target.value)}
            className="border border-[color:var(--ink-20)] px-3 py-2 text-body resize-y"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-caption text-[color:var(--ink-60)]">
            연락 이메일 (선택)
          </span>
          <input
            type="email"
            value={contactEmail}
            maxLength={254}
            placeholder="example@domain.com"
            disabled={busy}
            onChange={(e) => setContactEmail(e.target.value)}
            className="border border-[color:var(--ink-20)] px-3 py-2 text-body"
          />
        </label>

        <div className="flex items-center justify-end">
          <Button
            size="md"
            onClick={handleSubmit}
            disabled={submitDisabled}
            type="button"
          >
            의견 보내기
          </Button>
        </div>

        {toast ? (
          <span
            role="status"
            aria-live="polite"
            className="text-small text-[color:var(--ink-60)] border border-dashed border-[color:var(--line-dashed)] px-3 py-2"
          >
            {toast}
          </span>
        ) : null}
      </div>
    </section>
  );
}
