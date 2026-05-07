# CoRent category wedge research checklist

> **Status:** Historical / Discovery Artifact
> **Scope:** founder-side per-category prioritization tool for
> the CoRent rental-marketplace vertical (try-before-buy value,
> seller fear, logistics, condition baseline, responsibility-
> framing difficulty, price sensitivity, AI readiness lift).
> **Superseded by:** [`platform_thesis_ai_interaction_layer.md`](platform_thesis_ai_interaction_layer.md)
> + [`platform_pivot_note_2026-05-07.md`](platform_pivot_note_2026-05-07.md).
> The checklist helped surface the AI Interaction Layer thesis;
> it no longer guides active rental category work.
> **Last reviewed:** 2026-05-07 (demoted to Historical per the
> 2026-05-07 platform pivot).
> **Read before:** nothing on the active roadmap. Read for
> orientation when a future external wedge needs a similar
> per-domain scoring rubric.
> **Do not use for:** current roadmap, rental category
> selection, CoRent supply seeding, marketplace expansion. Body
> unchanged.

_Companion to [`corent_product_direction_v2.md`](corent_product_direction_v2.md),
[`corent_pre_revenue_beta_plan.md`](corent_pre_revenue_beta_plan.md),
[`corent_closed_alpha_quality_gates.md`](corent_closed_alpha_quality_gates.md),
and [`smoke_runs/readiness_feedback_taxonomy.md`](smoke_runs/readiness_feedback_taxonomy.md)._

