import Link from "next/link";

import { PLATFORM_DEFAULT_BRAND_PROFILE } from "@/lib/cie/brandProfile";

import { PlatformInteractionDemo } from "./PlatformInteractionDemo";

export const metadata = {
  title: "Platform — Interaction Demo",
  description:
    "A deterministic dogfooding demo of the AI Interaction Layer running on registered platform primitives.",
};

export default function PlatformPage() {
  const brand = PLATFORM_DEFAULT_BRAND_PROFILE;
  const thesis = brand.canonicalMessages.find(
    (m) => m.id === "thesis_one_line",
  );
  const notChatbot = brand.canonicalMessages.find(
    (m) => m.id === "not_a_chatbot",
  );
  const primitiveSummary = brand.canonicalMessages.find(
    (m) => m.id === "primitive_authority_summary",
  );

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <header className="border-b border-black bg-white">
        <div className="container-main flex items-center justify-between h-[72px]">
          <Link
            href="/platform"
            className="flex items-baseline gap-3 focus-ring -mx-1 px-1"
          >
            <span className="text-[18px] font-bold tracking-tight">
              {brand.displayName}
            </span>
            <span className="text-caption text-[color:var(--ink-60)]">
              Interaction Demo
            </span>
          </Link>
          <Link
            href="/"
            className="text-[14px] font-medium text-[color:var(--ink-60)] hover:text-black"
          >
            Home
          </Link>
        </div>
      </header>

      <main className="flex-1">
        <section className="border-b border-black">
          <div className="container-main py-16 flex flex-col gap-8">
            <span className="text-caption tracking-widest uppercase text-[color:var(--ink-60)]">
              00 — platform thesis
            </span>
            <h1 className="text-h2 md:text-h1 font-bold tracking-tight max-w-prose">
              {thesis?.text ?? brand.displayName}
            </h1>
            <p className="text-body text-[color:var(--ink-80)] max-w-prose">
              {primitiveSummary?.text}
            </p>
            <ul className="flex flex-col gap-2 text-small text-[color:var(--ink-80)]">
              <li className="flex items-baseline gap-3">
                <span className="text-caption tracking-widest uppercase text-[color:var(--ink-60)]">
                  ·
                </span>
                <span>{notChatbot?.text}</span>
              </li>
              <li className="flex items-baseline gap-3">
                <span className="text-caption tracking-widest uppercase text-[color:var(--ink-60)]">
                  ·
                </span>
                <span>
                  No autonomous action; every action is visitor-initiated and
                  visibly confirmed.
                </span>
              </li>
              <li className="flex items-baseline gap-3">
                <span className="text-caption tracking-widest uppercase text-[color:var(--ink-60)]">
                  ·
                </span>
                <span>
                  This demo does not send data, run actions, or emit analytics
                  events.
                </span>
              </li>
            </ul>
          </div>
        </section>

        <section className="border-b border-black bg-white">
          <div className="container-main py-12 flex flex-col gap-3">
            <span className="text-caption tracking-widest uppercase text-[color:var(--ink-60)]">
              what website owners get
            </span>
            <p className="text-title md:text-h3 font-bold tracking-tight max-w-prose">
              Start free — see what visitors are trying to do, where they get
              stuck, and what to improve.
            </p>
            <p className="text-small text-[color:var(--ink-80)] max-w-prose">
              No payment in this demo, no real form, no data leaves the page.
              Pick a purpose below; the operator panel updates with the
              deterministic plan and the first concrete site updates we would
              suggest.
            </p>
          </div>
        </section>

        <PlatformInteractionDemo />

        <section className="border-t border-black">
          <div className="container-main py-12 flex flex-col gap-4">
            <span className="text-caption tracking-widest uppercase text-[color:var(--ink-60)]">
              06 — what powers this page
            </span>
            <p className="text-small text-[color:var(--ink-80)] max-w-prose">
              The flow you select reads from six registered platform
              primitives: InteractionIntent, KnowledgeRegistry,
              ComponentBlock, Action, BrandProfile, GuardrailPolicy, and
              AnalyticsEvent. Every id you see comes from a registry; nothing
              is invented at render time.
            </p>
          </div>
        </section>
      </main>

      <footer className="border-t border-black bg-white mt-24">
        <div className="container-main py-12 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <span className="text-small text-[color:var(--ink-60)]">
            {brand.displayName} — Interaction Demo · Deterministic, not a
            chatbot.
          </span>
          <span className="text-caption tracking-widest uppercase text-[color:var(--ink-60)]">
            v0 — dogfooding slice
          </span>
        </div>
      </footer>
    </div>
  );
}
