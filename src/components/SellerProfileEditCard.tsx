"use client";

// Manual seller editing skeleton — Public profile edit card.
//
// Mounts inside the seller dashboard and lets the current mock seller
// edit their public profile copy override. Reads + writes go through
// `sellerProfileService`; the static `SELLERS` fixture is never
// mutated. Persistence is local (memory in SSR, localStorage in the
// browser). Trust summary, account standing, review counts,
// payment / settlement, and admin fields are NOT exposed here.

import { useEffect, useState } from "react";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import {
  SellerProfileInputError,
  sellerProfileService,
} from "@/lib/services/sellerProfileService";

const DISPLAY_NAME_MAX = 40;
const PUBLIC_NOTE_MAX = 240;

export function SellerProfileEditCard({
  sellerId,
  fallbackName,
  fallbackIntro,
}: {
  sellerId: string;
  fallbackName: string;
  fallbackIntro?: string;
}) {
  const [displayName, setDisplayName] = useState("");
  const [publicNote, setPublicNote] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const isKnown = sellerProfileService.isKnownSeller(sellerId);

  useEffect(() => {
    if (!isKnown) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoaded(true);
      return;
    }
    let cancelled = false;
    sellerProfileService.getOverrideForSeller(sellerId).then((override) => {
      if (cancelled) return;
      setDisplayName(override?.displayName ?? "");
      setPublicNote(override?.publicNote ?? "");
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [sellerId, isKnown]);

  const handleSave = async () => {
    setBusy(true);
    setToast(null);
    try {
      const trimmedName = displayName.trim();
      const trimmedNote = publicNote.trim();
      await sellerProfileService.updateOwnProfile(sellerId, {
        displayName: trimmedName.length > 0 ? trimmedName : null,
        publicNote: trimmedNote.length > 0 ? trimmedNote : null,
      });
      setToast("공개 프로필을 저장했어요. (베타: 로컬 저장)");
    } catch (e) {
      if (e instanceof SellerProfileInputError) {
        setToast(
          e.code === "actor_unknown_seller"
            ? "이 셀러는 베타 프로필 편집이 열려 있지 않아요."
            : "입력값이 길이 제한을 넘었어요.",
        );
      } else {
        setToast("저장하지 못했어요.");
      }
    } finally {
      setBusy(false);
    }
  };

  if (!isKnown) {
    return (
      <section className="bg-white border border-[color:var(--ink-12)]">
        <header className="flex items-baseline justify-between border-b border-black px-6 py-4">
          <h3 className="text-title">공개 프로필 (베타)</h3>
          <Badge variant="dashed">잠김</Badge>
        </header>
        <div className="px-6 py-6 flex flex-col gap-2 text-small text-[color:var(--ink-60)]">
          <span>
            이 셀러 ID는 베타 프로필 편집 대상이 아니에요. 정식 셀러로 등록된
            계정만 공개 프로필을 수정할 수 있어요.
          </span>
        </div>
      </section>
    );
  }

  return (
    <section className="bg-white border border-[color:var(--ink-12)]">
      <header className="flex items-baseline justify-between border-b border-black px-6 py-4">
        <h3 className="text-title">공개 프로필 (베타)</h3>
        <Badge variant="dashed">로컬 저장</Badge>
      </header>
      <div className="px-6 py-6 flex flex-col gap-5">
        <p className="text-small text-[color:var(--ink-60)]">
          공개 storefront에 보이는 표시 이름과 소개를 직접 다듬어요. 베타에서는
          이 데이터가 브라우저 로컬에만 저장되고, 실제 결제·정산·공식 마켓플레이스
          게시와는 연결되어 있지 않아요.
        </p>
        <label className="flex flex-col gap-1">
          <span className="text-caption text-[color:var(--ink-60)]">
            표시 이름 (선택, 최대 {DISPLAY_NAME_MAX}자)
          </span>
          <input
            type="text"
            value={displayName}
            maxLength={DISPLAY_NAME_MAX}
            placeholder={fallbackName}
            onChange={(e) => setDisplayName(e.target.value)}
            disabled={!loaded || busy}
            className="border border-[color:var(--ink-20)] px-3 py-2 text-body"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-caption text-[color:var(--ink-60)]">
            공개 소개 메모 (선택, 최대 {PUBLIC_NOTE_MAX}자)
          </span>
          <textarea
            value={publicNote}
            maxLength={PUBLIC_NOTE_MAX}
            rows={3}
            placeholder={
              fallbackIntro ?? "이 셀러를 어떻게 소개할까요?"
            }
            onChange={(e) => setPublicNote(e.target.value)}
            disabled={!loaded || busy}
            className="border border-[color:var(--ink-20)] px-3 py-2 text-body resize-y"
          />
        </label>
        <ul className="text-caption text-[color:var(--ink-60)] flex flex-col gap-1">
          <li>· 신뢰도, 리뷰 수, 가입일은 편집할 수 없어요.</li>
          <li>· 결제·정산·계정 상태·관리자 검토 필드는 노출되지 않아요.</li>
          <li>· 빈칸으로 저장하면 기본 표시(고정 데이터)로 되돌아가요.</li>
        </ul>
        <div className="flex items-center justify-between gap-4">
          <span
            role="status"
            aria-live="polite"
            className="text-small text-[color:var(--ink-60)]"
          >
            {toast ?? ""}
          </span>
          <Button
            size="md"
            onClick={handleSave}
            disabled={!loaded || busy}
            type="button"
          >
            저장
          </Button>
        </div>
      </div>
    </section>
  );
}
