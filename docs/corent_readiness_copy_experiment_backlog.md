# CoRent readiness copy experiment backlog

> **Status:** Pattern Source
> **Scope:** pre-approved Korean copy variants for the readiness
> card, the seller readiness panel, the request confirmation
> panel, the search match-reason pills, and the wanted-try-
> request form (§10).
> **Reusable pattern:** the closed-vocabulary copy backlog →
> banlist-clean variant → tester round → winner selection
> discipline. This is the pattern that survives; the rental-
> copy roadmap does not.
> **Superseded by:** [`platform_thesis_ai_interaction_layer.md`](platform_thesis_ai_interaction_layer.md)
> + [`platform_pivot_note_2026-05-07.md`](platform_pivot_note_2026-05-07.md).
> Future platform copy experiments (e.g.
> `PreActionChecklistBlock` content) will reuse this discipline.
> **Last reviewed:** 2026-05-07 (demoted to Pattern Source per
> the 2026-05-07 platform pivot).
> **Read before:** any future ComponentBlock-registry slice that
> needs to express a copy-variant backlog generically.
> **Do not use for:** active rental-copy roadmap, marketplace
> growth copy, public-launch copy. Body unchanged; existing
> closed-alpha CoRent surfaces may still pick variants from it
> as alpha-ops continuity.

_Companion to [`smoke_runs/readiness_feedback_decision_aid.md`](smoke_runs/readiness_feedback_decision_aid.md),
[`smoke_runs/readiness_feedback_taxonomy.md`](smoke_runs/readiness_feedback_taxonomy.md),
[`smoke_runs/readiness_round_report_template.md`](smoke_runs/readiness_round_report_template.md),
and [`corent_closed_alpha_quality_gates.md`](corent_closed_alpha_quality_gates.md)._

This is the **canonical source of next-round Korean copy candidates**
for the readiness flow. The decision aid points testers' verbatim
quotes at one of the experiments below; the founder picks a single
variant before the next round; the round report's §12 records what
shipped.

## Hard rules for every variant in this file

Every candidate string below has been written to satisfy ALL of the
following without exception. If a variant is later found to violate
any of them, **delete the variant** rather than weaken the rule.

- Must NOT contain any of: `보증`, `보증금`, `보험`, `보장`,
  `결제 완료`, `결제 진행`, `결제 처리`, `보증금 청구`, `대여 확정`,
  `환불`, `정산 완료`, `guaranteed`, `insured`, `insurance`,
  `verified seller`.
- May negate the same words **only inside the closed copy vocabulary
  in [`tryBeforeBuyReadinessService`](../src/lib/services/tryBeforeBuyReadinessService.ts)
  / [`sellerListingReadinessService`](../src/lib/services/sellerListingReadinessService.ts)**,
  and only as an explicit allowed-negation row in
  [`copyGuardrails.test.ts`](../src/lib/copy/copyGuardrails.test.ts).
  Do NOT scatter negated banned words across arbitrary surfaces.
- Must respect the [BW Swiss Grid v1](corent_design_system_bw_v1.md)
  type scale. No emojis. No decorative punctuation. No exclamation
  points outside very rare confirmations.
- Must remain truthful in pre-revenue beta — do not promise payouts,
  insurance, or settlement. See
  [`corent_pre_revenue_beta_plan.md`](corent_pre_revenue_beta_plan.md).
- Must not depend on payment / deposit / handoff / return / claim /
  dispute / notification flows that are still gated.

## Hypothesis labels

Each experiment row is annotated with one of five hypothesis labels.
Pick the label that matches the tester signal that triggered it; do
not stack labels on a single variant.

- **`less scary`** — variant aims to reduce the `fear` /
  `responsibility-wording` tag rate.
- **`more concrete`** — variant aims to reduce the `clarity` tag rate
  by making the value of try-before-buy explicit.
- **`more premium`** — variant aims to read as a higher-trust,
  higher-quality service. Useful when the test landing reads
  bargain-y.
- **`more seller-safe`** — variant aims to reduce the
  `seller-willingness+seller-fear` tag rate.
- **`more buyer-actionable`** — variant aims to reduce the
  `clarity+request-intent` tag rate by giving the borrower a clear
  next action.

