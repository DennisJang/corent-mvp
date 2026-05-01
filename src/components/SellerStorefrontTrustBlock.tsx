"use client";

// Public-facing trust summary block for the seller storefront. Reads
// the count-only `UserTrustSummary` from local persistence (mock-only
// in this MVP) and renders the same 4-tile shape the dashboard uses,
// with an explicit empty-state caption when no counts have been
// recorded for this visitor's local session.
//
// Read-only: there is no mutation, no decision, no booking action.
// `accountStanding` is intentionally NOT surfaced here — that flag is
// admin-managed and is only useful to the seller themselves on the
// dashboard, not to a public visitor.

import { useEffect, useState } from "react";
import {
  EMPTY_USER_TRUST_SUMMARY,
  type UserTrustSummary,
} from "@/domain/trust";
import { trustEventService } from "@/lib/services/trustEvents";
import {
  STOREFRONT_COPY,
  TRUST_SUMMARY_COPY,
} from "@/lib/copy/returnTrust";

export function SellerStorefrontTrustBlock({
  sellerId,
}: {
  sellerId: string;
}) {
  const [summary, setSummary] = useState<UserTrustSummary>(() => ({
    userId: sellerId,
    ...EMPTY_USER_TRUST_SUMMARY,
  }));
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    trustEventService.summarizeUserTrust(sellerId).then((next) => {
      if (cancelled) return;
      setSummary(next);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [sellerId]);

  const total =
    summary.successfulReturns +
    summary.pickupConfirmedCount +
    summary.returnConfirmedCount +
    summary.conditionCheckCompletedCount;

  if (loaded && total === 0) {
    return (
      <section
        aria-label={STOREFRONT_COPY.trustHeading}
        className="border border-dashed border-[color:var(--line-dashed)] px-6 py-8"
      >
        <h3 className="text-title border-b border-[color:var(--ink-12)] pb-3 mb-4">
          {STOREFRONT_COPY.trustHeading}
        </h3>
        <p className="text-small text-[color:var(--ink-60)]">
          {STOREFRONT_COPY.trustEmpty}
        </p>
      </section>
    );
  }

  return (
    <section
      aria-label={STOREFRONT_COPY.trustHeading}
      className="bg-white border border-[color:var(--ink-12)]"
    >
      <header className="flex items-baseline justify-between border-b border-black px-6 py-4">
        <h3 className="text-title">{STOREFRONT_COPY.trustHeading}</h3>
      </header>
      <div className="grid grid-cols-2 sm:grid-cols-4 border-l border-[color:var(--ink-12)]">
        <Tile
          label={TRUST_SUMMARY_COPY.successfulReturns}
          value={summary.successfulReturns}
        />
        <Tile
          label={TRUST_SUMMARY_COPY.pickupConfirmedCount}
          value={summary.pickupConfirmedCount}
        />
        <Tile
          label={TRUST_SUMMARY_COPY.returnConfirmedCount}
          value={summary.returnConfirmedCount}
        />
        <Tile
          label={TRUST_SUMMARY_COPY.conditionCheckCompletedCount}
          value={summary.conditionCheckCompletedCount}
        />
      </div>
    </section>
  );
}

function Tile({ label, value }: { label: string; value: number }) {
  return (
    <div className="border-r border-b border-t border-[color:var(--ink-12)] -ml-px -mt-px px-6 py-6 flex flex-col gap-2">
      <span className="text-caption text-[color:var(--ink-60)]">{label}</span>
      <span className="text-h3 tabular-nums">
        {value.toLocaleString("ko-KR")}
      </span>
    </div>
  );
}