This is a **founder-side category prioritization tool**, not a public
roadmap. The closed-alpha is currently scoped to `마사지건` /
`홈케어` / `소형 운동기구` (per [CLAUDE.md](../CLAUDE.md) — "Initial
categories"). The first **real** wedge — the category we will
optimize the entire alpha and beta around — is not yet decided.

The goal of this checklist is to convert tester rounds + founder
fieldwork into evidence for that decision. It is **not** a license
to widen the supported category list before the security/legal/UX
gates clear.

## How to use

1. After every readiness round, increment the relevant category's
   row counts in §3 with verbatim signal from the round report.
2. After every 3 rounds, re-rank the **alpha priority** column.
3. Before any code change that widens or narrows the category list
   (e.g. modifying `CategoryId` in `src/domain/categories.ts`),
   re-read this doc and confirm the change is consistent with the
   ranking.
4. Surface the top 1–2 categories in conversations with potential
   PG / partner / supply-side stakeholders, as evidence — never the
   raw category list.

Keep the doc terse. Long prose belongs in a follow-up note that
links back here, not in this checklist.

## Hard-rules guardrails (apply across all categories)

- The pre-revenue beta posture, security gate, and legal/trust
  framing apply unchanged regardless of which category we pick.
  See [`corent_pre_revenue_beta_plan.md`](corent_pre_revenue_beta_plan.md),
  [`corent_security_gate_note.md`](corent_security_gate_note.md),
  [`corent_legal_trust_architecture_note.md`](corent_legal_trust_architecture_note.md).
- "유아 / 펫 / 위생-sensitive" categories are **avoid early** by
  default unless tester evidence is strong AND a regulatory /
  hygiene framework is in place. They are listed below for
  completeness, not as candidates.
- Category prioritization does not change the banned-word list, the
  DTO/projection rules, or the LLM-candidate-only rule from
  [`corent_closed_alpha_quality_gates.md`](corent_closed_alpha_quality_gates.md).

## Scoring rubric (used in §3)

Each axis is scored 1 (lowest / least friction / lowest difficulty)
to 5 (highest / most friction / highest difficulty). Higher is not
universally better — see the per-axis notes below.

- **Try-before-buy value (1–5)** — how much a real borrower learns
  from a 1–7 day rental that they couldn't learn from photos / specs.
  **Higher = better wedge candidate.**
- **Seller fear level (1–5)** — how worried the average potential
  seller is about loaning out the item. **Higher = harder to seed
  supply.**
- **Logistics friction (1–5)** — how much pickup / return / battery /
  packing drag the borrower has to absorb. **Higher = worse for
  pickup-only MVP.**
- **Condition-baseline difficulty (1–5)** — how hard it is to
  establish a fair baseline of condition before vs. after a rental.
  **Higher = harder for the trust-state-baseline gap.**
- **Responsibility 기준 difficulty (1–5)** — how easy it is to
  explain a calm, bounded responsibility basis without leaning on
  banned words. **Higher = harder to write copy for.**
- **Price sensitivity (1–5)** — how reactive the borrower is to
  rental price vs. purchase price. **Higher = pricing copy needs
  more work.**
- **AI readiness card lift (1–5)** — how much the deterministic
  readiness card actually helps the borrower validate the item.
  **Higher = the wedge plays to CoRent's defensibility.**

A category's **alpha priority** is the founder's qualitative
judgement after looking at all seven axes — not a sum. Recorded as
`tier 1` / `tier 2` / `tier 3` / `avoid early`.

## §3. Category table

Update during / after each round. Row order is not a ranking — see
the **alpha priority** column.

### 3.1 마사지건 / 홈케어

| Axis | Score | Notes |
| --- | --- | --- |
| Try-before-buy value | 5 | 진동·소음·무게는 사진으로 알 수 없음. 일주일 사용 후 "본인에게 맞는지" 판단이 결정적. |
| Seller fear level | 2 | 소형, 상대적으로 저가, 분실 우려 낮음. |
| Logistics friction | 2 | 단품·소형·배터리 1개. 픽업/반납 단순. |
| Condition-baseline difficulty | 2 | 외관·구성품 2–3장 사진으로 baseline 가능. |
| Responsibility 기준 difficulty | 2 | 예상 가치 5–25만 원대로 책임 기준 설명이 깔끔. |
| Price sensitivity | 3 | "이 돈이면 그냥 사겠다" 반응이 자주 나오는 가격대. |
| AI readiness card lift | 5 | 진동 강도·소음·무게 구체 항목이 readiness 카드와 1:1로 매핑. |
| **Alpha priority** | **tier 1** | 현 closed-alpha의 기본 카테고리. 첫 번째 wedge 후보. |

**Tester-quote signals to watch**: `진동이 부담스럽다` /
`소음이 큰지 알 수 없다` / `손목이 아프다`. All of these are
high-value try-before-buy moments.

### 3.2 빔프로젝터

| Axis | Score | Notes |
| --- | --- | --- |
| Try-before-buy value | 5 | 밝기·발열·팬 소음·실제 화질은 며칠 써봐야만 판단 가능. |
| Seller fear level | 4 | 30–80만 원대 단품. 분실·낙하·열 손상 우려 큼. |
| Logistics friction | 3 | 본체 + 리모컨 + 케이블. 픽업 가능하지만 짐 부피 있음. |
| Condition-baseline difficulty | 3 | 렌즈·발열 흔적·포트 상태 등 사진으로 갈등 발생 여지. |
| Responsibility 기준 difficulty | 3 | 예상 가치가 높아 책임 기준 숫자가 무겁게 읽힘. |
| Price sensitivity | 2 | 보유 자체가 고가라 "써보고 사기" 명분 강함. |
| AI readiness card lift | 5 | 밝기·해상도·팬 소음 항목이 readiness 카드와 강하게 일치. |
| **Alpha priority** | **tier 1** | 마사지건 다음으로 강한 후보. 책임 기준 어휘 라운드를 한 번 더 거쳐야 안전. |

**Tester-quote signals to watch**: `우리 집 거실 크기에 맞는지
모르겠다` / `천장에 띄울 수 있나` / `낮에도 보이나`. All
high-value.

### 3.3 카메라 / 촬영 장비

| Axis | Score | Notes |
| --- | --- | --- |
| Try-before-buy value | 4 | 셔터감·메뉴 조작·렌즈 호환은 며칠 써봐야 알 수 있음. |
| Seller fear level | 5 | 50만 원 ~ 수백만 원. 분실·물기·낙하 손상 모두 큼. |
| Logistics friction | 3 | 본체 + 렌즈 + 배터리. 부피보다 *조심스러운 운반*이 부담. |
| Condition-baseline difficulty | 4 | 셔터 횟수·센서 먼지·렌즈 곰팡이 — 사진으로 baseline 어려움. |
| Responsibility 기준 difficulty | 4 | 가치 차이가 큼(렌즈 단품 100만 원 이상). 책임 기준 설명이 복잡. |
| Price sensitivity | 1 | 고가 카테고리, 가격 민감도 낮은 편. |
| AI readiness card lift | 4 | 무게·그립·메뉴 조작감 항목은 잘 맞으나 셔터 횟수 등 객관 데이터 필요. |
| **Alpha priority** | **tier 2** | 가능성은 크지만 seller fear / condition baseline이 높아 트러스트 슬라이스 이후 진입. |

**Tester-quote signals to watch**: `렌즈 곰팡이 / 센서 먼지가
있을까` / `셔터 횟수가 몇 번이에요` — these are strong demand
signals AND strong condition-baseline gaps.

### 3.4 UMPC / 게이밍 기기

| Axis | Score | Notes |
| --- | --- | --- |
| Try-before-buy value | 5 | 발열·배터리·팬 소음·게임별 프레임은 사양표만으로 판단 불가. |
| Seller fear level | 4 | 50–150만 원, 분실·낙하·SSD 손상 모두 우려. |
| Logistics friction | 2 | 본체 + 충전기. 부피 작음. |
| Condition-baseline difficulty | 3 | 외관·발열 자국·키 마모·SSD 상태 — 사진으로 부분만 baseline. |
| Responsibility 기준 difficulty | 3 | 가치가 명확해 숫자 자체는 명확하나 무게감 있음. |
| Price sensitivity | 2 | 신제품 사이클이 빨라 "사기 전에 한 번 써보고 결정" 수요 강함. |
| AI readiness card lift | 5 | 발열·팬 소음·키감·게임별 프레임 항목이 readiness 카드와 잘 매핑. |
| **Alpha priority** | **tier 1** | 마사지건과 빔프로젝터 다음 강력한 후보. 빠른 신제품 사이클이 wedge에 유리. |

**Tester-quote signals to watch**: `이 게임 돌아가나` /
`발열이 어떤가` / `배터리 몇 시간 가나` — high-value.

### 3.5 캠핑 소형 장비

| Axis | Score | Notes |
| --- | --- | --- |
| Try-before-buy value | 4 | 설치 난이도·무게·수납 부피는 직접 만져봐야 판단 가능. |
| Seller fear level | 3 | 1세트 10–40만 원대, 부분 손상·분실 우려 중간. |
| Logistics friction | 4 | 부피 큼, 차량 의존, 시즌성 강함. |
| Condition-baseline difficulty | 3 | 텐트 봉·찢어짐·곰팡이 — 사진으로는 어렵고 직접 펼쳐봐야 함. |
| Responsibility 기준 difficulty | 3 | 부분 손상이 많아 책임 기준 숫자보다 협의 비용이 큼. |
| Price sensitivity | 3 | "한 번만 쓸 거면 빌리는 게 낫다" 수요 명확. |
| AI readiness card lift | 4 | 설치 난이도·수납 부피 항목은 잘 맞으나 시즌·날씨 요소가 카드 밖. |
| **Alpha priority** | **tier 2** | 시즌성·logistics friction이 커서 첫 wedge로는 부적합. 시즌 도래 시 부수 카테고리. |

### 3.6 청소기 / 생활가전

| Axis | Score | Notes |
| --- | --- | --- |
| Try-before-buy value | 4 | 흡입력·소음·무게는 며칠 써봐야 정확. |
| Seller fear level | 3 | 30–80만 원대. 부품 손상·소모품 부담. |
| Logistics friction | 3 | 본체 + 충전 거치대 + 부속. 부피 약간 있음. |
| Condition-baseline difficulty | 3 | 모터·필터·롤러 마모는 사진만으로 부분 baseline. |
| Responsibility 기준 difficulty | 3 | 책임 기준은 깔끔하지만 소모품 처리 정책이 별도 필요. |
| Price sensitivity | 3 | "이 가격이면 신제품 산다" 반응 가능. |
| AI readiness card lift | 4 | 흡입력·소음·무게 항목이 readiness 카드에 잘 매핑. |
| **Alpha priority** | **tier 2** | 강력 후보지만 소모품·위생 측면에서 정책 추가 필요. tier 1보다 한 라운드 뒤. |

### 3.7 유아 / 펫 / 위생-sensitive

| Axis | Score | Notes |
| --- | --- | --- |
| Try-before-buy value | 5 | 매우 큼 (유아 카시트, 펫 캐리어 등). |
| Seller fear level | 5 | 매우 큼 — 위생·안전·법적 책임 모두 큼. |
| Logistics friction | 4 | 위생 처리·소독·세척 사이클 필요. |
| Condition-baseline difficulty | 5 | 위생 baseline은 사진으로 사실상 불가능. |
| Responsibility 기준 difficulty | 5 | 안전 사고·위생 사고 시 책임 기준 설명이 매우 복잡. 규제 어휘 위험 큼. |
| Price sensitivity | 2 | 가격 민감도는 낮은 편. |
| AI readiness card lift | 2 | 위생·안전 baseline은 readiness 카드의 강점이 아님. |
| **Alpha priority** | **avoid early** | 수요는 명확하나 안전·위생·법적 위험이 알파 단계에는 과대. |

**Hard rule**: do not enable this category in `CategoryId` until a
separate gated note covers hygiene + legal review and a partner
relationship is in place. See
[`corent_security_gate_note.md`](corent_security_gate_note.md) and
[`corent_legal_trust_architecture_note.md`](corent_legal_trust_architecture_note.md).

## §4. Decision protocol

A wedge **graduates** from `tier 1` to "primary" when ALL of the
following are true:

1. ≥ 6 testers across ≥ 3 rounds gave `clear` or `reassuring`
   sentiment on Q1 (try-before-buy understandability) for that
   category's listings.
2. ≥ 3 testers gave a positive `category-fit:<id>` quote per
   [`smoke_runs/readiness_feedback_taxonomy.md`](smoke_runs/readiness_feedback_taxonomy.md).
3. Zero `payment-confusion` `stop` events recurred for that category
   across the last 2 rounds.
4. `seller-willingness` for that category does not exceed 3 negative
   quotes in any single round.
5. The founder can write the category's responsibility-basis caption
   in ≤ 25 Korean words without violating the banlist.

A wedge **demotes** from `tier 1` to `tier 2` if:

- Two consecutive rounds surface a `category-fit` negative for the
  category, OR
- One round surfaces a `regulated language` near-miss
  (`보증` / `보험` / `보장` / `verified seller` adjacent), OR
- A logistics-friction tag appears in ≥ 50% of testers for that
  category.

A `tier 2` category **promotes** to `tier 1` only after a deliberate
founder decision recorded as a doc patch — never silently.

## §5. Cross-references

- Initial categories (alpha): [CLAUDE.md](../CLAUDE.md)
- Direction: [`corent_product_direction_v2.md`](corent_product_direction_v2.md)
- Defensibility (do not publish category data): [`corent_defensibility_note.md`](corent_defensibility_note.md)
- Pre-revenue posture: [`corent_pre_revenue_beta_plan.md`](corent_pre_revenue_beta_plan.md)
- Quality gates: [`corent_closed_alpha_quality_gates.md`](corent_closed_alpha_quality_gates.md)
- Tester taxonomy: [`smoke_runs/readiness_feedback_taxonomy.md`](smoke_runs/readiness_feedback_taxonomy.md)

End of category wedge research checklist.