## Winner-selection rule

For each experiment, the founder commits ahead of the round to the
**single signal** that picks the winner. Pick from:

- **Q1 sentiment shift** (사용감 이해도) — measured against
  `명확함 / 모호함 / 무서움 / 안심됨 / 혼란스러움` from the tester
  form. Winner = variant where ≥ 60% of testers in the round picked
  `명확함` or `안심됨` over the opposite tags.
- **Q2 sentiment shift** (책임 기준 어휘) — same scale, focused on
  `책임 기준`.
- **Q3 sentiment shift** (결제 시작 인식) — winner = variant where
  ZERO testers in the round picked `무서움` or said any payment-imply
  quote.
- **Q4 hesitation count** — count of "멈칫했던 부분" mentions. Winner
  = lower count.
- **Q5 sentiment shift** (셀러 입장 상상) — winner = variant where
  ≥ 60% of seller-framing testers said `등록할 것 같아요`-shaped quote.
- **Tag tally drop** — winner = variant where the targeted tag's
  count in §7 of the round report drops by ≥ 1 vs. previous round on
  the same listing pool.

If two variants tie, **keep the existing copy** until the next round.
Do not ship a tie.

---

## 1. `구매 전 확인할 수 있는 것` heading + sub-caption

**Surface**: `/listings/[id]` readiness card heading + the
sub-caption directly under it.

**Source string in code**: heading literal in the readiness card
component;
[`tryBeforeBuyReadinessService.ts`](../src/lib/services/tryBeforeBuyReadinessService.ts)
provides the body. The heading and sub-caption live on the render
component but should be tightened in tandem.

**Current**

| Slot | Current Korean |
| --- | --- |
| Heading | `구매 전 확인할 수 있는 것` |
| Sub-caption | `자동으로 정리한 안내예요. 셀러 응답 전에 다시 확인해 주세요.` |

**Variants**

| ID | Hypothesis | Heading | Sub-caption | Winner signal |
| --- | --- | --- | --- | --- |
| 1A | `more concrete` | `구매 전, 며칠 써보면서 확인할 수 있는 것` | `자동으로 정리한 안내예요. 셀러가 응답하면 한 번 더 안내돼요.` | Q1 sentiment shift |
| 1B | `more buyer-actionable` | `구매 전 직접 확인할 수 있는 것` | `이 카드의 항목을 한 번 읽고, 본인에게 맞는 기간을 골라 요청해 주세요.` | Q4 hesitation count |
| 1C | `more premium` | `구매 전 직접 체험으로 확인할 수 있는 것` | `자동으로 정리한 안내예요. 본인이 다시 확인한 뒤 요청해 주세요.` | Q1 sentiment shift |

## 2. `요청 전 확인할 점` column heading

**Surface**: `/listings/[id]` readiness card right-column heading.

**Current**: `요청 전 확인할 점`

**Variants**

| ID | Hypothesis | Variant | Winner signal |
| --- | --- | --- | --- |
| 2A | `more concrete` | `요청 보내기 전 한 번 더 볼 점` | Q4 hesitation count |
| 2B | `more buyer-actionable` | `요청 전 본인이 확인할 점` | Q4 hesitation count |
| 2C | `less scary` | `요청 전 가볍게 점검할 점` | Q1 sentiment shift |

## 3. `책임 기준` caption (responsibility framing)

**Surface**: bottom of `/listings/[id]` readiness card. Same string
also surfaces partially on the seller readiness panel as
`responsibilityBasisLabel`.

**Source string in code**:
[`tryBeforeBuyReadinessService.ts`](../src/lib/services/tryBeforeBuyReadinessService.ts)
field `responsibilityCaption`.

**Current**

> 사용 중 이상이나 분실이 발생하면 셀러와 책임 기준에 따라 협의하게
> 돼요. 정확한 책임 기준은 셀러 응답 후 다시 안내돼요.

**Variants**

