# CoRent readiness-flow tester-feedback taxonomy

_Companion to [`readiness_feedback_decision_aid.md`](readiness_feedback_decision_aid.md),
[`readiness_round_report_template.md`](readiness_round_report_template.md),
and [`tester_feedback_form_template.md`](tester_feedback_form_template.md)._

This is a **founder-side tagging vocabulary**. Every quote captured in
§10.4 of a readiness-flow round report should be tagged with one of
the entries below. The decision aid then maps the tag to a severity +
recommended next patch.

Two ground rules:

1. **One primary tag per quote.** A quote can carry up to one secondary
   tag, but never more than two. If a quote feels like three tags, it's
   probably two related quotes — split it.
2. **Tag the quote, not the tester.** A tester who asks "보증금은
   얼마예요?" gets a `payment-confusion` tag on that quote. The
   tester-level summary lives in §10.4 metadata, not on individual tags.

## Tag list

Each entry follows the same structure:

- **Definition**
- **Signals in tester quotes** — the linguistic cues to watch for
- **Positive quote examples** — sentiment leans `clear` / `reassuring`
- **Negative quote examples** — sentiment leans `unclear` / `scary` /
  `confused`
- **How to tag** — exact tag string + secondary-tag conventions
- **Likely product patch** — the modal next-step shape
- **What NOT to build yet** — explicit guardrail

### 1. clarity

- **Definition**: Tester understood (or failed to understand) what the
  page is showing. Applies primarily to the readiness card and the
  `추천 이유` / `확인할 점` blocks.
- **Signals**: 이해됐어요 / 잘 모르겠어요 / 뭘 보라는 건지 / 어떤
  뜻이에요?
- **Positive examples**:
  - "아, 이걸 직접 써보고 살 수 있다는 거군요. 이해됐어요."
  - "사용감 항목 보고 어떤 걸 확인할지 감이 잡혔어요."
- **Negative examples**:
  - "그래서 뭘 확인할 수 있다는 건지 모르겠어요."
  - "이거 보고도 잘 모르겠어요."
- **How to tag**: `clarity` (primary). If the quote also names fear,
  add `fear` as secondary.
- **Likely product patch**: tighten category-specific points in
  `tryBeforeBuyReadinessService`, or surface 1 line of context above the
  readiness card.
- **What NOT to build yet**: do not add an LLM-authored expansion of the
  card — `LLM candidates` are advisory only and the readiness card is
  deterministic by design.

### 2. fear

- **Definition**: Tester felt a sense of risk, exposure, or anxiety.
  Strongest signal that the responsibility framing is off.
- **Signals**: 무서워요 / 부담돼요 / 책임지기 싫어요 / 걱정돼요 / 다
  물어내야 하나요?
- **Positive examples**:
  - "책임 기준이라는 표현이 차분해서 오히려 안심됐어요."
- **Negative examples**:
  - "책임 기준이 무서워요."
  - "물건 망가지면 다 물어내야 한다는 거잖아요?"
- **How to tag**: `fear` (primary). If the fear is specifically about
  the responsibility wording, add `responsibility-wording` as secondary.
- **Likely product patch**: copy experiment from
  [`../corent_readiness_copy_experiment_backlog.md`](../corent_readiness_copy_experiment_backlog.md)
  §"책임 기준" with the `less scary` and `more concrete` variants.
- **What NOT to build yet**: do not soften by switching to `보증` /
  `보증금` / `보험` / `보장` — banned in
  [`corent_closed_alpha_quality_gates.md`](../corent_closed_alpha_quality_gates.md).

### 3. responsibility-wording

- **Definition**: Tester reacted specifically to the phrase `책임 기준`
  or to the responsibility caption — positively or negatively.
- **Signals**: 책임 기준이 / 책임은 누가 / 어떻게 정해요? / 책임이라는
  말이
- **Positive examples**:
  - "`책임 기준`이라는 말이 차분해서 좋았어요."
- **Negative examples**:
  - "`책임 기준`이라는 말이 너무 법적으로 들려요."
  - "책임이라는 단어 자체가 부담돼요."
- **How to tag**: `responsibility-wording` (primary). Often paired with
  `fear` (secondary).
- **Likely product patch**: copy variants only; the underlying basis
  (예상 가치) is not changing.
- **What NOT to build yet**: do not introduce `보증` / `보증금` /
  `보험` / `보장` / `손해보장` / `claim` / `payout` — all banned.

