"use client";

// Chat-to-listing intake skeleton — compact dashboard card.
//
// The seller types one description; the deterministic local extractor
// (no AI / network) produces a structured draft summary. A second
// click ("초안으로 저장") creates a private ListingIntent draft.
//
// Client-adapter boundary:
//
//   - The component calls the chat intake client adapter
//     (`@/lib/client/chatIntakeClient`), never the server actions
//     directly and never the underlying service with a hand-passed
//     `actorSellerId`.
//   - In current local-demo mode the adapter routes writes through
//     the browser-local `chatListingIntakeService` so the dashboard
//     (which reads browser localStorage) actually sees the new
//     draft. The server actions in `@/server/intake/actions` remain
//     present and tested as the future shared-server boundary; the
//     adapter is the single seam where that mode flip happens.
//   - Result shape is `IntentResult<T>`; the component branches on
//     `code` to render Korean copy.
//
// What this surface DOES NOT do:
//
//   - It does not call any AI API. Extraction runs in-process.
//   - It does not publish anything. The created draft has status
//     `"draft"` and is never projected publicly until the seller goes
//     through the existing approval path.
//   - It does not collect payment, deposits, or settlement data.
//   - It does not edit trust, account standing, or admin fields.

import { useEffect, useState } from "react";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import type {
  IntakeExtraction,
  IntakeMessage,
  IntakeSession,
} from "@/domain/intake";
import type { ListingIntent } from "@/domain/intents";
import {
  appendSellerMessage,
  createListingDraft,
  probeChatIntakeMode,
  startIntakeSession,
  type IntentErrorCode,
} from "@/lib/client/chatIntakeClient";

const SELLER_INPUT_MAX = 2000;

type Props = {
  // Notify the parent when a new draft is created so the listings
  // table on the dashboard can re-load. The parent passes its own
  // `refresh` here.
  onDraftCreated?: (listing: ListingIntent) => void;
  // Slice A PR 5F — parent-observable mode signal. The seller
  // dashboard uses this to render a small transparency disclaimer
  // when chat intake is in server mode (the dashboard's listings
  // table is still local-only). Optional; defaults to a no-op.
  onModeChange?: (mode: "local" | "server") => void;
};

// Slice A PR 5F — toast copy is now mode-aware. Local mode keeps the
// existing copy verbatim. Server mode replaces the generic "처리하지
// 못했어요" with explicit user-actionable copy so the seller knows
// the request hit the server and did not silently fall back to
// localStorage.
function intakeErrorToToast(
  code: IntentErrorCode,
  mode: "local" | "server",
): string {
  if (mode === "server") {
    switch (code) {
      case "input":
        return "내용을 다시 확인해 주세요.";
      case "ownership":
        return "이 세션을 편집할 권한이 없어요.";
      case "not_found":
        return "세션을 찾을 수 없어요.";
      case "conflict":
        return "이 세션은 더 이상 입력을 받지 않아요.";
      case "unauthenticated":
        return "로그인이 필요해요. 매직 링크 다시 보내려면 /login에서 시도해 주세요.";
      case "unsupported":
      case "internal":
      default:
        return "서버에 연결하지 못했어요. 잠시 뒤 다시 시도해 주세요.";
    }
  }
  switch (code) {
    case "input":
      return "내용을 다시 확인해 주세요.";
    case "ownership":
      return "이 세션을 편집할 권한이 없어요.";
    case "not_found":
      return "세션을 찾을 수 없어요.";
    case "conflict":
      return "이 세션은 더 이상 입력을 받지 않아요.";
    case "unauthenticated":
      return "로그인이 필요해요.";
    case "unsupported":
    case "internal":
    default:
      return "처리하지 못했어요. 잠시 뒤 다시 시도해 주세요.";
  }
}