| ID | Hypothesis | Variant | Winner signal |
| --- | --- | --- | --- |
| 3A | `less scary` | "책임 기준은 예상 가치에 맞춰 셀러와 함께 정해요. 지금 단계에서 결제·청구가 되는 건 아니에요." | Q2 sentiment shift |
| 3B | `more concrete` | "사용 중 이상·분실이 생기면, 사용 전 사진과 셀러가 입력한 정보를 기준으로 함께 협의해요. 자세한 기준은 셀러 응답 후 다시 안내돼요." | Q2 sentiment shift |
| 3C | `more buyer-actionable` | "책임 기준은 예상 가치 기준이에요. 요청 전, 본인이 다룰 수 있는 범위인지 한 번 확인해 주세요." | Q4 hesitation count |
| 3D | `more premium` | "책임 기준은 예상 가치를 기준으로 셀러와 함께 정해요. 결제·정산은 정식 단계에서만 진행돼요." | Q2 sentiment shift |

## 4. Non-payment footer caption

**Surface**: footer of `/listings/[id]` readiness card AND echoed near
`/dashboard` 셀러 패널 footer (text differs slightly per surface).

**Source string in code**:
[`tryBeforeBuyReadinessService.ts`](../src/lib/services/tryBeforeBuyReadinessService.ts)
field `nonPaymentCaption`.

**Current**

> 아직 결제·픽업·정산은 시작되지 않아요. 요청 전 책임 기준을 다시
> 확인해요.

**Variants**

| ID | Hypothesis | Variant | Winner signal |
| --- | --- | --- | --- |
| 4A | `less scary` | "지금은 요청 단계예요. 결제도, 픽업도, 정산도 아직 시작되지 않아요." | Q3 sentiment shift |
| 4B | `more concrete` | "요청 보내기 = 셀러에게 알리는 단계예요. 결제·픽업·정산은 그다음 단계로, 지금은 시작되지 않아요." | Q3 sentiment shift |
| 4C | `more buyer-actionable` | "요청 보내기 전 책임 기준을 한 번 더 확인해 주세요. 결제·픽업·정산은 셀러 응답 이후의 단계예요." | Q4 hesitation count |
| 4D | `more premium` | "현재 베타에서는 요청까지만 처리돼요. 결제·픽업·정산은 정식 단계에서 안내돼요." | Q3 sentiment shift |

> Reminder: variants in this section may negate the banned words
> `결제` / `정산` / `보증금` only because they live in the closed
> readiness vocabulary on
> [`tryBeforeBuyReadinessService.ts`](../src/lib/services/tryBeforeBuyReadinessService.ts)
> and the existing
> [`copyGuardrails.test.ts`](../src/lib/copy/copyGuardrails.test.ts)
> already pins these as allowed-negation. Do not copy these strings
> into other components.

## 5. Seller readiness panel heading + sub-caption

**Surface**: `/dashboard` 셀러 readiness panel heading + sub-caption.

**Current**

| Slot | Current Korean |
| --- | --- |
| Heading | `공개·요청 전 더 신뢰를 주려면` |
| Sub-caption | `자동으로 정리한 안내예요. 구성품·상태·수령 권역을 먼저 확인해 주세요.` |

**Variants**

| ID | Hypothesis | Heading | Sub-caption | Winner signal |
| --- | --- | --- | --- | --- |
| 5A | `more seller-safe` | `요청을 받기 전, 한 번만 더 다듬을 수 있는 것` | `자동으로 정리한 안내예요. 구성품·상태·수령 권역을 먼저 확인해 주세요.` | Q5 sentiment shift |
| 5B | `more concrete` | `보더가 신뢰하기 좋게 다듬는 항목` | `사진·구성품·수령 권역만 정리해도 요청이 더 안정적으로 들어와요.` | Q5 sentiment shift |
| 5C | `more premium` | `리스팅을 더 단정하게 다듬는 항목` | `자동으로 정리한 안내예요. 한 번만 더 정리해도 보더의 첫인상이 달라져요.` | Q5 sentiment shift |

## 6. Seller readiness panel footer (status-aware)

**Surface**: `/dashboard` 셀러 readiness panel footer caption.
The current copy already branches across `empty`,
`pending / draft`, `all approved`, `partial rejected`, and
`rejected only`. Variants here propose **calmer / more seller-safe**
phrasings; they replace the existing branch, not add new branches.