### 4. payment-confusion

- **Definition**: Tester thought payment had started, was about to
  start, or wanted to know about deposit / charge mechanics.
- **Signals**: 결제가 / 보증금은 / 카드에서 빠져나갔나요? / 미리 내야
  하나요?
- **Positive examples**:
  - "결제는 시작 안 된 것 같아 보였어요."
- **Negative examples**:
  - "결제가 시작된 줄 알았어요."
  - "보증금은 얼마예요?"
- **How to tag**: `payment-confusion` (primary). If the tester
  specifically said `보증금`, add `responsibility-wording` as secondary
  AND raise to `stop` severity in the decision aid.
- **Likely product patch**: promote the existing non-payment caption
  in DOM order; tighten the banlist test in
  [`copyGuardrails.test.ts`](../../src/lib/copy/copyGuardrails.test.ts).
- **What NOT to build yet**: do not enable a payment adapter, do not
  add a fake `결제하기` button, do not introduce `예상 보증금` previews.

### 5. request-intent

- **Definition**: Signal about whether the tester wanted to actually
  send a request, send and then buy, or send and never buy.
- **Signals**: 진짜 빌리고 싶어요 / 사고 싶어요 / 체험만 해보고 싶어요
  / 요청 보내볼게요
- **Positive examples**:
  - "체험 후에 사고 싶으면 그 셀러한테 그냥 살 수 있나요?"
  - "이번 주에 진짜 한 번 빌려보고 싶어요."
- **Negative examples**:
  - "굳이 빌릴 필요는 없을 것 같아요."
- **How to tag**: `request-intent` (primary). Append `+buy` /
  `+rent-only` / `+skip` as secondary annotations in the round report,
  not as separate tags.
- **Likely product patch**: usually none on the *current* round —
  request intent is a demand signal, not a UI bug.
- **What NOT to build yet**: do not bolt on a buy-now button — out of
  pre-revenue scope.

### 6. seller-willingness

- **Definition**: Whether the tester (or the founder doing seller-side
  walkthrough) would actually list their own items.
- **Signals**: 등록할 것 같아요 / 안 할 것 같아요 / 귀찮아요 / 책임
  지기 싫어요 / 누가 가져갈지 모르잖아요
- **Positive examples**:
  - "AI가 정리해 주는 게 편해 보여요. 한 번 등록해볼 수 있을 것 같아요."
- **Negative examples**:
  - "사진 찍고 설명 쓰는 게 귀찮아요."
  - "고장 나면 누가 책임져요?"
- **How to tag**: `seller-willingness` (primary). If the blocker is
  *fear of damage*, add `seller-fear` as secondary. If the blocker is
  *effort*, add `seller-effort` as secondary.
- **Likely product patch**: seller readiness panel nudges; chat-intake
  pre-upload copy; **not** auto-publish, **not** real-LLM SDK call.
- **What NOT to build yet**: do not promise CoRent payouts, do not
  surface borrower PII to lower seller fear, do not add a fake
  `verified` badge — all banned.

### 7. category-fit

- **Definition**: Whether the listing's category felt like a natural
  try-before-buy fit, or whether the tester felt the category was
  miscast.
- **Signals**: 이 카테고리는 / 이건 굳이 / 이건 사야지 / 이건 빌릴 만
  하네
- **Positive examples**:
  - "마사지건은 빌려서 한 번 써보고 사는 게 진짜 맞는 것 같아요."
  - "빔프로젝터는 며칠 써봐야 알 수 있는 물건이에요."
- **Negative examples**:
  - "이건 차라리 사는 게 낫겠어요."
  - "이런 건 굳이 안 빌릴 것 같아요."
- **How to tag**: `category-fit` (primary). Always append the category
  id as a secondary annotation (`category-fit:massage_gun`).
- **Likely product patch**: feed signal into
  [`../corent_category_wedge_research_checklist.md`](../corent_category_wedge_research_checklist.md)
  before changing any product code.
- **What NOT to build yet**: do not silently drop a category from the
  taxonomy `CategoryId` enum mid-alpha — that's a deliberate decision
  with downstream type implications.

### 8. logistics-friction

- **Definition**: Pickup / return / delivery / handoff complaint.
  Pre-revenue scope is direct-pickup only.
- **Signals**: 배송 / 택배 / 멀어요 / 일정 안 맞아요 / 시간이 안 돼요
- **Positive examples**:
  - "근처라서 픽업하기 좋네요."
