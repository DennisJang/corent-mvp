"use client";

// Chat-to-listing intake skeleton — compact dashboard card.
//
// The seller types one description; the deterministic local extractor
// (no AI / network) produces a structured draft summary. A second
// click ("초안으로 저장") creates a private ListingIntent draft via
// `chatListingIntakeService.createListingDraftFromIntake`.
//
// What this surface DOES NOT do:
//
//   - It does not call any AI API. Extraction runs in-process.
//   - It does not publish anything. The created draft has status
//     `"draft"` and is never projected publicly until the seller goes
//     through the existing approval path.
//   - It does not collect payment, deposits, or settlement data.
//   - It does not edit trust, account standing, or admin fields.

import { useState } from "react";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import type {
  IntakeExtraction,
  IntakeMessage,
  IntakeSession,
} from "@/domain/intake";
import type { ListingIntent } from "@/domain/intents";
import { OwnershipError } from "@/lib/auth/guards";
import {
  ChatIntakeInputError,
  chatListingIntakeService,
} from "@/lib/services/chatListingIntakeService";

const SELLER_INPUT_MAX = 2000;

type Props = {
  sellerId: string;
  // Notify the parent when a new draft is created so the listings
  // table on the dashboard can re-load. The parent passes its own
  // `refresh` here.
  onDraftCreated?: (listing: ListingIntent) => void;
};

export function ChatToListingIntakeCard({ sellerId, onDraftCreated }: Props) {
  const [session, setSession] = useState<IntakeSession | null>(null);
  const [messages, setMessages] = useState<IntakeMessage[]>([]);
  const [extraction, setExtraction] = useState<IntakeExtraction | null>(null);
  const [draftListing, setDraftListing] = useState<ListingIntent | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Lazy session start — only when the seller actually submits a
  // message. Avoids creating empty sessions on every dashboard load.

  const handleSubmit = async () => {
    setBusy(true);
    setToast(null);
    try {
      let active = session;
      if (!active) {
        active = await chatListingIntakeService.startSession(sellerId);
        setSession(active);
      }
      const result = await chatListingIntakeService.appendSellerMessage(
        active.id,
        sellerId,
        text,
      );
      setSession(result.session);
      setMessages((prev) => [...prev, result.sellerMessage, result.assistantMessage]);
      setExtraction(result.extraction);
      setText("");
    } catch (e) {
      if (e instanceof ChatIntakeInputError) {
        setToast(
          e.code === "message_empty"
            ? "내용을 입력해 주세요."
            : e.code === "message_too_long"
              ? "내용이 너무 길어요. 줄여서 다시 시도해 주세요."
              : "이 세션은 더 이상 입력을 받지 않아요.",
        );
      } else if (e instanceof OwnershipError) {
        setToast("이 세션을 편집할 권한이 없어요.");
      } else {
        setToast("초안 미리보기를 만들지 못했어요.");
      }
    } finally {
      setBusy(false);
    }
  };

  const handleCreateDraft = async () => {
    if (!session) return;
    setBusy(true);
    setToast(null);
    try {
      const { session: nextSession, listing } =
        await chatListingIntakeService.createListingDraftFromIntake(
          session.id,
          sellerId,
        );
      setSession(nextSession);
      setDraftListing(listing);
      setToast("리스팅 초안을 저장했어요. 공개 전 사람 검수가 필요해요.");
      onDraftCreated?.(listing);
    } catch (e) {
      if (e instanceof OwnershipError) {
        setToast("이 세션을 편집할 권한이 없어요.");
      } else {
        setToast("초안을 저장하지 못했어요.");
      }
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
        <Badge variant="dashed">로컬 도우미</Badge>
      </header>
      <div className="px-6 py-6 flex flex-col gap-5">
        <p className="text-small text-[color:var(--ink-60)]">
          가지고 있는 물건을 한 문장으로 설명해 주세요. 베타 로컬 도우미가 구조화된
          리스팅 초안을 만들어 드려요. 자동 게시·실거래·실제 수금은 진행되지 않아요.
        </p>
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
            disabled={busy || draftFinalized || text.trim().length === 0}
            type="button"
          >
            초안 미리보기
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
              disabled={busy}
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
