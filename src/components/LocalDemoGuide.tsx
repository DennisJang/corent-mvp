// Local demo guide — compact dashboard block.
//
// Renders the 7-step CoRent local-MVP flow alongside the mock roles
// in play this browser session. Picks a recommended demo request
// item (a static product owned by the current mock seller) so the
// renter step actually lands a request on this dashboard.
//
// Pure presentation. No state, no side-effects. The block is shown
// at the top of the seller dashboard so testers see it before any
// rental rows.

import Link from "next/link";
import { Badge } from "@/components/Badge";
import {
  DEMO_STEPS,
  LOCAL_DEMO_GUIDE_COPY,
  getCurrentDemoRoles,
  getRecommendedDemoProduct,
} from "@/lib/demo/localDemoGuide";

const COPY = LOCAL_DEMO_GUIDE_COPY;

const ROLE_DRIVER_LABEL: Record<"seller" | "renter" | "admin", string> = {
  seller: "셀러",
  renter: "렌터",
  admin: "관리자",
};

export function LocalDemoGuide() {
  const roles = getCurrentDemoRoles();
  const demoProduct = getRecommendedDemoProduct(roles.seller.id);
  return (
    <section className="bg-white border border-[color:var(--ink-12)]">
      <header className="flex items-baseline justify-between border-b border-black px-6 py-4">
        <h3 className="text-title">{COPY.sectionTitle}</h3>
        <Badge variant="dashed">{COPY.sectionBadge}</Badge>
      </header>
      <div className="px-6 py-6 flex flex-col gap-6">
        <p className="text-small text-[color:var(--ink-60)]">{COPY.intro}</p>

        <div className="flex flex-col gap-3">
          <span className="text-caption text-[color:var(--ink-60)]">
            {COPY.rolesHeading}
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-3 border-l border-[color:var(--ink-12)]">
            {[roles.seller, roles.renter, roles.admin].map((role) => (
              <div
                key={role.id}
                className="border-r border-b border-t border-[color:var(--ink-12)] -ml-px -mt-px px-4 py-4 flex flex-col gap-1"
              >
                <span className="text-caption text-[color:var(--ink-60)]">
                  {role.label} (mock)
                </span>
                <span className="text-body font-medium">
                  {role.displayName}
                </span>
                <span className="text-caption text-[color:var(--ink-60)]">
                  {role.id}
                </span>
                <span className="text-caption text-[color:var(--ink-60)]">
                  {role.hint}
                </span>
              </div>
            ))}
          </div>
          <span className="text-caption text-[color:var(--ink-60)]">
            {COPY.rolesNote}
          </span>
        </div>

        <div className="flex flex-col gap-3">
          <span className="text-caption text-[color:var(--ink-60)]">
            {COPY.recommendedItemHeading}
          </span>
          {demoProduct ? (
            <div className="border border-[color:var(--ink-12)] px-4 py-4 flex flex-col gap-2">
              <span className="text-body font-medium">{demoProduct.name}</span>
              <span className="text-caption text-[color:var(--ink-60)]">
                {demoProduct.pickupArea} · 셀러 {demoProduct.sellerName} ·{" "}
                상품 ID {demoProduct.id}
              </span>
              <span className="text-caption text-[color:var(--ink-60)]">
                {COPY.recommendedItemHint}
              </span>
              <Link
                href={`/items/${demoProduct.id}`}
                className="text-caption underline self-start"
              >
                {COPY.recommendedItemCta} →
              </Link>
            </div>
          ) : (
            <div className="border border-dashed border-[color:var(--line-dashed)] px-4 py-4 text-small text-[color:var(--ink-60)]">
              {COPY.recommendedItemMissing}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <span className="text-caption text-[color:var(--ink-60)]">
            {COPY.stepsHeading}
          </span>
          <ol className="flex flex-col">
            {DEMO_STEPS.map((step, i) => (
              <li
                key={step.index}
                className={`grid grid-cols-[40px_1fr_auto] gap-4 py-3 ${
                  i !== 0 ? "border-t border-[color:var(--ink-12)]" : ""
                }`}
              >
                <span className="text-caption text-[color:var(--ink-60)] tabular-nums">
                  {String(step.index).padStart(2, "0")}
                </span>
                <div className="flex flex-col gap-1">
                  <span className="text-body font-medium">{step.title}</span>
                  <span className="text-small text-[color:var(--ink-60)]">
                    {step.body}
                  </span>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Badge variant="outline">
                    {ROLE_DRIVER_LABEL[step.driver]}
                  </Badge>
                  {step.href ? (
                    <Link
                      href={step.href}
                      className="text-caption underline"
                    >
                      이동 →
                    </Link>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        </div>

        <ul className="text-caption text-[color:var(--ink-60)] flex flex-col gap-1">
          <li>· {COPY.resetHint}</li>
          <li>· {COPY.betaScope}</li>
        </ul>
      </div>
    </section>
  );
}