- **Negative examples**:
  - "택배로 받을 수 있나요?"
  - "이 권역까지 가야 한다는 게 부담이에요."
- **How to tag**: `logistics-friction` (primary). If the friction is
  about distance specifically, add `pickup-distance` as a free-text
  note rather than a second tag.
- **Likely product patch**: usually `later`. If the same category
  triggers it in 3+ testers, raise it in
  [`../corent_category_wedge_research_checklist.md`](../corent_category_wedge_research_checklist.md).
- **What NOT to build yet**: do not add delivery, do not add an exact
  GPS map, do not surface seller exact address — all gated by the
  [security gate note](../corent_security_gate_note.md).

### 9. trust-state-baseline-gap

- **Definition**: Tester (either side) felt they couldn't establish a
  baseline of the item's condition — too few photos, vague condition
  string, no components named.
- **Signals**: 사진이 부족해요 / 상태를 못 믿겠어요 / 구성품이 / 어떤
  상태인지
- **Positive examples**:
  - "사진이 정면·측면·구성품까지 다 있어서 상태가 잘 보였어요."
- **Negative examples**:
  - "사진이 한 장이라 상태를 모르겠어요."
  - "구성품이 뭔지 안 보여요."
- **How to tag**: `trust-state-baseline-gap` (primary).
- **Likely product patch**: tighten the seller readiness panel's
  photo / components nudge. Borrower-side `요청 전 확인할 점` line
  inviting "missing-angle photo" request to seller.
- **What NOT to build yet**: do not add a `verified seller` badge, do
  not auto-rate condition with an LLM (LLM is candidate-only),
  do not surface seller's exact location to compensate.

### 10. ai-expectation

- **Definition**: Tester wondered what the AI is doing — too much, too
  little, or hallucinating.
- **Signals**: AI가 / 자동으로 / 진짜 AI예요? / 챗봇이 / GPT가
- **Positive examples**:
  - "AI가 미리 정리해 주는 거라 등록이 빠를 것 같네요."
- **Negative examples**:
  - "AI가 뭘 자동으로 한 거예요?"
  - "이거 AI가 만든 거예요? 거짓말이면 어떡해요?"
- **How to tag**: `ai-expectation` (primary). If the worry is
  hallucination specifically, add `ai-hallucination` as a free-text
  note.
- **Likely product patch**: tighten provenance copy on the readiness
  card sub-caption and on the chat-intake card. Always say
  `자동으로 정리한 안내예요` for deterministic surfaces and `참고용`
  for LLM-candidate surfaces.
- **What NOT to build yet**: do not relabel deterministic readiness as
  "AI". Do not call a real LLM SDK — gated by security review.

### 11. pricing-value-perception

- **Definition**: Tester pushed back on the rental fee being too high,
  too low, or unclear vs. the cost of buying outright.
- **Signals**: 비싸요 / 싸요 / 이 돈이면 / 그냥 사겠어요 / 가성비
- **Positive examples**:
  - "이 가격이면 며칠 써보고 결정하기 합리적이네요."
- **Negative examples**:
  - "왜 비싸요?"
  - "이 가격이면 그냥 사겠어요."
- **How to tag**: `pricing-value-perception` (primary). Always append
  the listing id and the tester's expected price (in the round report
  notes, not the tag).
- **Likely product patch**: usually none on the current round.
  Pre-revenue beta does not change pricing copy. Feed signal into
  [`../corent_category_wedge_research_checklist.md`](../corent_category_wedge_research_checklist.md).
- **What NOT to build yet**: do not auto-discount, do not add dynamic
  pricing, do not introduce a CoRent platform fee in copy. Pre-revenue
  beta posture per [`corent_pre_revenue_beta_plan.md`](../corent_pre_revenue_beta_plan.md).

## Tag-string convention

Use the tag strings literally when filling §10.4 / §10.5 of the round
report:

```
clarity
fear
responsibility-wording
payment-confusion
request-intent
seller-willingness
category-fit
category-fit:<category_id>
logistics-friction
trust-state-baseline-gap
ai-expectation
pricing-value-perception
```

Secondary tags are appended after a `+` separator:

```
fear+responsibility-wording
seller-willingness+seller-fear
category-fit:projector
```

Free-text notes go in the round report's "founder notes" subsection,
not in the tag string itself.

End of taxonomy.