**Source string in code**:
[`sellerListingReadinessService.ts`](../src/lib/services/sellerListingReadinessService.ts)
fields `EMPTY_CAPTION` / `PENDING_CAPTION` / `ALL_APPROVED_CAPTION` /
`PARTIAL_REJECTED_CAPTION` / `REJECTED_ONLY_CAPTION`.

**Current** (per branch — see service file for the exact strings).

**Variants** (one row per branch × hypothesis)

| Branch | ID | Hypothesis | Variant | Winner signal |
| --- | --- | --- | --- | --- |
| empty | 6A.1 | `more seller-safe` | "리스팅을 1개 등록해 보면, 그다음 안내가 자연스럽게 이어져요." | Q5 sentiment shift |
| pending / draft | 6B.1 | `more seller-safe` | "검토 중인 리스팅이 있어요. 운영자 검토가 끝나면 다시 안내돼요. 그동안 추천 항목을 한 번만 더 점검해 주세요." | Q5 sentiment shift |
| all approved | 6C.1 | `more premium` | "모든 리스팅이 공개되어 있어요. 시즌·재고가 바뀌면 추천 항목을 한 번씩 다시 봐 주세요." | Q5 sentiment shift |
| partial rejected | 6D.1 | `more seller-safe` | "공개된 리스팅과 보류된 리스팅이 함께 있어요. 보류된 항목은 추천 내용을 정리한 뒤 다시 시도하면 통과 가능성이 높아져요." | Q5 sentiment shift |
| rejected only | 6E.1 | `more seller-safe` | "현재는 모두 보류 상태예요. 추천 항목을 정리한 뒤 다시 등록해 보면 다음 검토에 통과할 가능성이 높아져요." | Q5 sentiment shift |

## 7. Request confirmation copy (success panel)

**Surface**: `/listings/[id]` request submission success panel.

**Current**

> 요청이 전송되었어요. 셀러의 응답을 기다리는 중이에요.
> 아직 대여가 확정된 것은 아니에요. 셀러 승인 + 일정 합의 이후에
> 다음 단계로 넘어가요.

**Variants**

| ID | Hypothesis | Variant | Winner signal |
| --- | --- | --- | --- |
| 7A | `less scary` | "요청을 셀러에게 알렸어요. 결제·픽업은 아직 시작되지 않아요. 셀러 응답이 오면 `/requests`에서 다음 안내가 보여요." | Q3 sentiment shift |
| 7B | `more buyer-actionable` | "요청이 셀러에게 전달됐어요. 셀러 응답이 오면 `/requests`에서 다음 단계 안내를 받게 돼요. 그동안 다른 리스팅도 비교해 보세요." | Q4 hesitation count |
| 7C | `more premium` | "요청을 정상적으로 보냈어요. 셀러 응답까지는 잠깐 시간이 걸릴 수 있어요. 결제·픽업 단계는 셀러 응답 이후에 안내돼요." | Q3 sentiment shift |

## 8. `/search` match reason copy

**Surface**: each `/search` card's `추천 이유` and `확인할 점` pill
sets. The pill **vocabulary** is closed and lives in the
deterministic match-hint module. Variants here propose new pill
*strings* — they must be added to that module + the banlist test row,
not invented at render time.

**Current pills (selected)**

- `추천 이유`: `카테고리 일치`, `<권역> 픽업`, `1일 체험에 적합`,
  `구매 전 체험`, `희망 가격 이내`
- `확인할 점`: `결제·픽업 전 단계`, `구성품 확인 필요`

**Variants**

| ID | Hypothesis | Pill set | Variant strings | Winner signal |
| --- | --- | --- | --- | --- |
| 8A | `more concrete` | 추천 이유 | `사기 전 며칠 체험`, `같은 카테고리 비교 가능` | Q4 hesitation count |
| 8B | `more buyer-actionable` | 확인할 점 | `요청 전 사진 한 장 더 요청 가능`, `픽업 일정 협의 단계` | Q4 hesitation count |
| 8C | `more premium` | 추천 이유 | `구매 전 직접 체험`, `예상 가치 기준 책임` | Q1 sentiment shift |

