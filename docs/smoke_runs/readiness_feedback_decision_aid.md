# CoRent readiness-flow tester-feedback decision aid

_Companion to [`2026-05-06_readiness_flow_template.md`](2026-05-06_readiness_flow_template.md),
[`tester_feedback_form_template.md`](tester_feedback_form_template.md),
[`readiness_feedback_taxonomy.md`](readiness_feedback_taxonomy.md), and
[`readiness_round_report_template.md`](readiness_round_report_template.md)._

This is a **founder-side triage aid**. Every closed-alpha round produces
verbatim Korean tester quotes. The goal is to convert each quote into one
of four next actions — `stop` / `next-patch` / `nice-to-have` / `later` —
without re-deriving the call from scratch.

It is **not** a script to be read aloud to testers. The tester gets only
[`tester_feedback_form_template.md`](tester_feedback_form_template.md).

## How to use

1. Sit with the tester quotes in §10.4 of the round report.
2. For each quote, find the closest **Quote pattern** row below.
3. Apply the **Severity** column directly.
4. Apply the **What NOT to do** column before writing any patch.
5. Use the **Recommended next patch** column as the seed for §10.6 of
   the round report — never as a final spec.
6. If the **Example safe Korean copy** column applies, propose a copy
   variant from
   [`../corent_readiness_copy_experiment_backlog.md`](../corent_readiness_copy_experiment_backlog.md)
   first — do not invent new strings until the backlog is exhausted.

When two rows could match, prefer the higher severity row.

## Hard rules that override every recommendation here

The recommendations below assume the
[`CLAUDE.md`](../../CLAUDE.md) and
[`corent_closed_alpha_quality_gates.md`](../corent_closed_alpha_quality_gates.md)
rules still bind. In particular:

- Never patch in copy that contains `보증`, `보증금`, `보험`, `보장`,
  `결제 완료`, `결제 진행`, `결제 처리`, `보증금 청구`, `대여 확정`,
  `환불`, `정산 완료`, `guaranteed`, `insured`, `insurance`, or
  `verified seller`.
- Never patch in real payment, deposit, escrow, settlement, refund,
  insurance, handoff, return, claim, dispute, notification, or external
  webhook flows.
- Never widen the borrower-facing public DTO to expose
  `rawSellerInput`, `privateSerialNumber`, exact contact, exact pickup,
  payment internals, settlement internals, or trust internals.
- Readiness-card copy stays in the closed vocabulary in
  [`tryBeforeBuyReadinessService.ts`](../../src/lib/services/tryBeforeBuyReadinessService.ts)
  and
  [`sellerListingReadinessService.ts`](../../src/lib/services/sellerListingReadinessService.ts);
  any new caption must be added in code with a banlist test, not in a
  one-off render path.

If a recommendation below would force a violation of any of the above,
the recommendation is **not the right next patch** — the right next patch
is "do nothing yet, log under §10.5 as `later`".

## Quote → action table

Each row covers a recurring tester reaction. **Severity** maps directly
to the round report:

- `stop` — close the smoke and patch before the next tester sees it.
- `next-patch` — file as the next 1-PR slice; safe to keep testing in
  the meantime.
- `nice-to-have` — log; consider when there is no `stop` / `next-patch`
  open.
- `later` — out of pre-revenue scope; do not patch now.