export function ChatToListingIntakeCard({ onDraftCreated, onModeChange }: Props) {
  const [session, setSession] = useState<IntakeSession | null>(null);
  const [messages, setMessages] = useState<IntakeMessage[]>([]);
  const [extraction, setExtraction] = useState<IntakeExtraction | null>(null);
  const [draftListing, setDraftListing] = useState<ListingIntent | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  // PR 5F — mode + capability come from the server probe at mount.
  // Defaults are `local` / null so the card renders the existing
  // local-demo affordance until the probe resolves. The probe is a
  // single-flight request memoized inside the client adapter.
  //
  // Leakage guard (post-2026-05-05 smoke): until the probe resolves
  // we treat the surface as "확인 중" — the submit + draft buttons
  // are disabled and the badge does not claim 로컬 도우미. Without
  // this guard, a closed-alpha tester clicking during the probe
  // window would dispatch through the client adapter while
  // `activeMode` was still its default `"local"`, silently routing
  // a Supabase-mode write into browser localStorage.
  const [mode, setMode] = useState<"local" | "server">("local");
  const [capability, setCapability] = useState<"seller" | "renter" | null>(
    null,
  );
  const [probePending, setProbePending] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void probeChatIntakeMode().then((result) => {
      if (cancelled) return;
      if (result.mode === "server") {
        setMode("server");
        setCapability(result.capability);
        onModeChange?.("server");
      } else {
        setMode("local");
        setCapability(null);
        onModeChange?.("local");
      }
      setProbePending(false);
    });
    return () => {
      cancelled = true;
    };
  }, [onModeChange]);

  const submitDisabledByCapability =
    mode === "server" && capability === "renter";

  // Lazy session start — only when the seller actually submits a
  // message. Avoids creating empty sessions on every dashboard load.

  const handleSubmit = async () => {
    setBusy(true);
    setToast(null);
    try {
      let active = session;
      if (!active) {
        const start = await startIntakeSession();
        if (!start.ok) {
          setToast(intakeErrorToToast(start.code, mode));
          return;
        }
        active = start.value.session;
        setSession(active);
      }
      const result = await appendSellerMessage({
        sessionId: active.id,
        content: text,
      });
      if (!result.ok) {
        setToast(intakeErrorToToast(result.code, mode));
        return;
      }
      const value = result.value;
      setSession(value.session);
      setMessages((prev) => [...prev, value.sellerMessage, value.assistantMessage]);
      setExtraction(value.extraction);
      setText("");
    } finally {
      setBusy(false);
    }
  };

  const handleCreateDraft = async () => {
    if (!session) return;
    setBusy(true);
    setToast(null);
    try {
      const result = await createListingDraft({
        sessionId: session.id,
      });
      if (!result.ok) {
        setToast(intakeErrorToToast(result.code, mode));
        return;
      }
      const { session: nextSession, listing } = result.value;
      setSession(nextSession);
      setDraftListing(listing);
      setToast(
        mode === "server"
          ? "리스팅 초안을 서버에 저장했어요. 공개 전 사람 검수가 필요해요."
          : "리스팅 초안을 저장했어요. 공개 전 사람 검수가 필요해요.",
      );
      onDraftCreated?.(listing);
    } finally {
      setBusy(false);
    }
  };

  const lastAssistant = [...messages]
    .reverse()
    .find((m) => m.role === "assistant");
  const draftFinalized = session?.status === "draft_created";

  return (
    <section className="bg-white border border-[color:var(--ink-12)]">
      <header className="flex items-baseline justify-between border-b border-black px-6 py-4">
        <h3 className="text-title">채팅으로 물건 등록 (베타)</h3>
        {probePending ? (
          <Badge variant="dashed">베타 모드 확인 중</Badge>
        ) : mode === "server" ? (
          <Badge variant="outline">서버 연결됨 · 베타</Badge>
        ) : (
          <Badge variant="dashed">로컬 도우미</Badge>
        )}
      </header>
      <div className="px-6 py-6 flex flex-col gap-5">
        <p className="text-small text-[color:var(--ink-60)]">
          가지고 있는 물건을 한 문장으로 설명해 주세요. 베타 로컬 도우미가 구조화된
          리스팅 초안을 만들어 드려요. 자동 게시·실거래·실제 수금은 진행되지 않아요.
        </p>
        {submitDisabledByCapability ? (
          <p
            role="status"
            className="text-small border border-dashed border-[color:var(--line-dashed)] px-3 py-2"
          >
            이 계정은 빌리는 사람 권한만 있어요. 셀러 권한이 필요해요.
          </p>
        ) : null}
        <label className="flex flex-col gap-1">
          <span className="text-caption text-[color:var(--ink-60)]">
            물건 설명 (예: &ldquo;소니 WH-1000XM5 헤드폰, 강남역 근처에서 픽업, 하루 9000원&rdquo;)
          </span>
          <textarea
            value={text}
            maxLength={SELLER_INPUT_MAX}
            rows={3}
            placeholder="물건 이름, 상태, 픽업 지역, 희망 가격 등을 자유롭게 적어 주세요."
            disabled={busy || draftFinalized}
            onChange={(e) => setText(e.target.value)}
            className="border border-[color:var(--ink-20)] px-3 py-2 text-body resize-y"
          />
        </label>
        <div className="flex items-center justify-between gap-4">
          <span className="text-caption text-[color:var(--ink-60)]">
            {draftFinalized
              ? "이 세션은 초안으로 마무리됐어요. 새 세션을 열려면 페이지를 새로고침해 주세요."
              : "초안은 항상 검토 후 수정 가능해요."}
          </span>
          <Button
            size="md"
            onClick={handleSubmit}
            disabled={
              busy ||
              draftFinalized ||
              text.trim().length === 0 ||
              submitDisabledByCapability ||
              probePending
            }
            type="button"
          >
            {probePending ? "확인 중…" : "초안 미리보기"}
          </Button>
        </div>

        {lastAssistant ? (
          <div className="border border-dashed border-[color:var(--line-dashed)] px-4 py-3 text-small whitespace-pre-line">
            {lastAssistant.content}
          </div>
        ) : null}

        {extraction ? (
          <ul className="text-caption text-[color:var(--ink-60)] flex flex-col gap-1">
            <li>· 추출된 항목은 초안 단계로만 저장돼요. 자동 공개되지 않아요.</li>
            <li>
              · 비어 있는 항목 {extraction.missingFields.length}개는 직접 채워 주세요.
            </li>
            <li>· 베타 기간에는 결제·정산·환급 흐름이 연결되지 않아요.</li>
          </ul>
        ) : null}

        {extraction && !draftFinalized ? (
          <div className="flex items-center justify-end">
            <Button
              size="md"
              variant="secondary"
              onClick={handleCreateDraft}
              disabled={busy || submitDisabledByCapability || probePending}
              type="button"
            >
              리스팅 초안으로 저장
            </Button>
          </div>
        ) : null}

        {draftListing ? (
          <div className="border-t border-[color:var(--ink-12)] pt-4 flex flex-col gap-1 text-small">
            <span className="text-body font-medium">{draftListing.item.name}</span>
            <span className="text-caption text-[color:var(--ink-60)]">
              초안 ID: {draftListing.id} · 상태: {draftListing.status}
            </span>
            <span className="text-caption text-[color:var(--ink-60)]">
              아래 등록된 물건 표에서 확인하고 직접 수정할 수 있어요.
            </span>
          </div>
        ) : null}

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