> Reminder: pill strings must stay short (≤ 12 Korean chars where
> possible) and dashed-border per
> [`corent_design_system_bw_v1.md`](corent_design_system_bw_v1.md).
> No filled-black pills inside `/search` recommendation pills (those
> imply confirmed authority). No banned words.

## 9. Banned-word denial preempt (Q&A line)

**Surface**: small caption next to the responsibility basis pill on
`/listings/[id]`. **Optional** — only ship if `payment-confusion+
보증금` quotes appear in 2+ rounds.

**Current**: not present.

**Variants** (each must add a corresponding allowed-negation row to
[`copyGuardrails.test.ts`](../src/lib/copy/copyGuardrails.test.ts)
under the readiness vocabulary).

| ID | Hypothesis | Variant | Winner signal |
| --- | --- | --- | --- |
| 9A | `less scary` | "지금 단계에서는 결제도, 보증금 청구도 발생하지 않아요." | Q3 sentiment shift |
| 9B | `more buyer-actionable` | "지금은 요청 단계예요. 결제·보증금 청구는 정식 단계에서만 안내돼요." | Q3 sentiment shift |

> 9A / 9B intentionally negate banned words to preempt a high-risk
> tester misread (`보증금은 얼마예요?`). Ship at most one. Do **not**
> ship anywhere outside the closed readiness vocabulary.

## 10. Wanted Try Request — `/search` empty state

**Surface**: `/search` empty result panel + the wanted-try-request
form that opens from it. Plan: [`corent_wanted_try_request_slice_plan.md`](corent_wanted_try_request_slice_plan.md).

**Source string in code (proposed for PR 2)**: `EmptyResults` in
[`SearchResults.tsx`](../src/components/SearchResults.tsx) +
new `WantedTryRequestForm` component. New strings must round-
trip through this section before shipping; new strings invented
inline at render time fail review.