| # | Tester quote pattern (KR) | Severity | Diagnosis | What NOT to do | Recommended next patch | Example safe Korean copy |
|---|---|---|---|---|---|---|
| 1 | "결제가 시작된 줄 알았어요." / "이미 카드에서 빠져나간 것 같아요." | **stop** | Payment-implied copy on `/listings/[id]`, `/requests`, success panel, or `/dashboard`. The non-payment caption is either missing, drowned out by surrounding copy, or contradicted by a button/label that reads like a checkout. | Do not respond by adding a "결제 안 됨" disclaimer next to a button labeled like a payment CTA. Do not add toast-only fixes that vanish in 3s. Do not add a fee/price total that reads like a charge. | (a) Audit every visible string on the offending route against the readiness banlist test. (b) Promote the `nonPaymentCaption` from `tryBeforeBuyReadinessService` so it renders **above** the request CTA, not only inside the readiness card. (c) Add a copy-guardrail test that fails the build if the page exposes any literal containing `결제 진행` / `결제 완료` / `결제 처리`. | "아직 결제는 발생하지 않아요. 요청만 전송돼요." (existing) — promote in DOM order so it precedes the CTA. |
| 2 | "책임 기준이 무서워요." / "물건 망가지면 다 물어내야 한다는 거잖아요?" | **next-patch** | Responsibility-framing reads as unbounded liability. The phrase `책임 기준` correctly avoids regulated language but the surrounding copy doesn't bound the basis (estimated value) or explain that exact terms are settled with the seller after response. | Do not soften by switching to `보증` / `보증금` / `보험` / `보장` — that is forbidden framing and a regulated-language risk. Do not promise "보장" / "안전 보장" anywhere. Do not introduce a CoRent-side promise (e.g. "CoRent가 책임집니다"). | Run a copy experiment from [`../corent_readiness_copy_experiment_backlog.md`](../corent_readiness_copy_experiment_backlog.md) §"책임 기준" — pick the `less scary` and `more concrete` variants, A/B with the next 2 testers, keep the one that scores higher on Q2 sentiment in the form. | "사용 중 이상이나 분실이 발생하면 셀러와 책임 기준에 따라 협의하게 돼요. 정확한 책임 기준은 셀러 응답 후 다시 안내돼요." (existing). Variant: "책임 기준은 예상 가치에 맞춰 셀러와 함께 정해요. 지금 단계에서 결제·청구가 되는 건 아니에요." |
| 3 | "그래서 뭘 확인할 수 있다는 건지 모르겠어요." / "이거 보고도 잘 모르겠어요." | **next-patch** | Readiness card body is too generic for the listing's category, or category-specific points are present but buried under universal copy. Borrower didn't form a try-before-buy mental model. | Do not respond by adding more bullet points. Do not let an LLM expand the list freely — the closed vocabulary in `TRY_POINTS_BY_CATEGORY` is the authority. | (a) Confirm the listing's `category` resolves to a populated branch in `TRY_POINTS_BY_CATEGORY`. (b) If yes, propose 1–2 sharper category-specific lines and add a regression case in `tryBeforeBuyReadinessService.test.ts`. (c) If no (rare today, but possible after schema widening), add the new category branch with a calm 2–3 line set rather than reusing `GENERIC_TRY_POINTS`. | (마사지건 example) "진동 강도가 본인 어깨·종아리에 맞는지 짧게 시도해볼 수 있어요." / "1시간 사용 후 발열·소음이 변하는지 확인할 수 있어요." |
| 4 | "그냥 당근에서 빌리면 되지 않나요?" / "중고나라랑 뭐가 달라요?" | **next-patch** | Differentiation gap. Tester didn't read the page as "사기 전에 며칠 써보기"; they read it as a generic P2P rental. The `사기 전에` framing isn't reaching them on `/search` or `/listings/[id]`. | Do not respond by attacking competitors in copy. Do not add badges like "verified seller" or "safe seller" — both are forbidden. Do not push the brand promise into the readiness card body; that surface is for product try-before-buy points. | (a) Tighten the `/search` `추천 이유` pill set so at least one card per result reads `구매 전 체험` (already in the deterministic match-hint vocabulary). (b) On `/listings/[id]` add (in copy only) a one-line page sub-caption — e.g. "구매 전에 며칠 써볼 수 있어요." — above the existing request panel. Banlist test must still pass. | "구매 전에 며칠 써본 뒤 결정해 보세요." / "사기 전에 직접 사용해 보고 결정할 수 있어요." |
| 5 | (셀러) "고장 나면 누가 책임져요?" / "잃어버리면 어떻게 돼요?" | **next-patch** | Seller-fear gap on `/dashboard`'s seller readiness panel. The `책임 기준 안내` pill is present but the seller doesn't see how the basis applies to their item or what CoRent does vs. doesn't do during the beta. | Do not promise CoRent will pay out. Do not introduce `보증` / `보험` / `보장`. Do not promise an SLA or claim resolution. The pre-revenue posture forbids both. | (a) Add a status-baseline nudge in `sellerListingReadinessService` that, when triggered, recommends recording condition + photographed components at handoff (still future, surfaced as a checklist-only nudge today). (b) Tighten the seller readiness panel footer copy so the rejected-only / pending / approved branches each carry one calm line about what happens if the borrower reports an issue (협의 process), without claiming a payout. | "사용 중 문제가 생기면 보더(借)와 셀러가 책임 기준에 따라 함께 협의해요. 청구·결제 단계는 아직 연결되어 있지 않아요." |
| 6 | (셀러) "사진 찍고 설명 쓰는 게 귀찮아요." / "한 번에 다 입력하기 어려워요." | **next-patch** | Seller-effort gap. Today the chat intake card already collects free text → AI candidate; what's missing is the *friction signal* that "the AI does most of this for you" reaching the seller before they bail. | Do not promise an LLM-authoritative listing — LLM output is candidate-only per the [quality gates](../corent_closed_alpha_quality_gates.md) and [intent rules](../corent_functional_mvp_intent_rules.md). Do not auto-publish — public listings still require operator review. Do not add a real-LLM SDK call now (gated by security review). | (a) Tighten the chat intake card's pre-upload copy to set expectation: 한 줄 설명만 적어도 후보가 자동으로 정리돼요, 마지막엔 본인이 확인해요. (b) Add a "checklist" preview in the seller readiness panel that names the *category-specific* fields the AI will try to extract first, so the seller knows where to start. | "한두 줄만 입력해도 AI가 후보를 정리해 드려요. 마지막엔 본인이 확인하고 등록해요." |
| 7 | "보증금은 얼마예요?" / "보증금 미리 내야 하나요?" | **stop** | Responsibility-vs-deposit confusion. The `책임 기준` framing has been read as `보증금`. This is the highest-risk semantic drift in the alpha because `보증금` is a forbidden word that implies money movement. | Do NOT answer with a number. Do NOT type the word `보증금` even in a chat reply or a doc. Do NOT add an "예상 보증금" preview field. | (a) Confirm no surface ever renders the word `보증금` (the banlist test should already enforce this — re-run [`copyGuardrails.test.ts`](../../src/lib/copy/copyGuardrails.test.ts)). (b) Add a calm Q&A line to the readiness card's `책임 기준` caption that pre-empts the question: "지금 단계에서는 결제도, 보증금 청구도 발생하지 않아요." (uses negated banned phrase only as a denial, which is allowed by the quality-gates rule, but **must** be kept inside the closed vocabulary in `tryBeforeBuyReadinessService` and added to the banlist test as an explicit allowed-negation case, not a generic exception). | Tester-facing reply (founder, not in product copy): "지금 단계에서는 결제도, 보증금 청구도 발생하지 않아요. 책임 기준은 사용 중 이상·분실이 생겼을 때 셀러와 협의하기 위한 기준이에요." |
| 8 | "보험 되나요?" / "다치면 보험 처리돼요?" | **stop** | Forbidden insurance expectation. The product is being read as an insured rental, which it is not and cannot be in pre-revenue beta. | Do NOT type `보험` in any product copy, ever. Do NOT promise injury / loss coverage. Do NOT introduce a "안심 모드" / "안전 가입" toggle — that reads as insurance even without the word. | (a) Confirm no surface renders the word `보험` (banlist test should enforce). (b) Founder-only response (not in product copy): the platform is currently **C2C 협의 기반 책임 기준** and a partner-mediated payment + protection layer is a future, separately-gated step. Log the request under §10.5 of the round report as `later`. | Tester-facing reply (founder, not in product copy): "현재는 보험 상품이 연결되어 있지 않아요. 셀러와 책임 기준에 따라 협의하는 단계예요. 정식 출시 전에 정식 PG·파트너 보호가 연결될 예정이에요." |
| 9 | "택배로 받을 수 있나요?" / "배송 되나요?" | **later** | Logistics friction. Direct pickup-only is a deliberate MVP scope decision (see [CLAUDE.md](../../CLAUDE.md) — Rental method). | Do not add a delivery option toggle. Do not add a "배송 가능" badge on `/search`. Do not change pickup_area copy to imply delivery is on the roadmap soon. | (a) Log under §10.5 as `later`, not `next-patch`. (b) If multiple testers ask in the same round, capture under [`../corent_category_wedge_research_checklist.md`](../corent_category_wedge_research_checklist.md) — categories with high logistics friction may need to drop in priority, not the other way around. | Tester-facing reply (founder, not in product copy): "지금은 직접 픽업·반납만 지원해요. 배송 옵션은 더 나중 단계예요." |
| 10 | "실제로 돈을 내고 빌리고 싶어요." / "결제까지 진짜 해보고 싶어요." | **later** | Real payment expectation. Payment integration is gated behind partner contract + security review (see [`corent_security_gate_note.md`](../corent_security_gate_note.md) and [`corent_legal_trust_architecture_note.md`](../corent_legal_trust_architecture_note.md)). | Do NOT enable a payment adapter. Do NOT install Toss/Stripe/PortOne SDK. Do NOT add a fake "결제하기" button — that creates the exact `결제가 시작된 줄 알았어요` failure from row 1. | (a) Log under §10.5 as `later`. (b) Use the request as evidence for the partner pipeline conversation per [`corent_defensibility_note.md`](../corent_defensibility_note.md) — share validated demand, not the raw idea. | Tester-facing reply (founder, not in product copy): "지금은 베타 단계라 실제 결제는 아직 연결되어 있지 않아요. 정식 출시에는 PG 파트너를 통한 결제·정산이 연결될 예정이에요." |
| 11 | "내가 등록한 물건 누가 가져갈지 어떻게 알아요?" / "처음 보는 사람한테 빌려줘도 되나요?" | **next-patch** | Seller trust gap, distinct from row 5. Seller is not afraid of the responsibility basis — they're afraid of the borrower identity. | Do not promise `verified seller` or `verified borrower` (forbidden framing). Do not invent a "신원 확인 완료" badge. Do not surface borrower email / phone — those are private fields off-limits to the seller until partner-mediated handoff. | (a) Add a status-aware seller readiness footer line for the case where a request has arrived: "요청 단계에서는 보더의 닉네임·요약만 보여요. 픽업 일정은 셀러가 협의 후 확정해요." (b) Reinforce that the cockpit / dashboard will surface request reasons / category-fit on the seller side in a future slice — log under §10.5 if the tester pushed harder. | "요청 단계에서는 보더의 닉네임·요약만 보여요. 직접 연락·픽업 일정은 수락 후 협의해서 정해요." |
| 12 | "사진이 부족해요." / "실제 상태를 못 믿겠어요." | **next-patch** | Photo / condition baseline gap. The borrower can't validate condition before requesting because the listing has fewer than 3 photos or a vague condition string. | Do not introduce a "verified seller" badge. Do not auto-rate condition with an LLM (LLM is candidate-only). Do not show seller's exact location to compensate. | (a) Tighten the seller readiness panel's `사진은 정면·측면·구성품을 모두 포함하면 좋아요` nudge so it appears as a *first* recommendation when listing photo count is low. (Note: today the DTO doesn't carry photo count — adding that is a deliberate widening, log under §10.5 if you want to act on it.) (b) Add a borrower-side `요청 전 확인할 점` line inviting the borrower to ask the seller for a missing-angle photo before requesting. | "사진에서 보이지 않는 면이 있다면 요청 전 셀러에게 한 장 더 요청해 주세요." |
| 13 | "체험 후에 사고 싶으면 그 셀러한테 그냥 살 수 있나요?" | **nice-to-have** | Post-trial purchase intent. This is *the* try-before-buy thesis being expressed positively. The current product doesn't model "체험 후 구매 전환" yet, but that's a feature, not a bug. | Do not bolt a buy-now button on now. Do not collect the buyer's payment intent into a CoRent flow — that crosses pre-revenue. | (a) Capture verbatim under §10.5 as `nice-to-have` and tag with the `request intent` taxonomy entry. (b) If 2+ testers express this in the same round, raise to `next-patch` and consider a copy-only nudge on the success panel: "체험 후 구매를 원하면 셀러와 직접 협의할 수 있어요." | "체험 후 구매를 원하면 셀러와 직접 협의할 수 있어요. CoRent는 협의 채널만 제공해요." |
| 14 | "AI가 뭘 자동으로 한 거예요?" / "이거 진짜 AI가 한 거예요?" | **nice-to-have** | AI provenance gap. Tester noticed `자동으로 정리한 안내예요` but doesn't know what is deterministic vs. LLM-candidate vs. human-reviewed. | Do not relabel deterministic readiness as "AI". The provenance field on `tryBeforeBuyReadinessService` is `"deterministic"` for a reason. | (a) Confirm the readiness card sub-caption is `자동으로 정리한 안내예요. 셀러 응답 전에 다시 확인해 주세요.` (existing). (b) For LLM-candidate fields elsewhere (chat intake), keep the existing `참고용` framing. (c) If pressure is high, add a one-line tooltip / footnote: "이 카드는 셀러가 입력한 정보로 자동 정리됐어요. 모델이 임의로 만든 내용은 아니에요." | "이 카드는 셀러가 입력한 정보로 자동 정리됐어요. 모델이 임의로 만든 내용은 아니에요." |
| 15 | "왜 비싸요?" / "이 가격이면 그냥 사겠어요." | **nice-to-have** | Price/value perception gap, **category-dependent**. Most try-before-buy categories (마사지건, 빔프로젝터, UMPC, 카메라) only make sense if the rental fee is meaningfully below the value-per-trial-day. | Do not auto-discount. Do not introduce dynamic pricing — fee model is fixed at "no platform fee in beta", per [`corent_pre_revenue_beta_plan.md`](../corent_pre_revenue_beta_plan.md). | (a) Log under §10.5 with the listing id and the tester's expected price. (b) If 3+ testers in the same round flag the same category as overpriced, surface the data in [`../corent_category_wedge_research_checklist.md`](../corent_category_wedge_research_checklist.md) before changing any seller-facing pricing copy. | None today — pricing copy stays unchanged in pre-revenue beta. |
| 16 | "이 페이지가 빈 것 같아요." / "공개된 물건이 안 보여요." | **stop** | Empty-state / server-mode misconfiguration. `/search` or `/dashboard` is hitting an empty server result and showing no fallback (or worse, hiding the calm error per quality gates). | Do not respond by re-seeding static `PRODUCTS` on `/search`. Do not flip a `mock` flag in production-like preview to "fix" the empty state. | (a) Verify the dev preview is wired to `corent-dev` (per smoke template §3). (b) If genuinely no approved listing, follow §3.4 of the smoke template (publish a fresh draft via cockpit). (c) If yes there are approved listings but they're not rendering, the public DTO projection is broken — file as `stop`. | None — the fix is configuration / publication, not copy. |
| 17 | (셀러) "거절하면 보더가 화내지 않을까요?" | **nice-to-have** | Seller declination friction. Seller has the authority to decline (per `corent_next_actions_2026-05-05.md` task 5/6 already shipped) but feels social pressure. | Do not auto-decline. Do not add a "관리자 거절" workflow that hides the seller — they own the decision. | (a) Add a calm seller-side caption near the decline button reinforcing that decline is normal and expected (without forcing reasons): "거절은 보더와 협의가 안 맞을 때 자연스러운 선택이에요. 사유는 선택 사항이에요." | "거절은 자연스러운 선택이에요. 사유는 선택 사항이에요." |
| 18 | "닉네임 / 프로필이 너무 적어요." | **nice-to-have** | Identity-density gap. Both sides want more profile info. Today's profile DTOs are deliberately narrow (per quality gates DTO/Projection rules). | Do not add free-form bios that could leak PII or external links. Do not surface email / phone. Do not add a `verified` badge of any kind. | (a) Log under §10.5 as `nice-to-have`. (b) If 2+ raise it, consider a future slice that adds *category-bounded* tags ("주로 마사지건 셀러", "주로 카메라 보더") sourced from listing/request history — not free text. | None today — profile DTO widening is a separate gated decision. |

## Quick decision checklist

Before filing any patch from the table above:

- [ ] Quote is captured **verbatim Korean** in the round report §10.4.
- [ ] Severity from the table matches what the founder typed in §10.5.
- [ ] The taxonomy tag from
      [`readiness_feedback_taxonomy.md`](readiness_feedback_taxonomy.md)
      is attached.
- [ ] The "What NOT to do" column has been read and acknowledged.
- [ ] If the patch involves new user-facing copy, the candidate string
      is sourced from the
      [`copy experiment backlog`](../corent_readiness_copy_experiment_backlog.md)
      first, not invented inline.
- [ ] If the patch involves a new readiness-card sentence, it lives in
      `tryBeforeBuyReadinessService` or `sellerListingReadinessService`,
      not in a render path, and a new banlist test row is added in
      [`copyGuardrails.test.ts`](../../src/lib/copy/copyGuardrails.test.ts).

End of decision aid.