The current `EmptyResults` copy ("조건에 맞는 물건이 아직 없어요.
조건을 줄이면 더 많은 결과가 나와요…") is a **dead-end**. The
variants below replace it with try-before-buy framing + a
demand-capture CTA.

**Hypothesis labels** apply per row (less scary / more concrete /
more premium / more buyer-actionable). `more seller-safe` is not
relevant here because there is no seller-facing copy in the
slice.

### 10.1 Empty-state CTA panel (replaces current `EmptyResults`)

| ID | Hypothesis | Heading | Body | Primary CTA label | Winner signal |
| --- | --- | --- | --- | --- | --- |
| 10A | `more buyer-actionable` | `조건에 맞는 매물이 아직 없어요.` | "사기 전에 며칠 써보고 싶다는 생각은 그대로 유효해요. 같은 물건을 가진 셀러가 보면 다시 안내드려요. 자동으로 매칭되거나 결제·픽업·정산이 시작되지는 않아요." | `써보고 싶다고 알리기` | wanted-request submit count per round |
| 10B | `more concrete` | `이 물건은 아직 등록된 매물이 없어요.` | "어떤 물건을 사기 전에 써보고 싶은지 한 줄로 남겨 주세요. 같은 물건을 가진 셀러가 보면 운영자가 다시 안내드려요." | `써보고 싶다고 알리기` | Q1 sentiment shift on category-known queries |
| 10C | `less scary` | `매물이 비어 있어요. 그래도 신호는 받을 수 있어요.` | "사기 전에 며칠만 써볼 수 있으면 좋겠다는 신호를 남겨 주세요. 자동 매칭은 아니에요." | `신호 남기기` | submit rate on empty queries |

### 10.2 Form heading + sub-caption

| ID | Hypothesis | Heading | Sub-caption | Winner signal |
| --- | --- | --- | --- | --- |
| 10D | `more concrete` | `이 물건을 사기 전에 써보고 싶어요` | "자동으로 정리한 안내예요. 카테고리·아이템 이름은 한 번 더 확인해 주세요. 이 단계에서는 결제·픽업·정산이 시작되지 않아요." | form completion rate |
| 10E | `more buyer-actionable` | `사기 전 며칠 써볼 물건을 알려 주세요` | "운영자가 먼저 확인한 뒤, 같은 물건을 가진 셀러가 보면 다시 안내드려요. 자동 매칭·결제는 아직 시작되지 않아요." | form completion rate |

### 10.3 Helper copy (above form fields)

| ID | Hypothesis | Variant | Winner signal |
| --- | --- | --- | --- |
| 10F | `more concrete` | "적어 주신 내용은 운영자가 먼저 확인해요. 같은 물건을 가진 셀러가 보면 다시 안내드려요. 응답을 받고 싶다면 이메일을 함께 적어 주세요. 이메일은 선택이에요." | contact_email opt-in rate |
| 10G | `less scary` | "어떤 물건인지, 며칠 써보고 싶은지 짧게만 적어 주셔도 돼요. 이메일은 선택이에요. 자동으로 셀러가 연결되지는 않아요." | submit rate |

### 10.4 Submit success

| ID | Hypothesis | Variant | Winner signal |
| --- | --- | --- | --- |
| 10H | `more buyer-actionable` | "받았어요. 같은 물건을 가진 셀러가 보면 다시 안내드려요. 자동으로 매칭되거나 결제가 시작되지는 않아요. 아래에서 비슷한 다른 물건도 살펴볼 수 있어요." | post-submit click-through to `/search` or `/listings` |
| 10I | `less scary` | "신호를 받았어요. 운영자가 먼저 확인하고, 매칭이 가능한 시점이 되면 다시 안내드려요." | Q3 (결제 시작 인식) sentiment |
| 10J | `more concrete` | "기록했어요. 같은 물건이 들어오거나 같은 물건을 가진 셀러가 보면 다시 안내드려요. 결제·픽업·정산은 그 이후 단계예요." | tester quote quality |

### 10.5 Mock / local-mode caption

**Do not invent a new variant for mock mode.** Re-use the
existing `FeedbackIntakeCard` caption verbatim:

> 데모 환경에서는 저장되지 않아요. 클로즈드 알파 환경에서만
> 저장돼요.

This keeps a single mock-mode message across the feedback / wanted
surfaces and avoids the closed-vocabulary drift that a new string
would introduce.

### 10.6 Future seller demand board (deferred — design copy only)

These are **not for PR 2**. They belong to PR 4 / future after
the demand signal validates and a seller-facing DTO projection
+ RLS read policy land. Listed here so the founder has reviewed
copy ready when that PR opens.

| ID | Surface | Variant | Notes |
| --- | --- | --- | --- |
| 10K-future | Seller demand board heading | `써보고 싶다는 신호 — 베타` | Banlist clean. Stresses 신호 = signal, not match. |
| 10L-future | Sub-caption | "같은 카테고리에 등록된 셀러에게 보이는 비식별 신호 묶음이에요. 자동으로 매칭되거나 결제·픽업·정산이 시작되지는 않아요." | Pin "비식별" in copy. Pin negation. |
| 10M-future | Per-row CTA | `이 물건 가지고 있어요` | Click sends a non-promissory signal to the founder, not the borrower. |
| 10N-future | Per-row CTA caption | "클릭은 운영자에게 신호를 보내요. 자동 연결은 아니에요." | Negate auto-match. |

> Reminder: future variants in §10.6 must NOT be added to any
> render path until the seller demand board PR opens with its
> own DTO projection + RLS design. Adding the heading without
> the projection would imply seller-facing visibility that
> doesn't exist yet.

---

## How to use this backlog in a round

1. Founder reads §10–§11 of the previous round report and picks 1–2
   variants from this backlog (never more than 2 per round).
2. Founder edits the *closed-vocabulary source file* (e.g.
   [`tryBeforeBuyReadinessService.ts`](../src/lib/services/tryBeforeBuyReadinessService.ts))
   to swap the variant in.
3. Founder updates
   [`copyGuardrails.test.ts`](../src/lib/copy/copyGuardrails.test.ts)
   if the variant uses an allowed-negation phrase.
4. Founder records the variant ID in §12 of the new round report.
5. Founder runs the new round, scores against the variant's
   **Winner signal**.
6. After the round: keep, revert, or escalate to a follow-up
   variant. Append a `Result:` line to the variant row in this
   backlog.

End of copy experiment backlog.
