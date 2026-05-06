# CoRent readiness-flow round report — reusable template

_Companion to [`2026-05-06_readiness_flow_template.md`](2026-05-06_readiness_flow_template.md)
(the founder-run smoke template),
[`tester_feedback_form_template.md`](tester_feedback_form_template.md)
(the tester-facing form),
[`readiness_feedback_taxonomy.md`](readiness_feedback_taxonomy.md), and
[`readiness_feedback_decision_aid.md`](readiness_feedback_decision_aid.md)._

This is a **reusable per-round report template**. The smoke template
covers the *flow* (what to click, what to verify). This template covers
the *outcome* (what testers said, what to patch next).

When you start a new tester round:

1. Copy this file to `docs/smoke_runs/YYYY-MM-DD_readiness_round_<N>.md`.
2. Fill in §1 metadata before the tester arrives.
3. Run the founder-side smoke from
   [`2026-05-06_readiness_flow_template.md`](2026-05-06_readiness_flow_template.md)
   first.
4. Hand the tester the
   [`tester feedback form`](tester_feedback_form_template.md)
   and capture quotes verbatim into §6.
5. Tag each quote per
   [`readiness_feedback_taxonomy.md`](readiness_feedback_taxonomy.md).
6. Triage each quote per
   [`readiness_feedback_decision_aid.md`](readiness_feedback_decision_aid.md).
7. Land the §10 decision and the §11 next-PR recommendation.
8. Do **not** edit this template in place during a round.

---

## 1. Metadata

| Field | Value |
| --- | --- |
| Round number | `N` |
| Run date / local time | `YYYY-MM-DD HH:MM KST` |
| Founder | `<email>` (never paste magic-link tokens) |
| Dev project | `corent-dev` (must NOT be production) |
| Result | `pass` / `pass-with-followups` / `fail` |
| Smoke template version | `docs/smoke_runs/2026-05-06_readiness_flow_template.md` |
| Round report template version | `docs/smoke_runs/readiness_round_report_template.md` |
| Tester feedback form version | `docs/smoke_runs/tester_feedback_form_template.md` |

## 2. Commit and tooling

| Field | Value |
| --- | --- |
| Commit SHA under test | `<git rev-parse HEAD>` |
| Branch | `main` (or smoke branch name) |
| Tooling — `npm run lint` | `pass` / `fail` |
| Tooling — `bash scripts/check-server-no-console.sh` | `pass` / `fail` |
| Tooling — `npm test -- --run` | `<N> files / <M> tests` |
| Tooling — `npm run build` | `pass` / `fail` |
| Working tree clean before run? | `yes` / `no` (if `no`, list dirty files) |

If any of the four tools above fail before the round, **stop**. Do not
hand a build to a tester until the gate is green.

## 3. Tester profile (anonymized)

One block per tester. **Never** record real name, email, phone, or
session-bound token. Use `tester-N` as the handle.

### Tester `tester-1`

| Field | Value |
| --- | --- |
| Handle | `tester-1` |
| Role hint | e.g. `프리랜서 / 30대 / 마사지건 관심` |
| Familiar with CoRent before? | `yes` / `no` |
| Borrower or seller framing? | `borrower` / `seller` / `both` |
| Channel | `대면` / `전화` / `화상` / `Google Form` |
| Verbal/written consent for anonymized quoting? | `yes` / `no` |
| Round position | `1st of N` |

(Repeat for `tester-2`, `tester-3`, …)

## 4. Listing(s) used

For each listing the tester opened, record the minimum context
needed to interpret feedback **without** leaking PII or seller
contact info:

| Listing id | Category | Pickup area | Estimated value (₩) | Status | Tester(s) who saw it |
| --- | --- | --- | --- | --- | --- |
| `<UUID>` | `massage_gun` | 마포구 | 120,000 | `approved` | `tester-1`, `tester-2` |

Do not paste seller email, phone, or `rawSellerInput`. Listing id is
fine.

## 5. Route checklist (founder-side, run before tester arrives)

Mirror of the §10.2 pass-fail table from
[`2026-05-06_readiness_flow_template.md`](2026-05-06_readiness_flow_template.md).
Fill in **before** the tester sees anything; if any row is `❌`, do not
hand the build to the tester until you've patched or scoped the issue.

| Section | Status | Notes |
| --- | --- | --- |
| 3. Founder setup | ☐ | |
| 4.1 /search | ☐ | |
| 4.2 /listings/[id] | ☐ | |
| 4.3 readiness card | ☐ | |
| 4.4 request submission | ☐ | |
| 4.5 /requests status | ☐ | |
| 4.6 after seller responds | ☐ | |
| 4.7 cross-borrower isolation | ☐ | |
| 5.1 /dashboard listings | ☐ | |
| 5.2 seller readiness panel | ☐ | |
| 5.3 incoming request | ☐ | |
| 5.4 approve / decline | ☐ | |
| 6.1 /admin/cockpit | ☐ | |
| 6.2 /admin/login | ☐ | |

## 6. Verbatim tester quotes

One subsection per tester. **Verbatim Korean only.** The tester answers
each question from
[`tester_feedback_form_template.md`](tester_feedback_form_template.md)
once; record the answer literally. If the tester answered multiple
questions in one breath, split the quote.

For each quote:

- the question id (`Q1`–`Q6`, plus `bonus` if used)
- the verbatim Korean
- the sentiment annotation from the form (`명확함` / `모호함` /
  `무서움` / `안심됨` / `혼란스러움` → in English on triage,
  `clear` / `unclear` / `scary` / `reassuring` / `confused`)
- the primary tag from
  [`readiness_feedback_taxonomy.md`](readiness_feedback_taxonomy.md),
  optionally `+secondary`

### Tester `tester-1`

> **Q1 (사용감 이해도)** —
> "…" → sentiment: `clear` / `unclear` / `scary` / `reassuring` /
> `confused`. Tag: `clarity`.

> **Q2 (책임 기준 어휘)** —
> "…" → sentiment: …. Tag: `responsibility-wording`.

> **Q3 (결제 시작 인식)** —
> "…" → sentiment: …. Tag: `payment-confusion`.

> **Q4 (요청 직전 멈칫)** —
> "…" → sentiment: …. Tag: `fear` / `clarity` / `request-intent`.

> **Q5 (셀러 입장 상상)** —
> "…" → sentiment: …. Tag: `seller-willingness` (+ `seller-fear` /
> `seller-effort`).

> **Q6 (보너스 — 단계 인식)** —
> "…" → sentiment: …. Tag: `clarity` / `payment-confusion`.

(Repeat for `tester-2`, `tester-3`, …)

## 7. Tag tally

Quick count after §6 is filled. Helps spot themes across testers.

| Tag | Count | Severity hint from decision aid |
| --- | --- | --- |
| clarity | 0 | next-patch |
| fear | 0 | next-patch |
| responsibility-wording | 0 | next-patch |
| payment-confusion | 0 | stop |
| request-intent | 0 | nice-to-have / signal |
| seller-willingness | 0 | next-patch |
| category-fit | 0 | feeds wedge research |
| logistics-friction | 0 | later |
| trust-state-baseline-gap | 0 | next-patch |
| ai-expectation | 0 | nice-to-have |
| pricing-value-perception | 0 | feeds wedge research |

(Increment counts as quotes are tagged in §6. A row with count ≥ 2
across testers in this round is a strong signal; ≥ 3 is "act now".)

## 8. Severity table

For every quote, file one row. Use the decision aid to fill the
`Severity`, `Diagnosis`, and `Recommended next patch` columns.

| # | Tester | Quote (KR, ≤ 1 line) | Tag | Severity | Diagnosis | Recommended next patch |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | tester-1 | … | … | `stop` / `next-patch` / `nice-to-have` / `later` | … | … |

If any row's severity is `stop`, halt the round and section §11 must
patch before the next tester sees the build.

## 9. Founder notes

Free-form, ≤ 10 lines. Things the tester *did* (clicks, hesitations,
re-reads) that aren't quotable. Things you noticed in the screen capture
that the tester didn't articulate. Anything you want yourself to
remember next time you sit with this tester or this category.

Do **not** write down PII, real names, or hallway gossip. The round
report goes into the repo.

## 10. Decision

Pick exactly one:

- [ ] `patch` — at least one row in §8 is `stop` or `next-patch`. The
      next PR exists. Section §11 names the patch.
- [ ] `continue` — only `nice-to-have` / `later` rows in §8. Schedule
      the next tester round on the same build. Section §11 explains
      why no patch is being filed.
- [ ] `stop` — a quality-gate violation surfaced (e.g. `보증금` was
      typed in product copy, or static `PRODUCTS` leaked in server
      mode, or cross-borrower isolation broke). Stop testing entirely
      until the offending invariant is restored.

Whichever option, fill §11.

## 11. Next-PR recommendation

If §10 is `patch`:

| Field | Value |
| --- | --- |
| PR title | `<≤ 12 words, e.g. copy: tighten readiness responsibility caption>` |
| Type | `docs-only` / `code (UI copy + tests)` / `code (server only) + tests` / `code + UI + tests` |
| Files expected to change | (list) |
| Banlist test changes | `yes` / `no` (if `yes`, name the new row) |
| Readiness card / panel changes | `none` / `tryBeforeBuyReadinessService` / `sellerListingReadinessService` |
| New copy strings (sourced from backlog?) | `yes — backlog §X` / `no — invented inline (justify)` |
| Risk surface | `none` / `regulated language` / `payment` / `auth` / `DTO` / `LLM` |
| Security / quality gate trigger? | `no` (default) — if `yes`, link the gate doc |
| Suggested commit | `<imperative, ≤ 60 chars>` |

If §10 is `continue`:

> One paragraph, ≤ 4 sentences. State the reason (e.g.
> "All quotes were `nice-to-have`; no copy or behavior issues
> surfaced. The non-payment caption tested correctly per Q3."), and
> name the next round's date / target tester profile.

If §10 is `stop`:

> One paragraph, ≤ 4 sentences. State the invariant that broke,
> the surface where it broke, and the file(s) likely involved.
> Cross-link to the relevant gate:
> [`corent_closed_alpha_quality_gates.md`](../corent_closed_alpha_quality_gates.md),
> [`corent_security_gate_note.md`](../corent_security_gate_note.md),
> [`corent_legal_trust_architecture_note.md`](../corent_legal_trust_architecture_note.md).

## 12. Exact copy changes proposed

If the next PR includes new user-facing strings, list them here in a
diff-shaped way. Keep the strings short and sourced from
[`../corent_readiness_copy_experiment_backlog.md`](../corent_readiness_copy_experiment_backlog.md)
where possible.

| Surface | Location | Current copy | Proposed copy | Source |
| --- | --- | --- | --- | --- |
| `/listings/[id]` readiness card sub-caption | `tryBeforeBuyReadinessService` | `자동으로 정리한 안내예요. 셀러 응답 전에 다시 확인해 주세요.` | (proposed variant — banlist-clean) | `copy backlog §<X>` |

The reviewer will independently re-run the banlist
([`copyGuardrails.test.ts`](../../src/lib/copy/copyGuardrails.test.ts))
on the proposed strings.

## 13. Unanswered questions

Numbered list. Things the round did **not** answer that you want the
next round to answer. Each item ≤ 1 line.

1. …
2. …
3. …

## 14. Cross-references and trail

- Smoke template: [`2026-05-06_readiness_flow_template.md`](2026-05-06_readiness_flow_template.md)
- Tester form: [`tester_feedback_form_template.md`](tester_feedback_form_template.md)
- Decision aid: [`readiness_feedback_decision_aid.md`](readiness_feedback_decision_aid.md)
- Taxonomy: [`readiness_feedback_taxonomy.md`](readiness_feedback_taxonomy.md)
- Copy experiments: [`../corent_readiness_copy_experiment_backlog.md`](../corent_readiness_copy_experiment_backlog.md)
- Wedge research: [`../corent_category_wedge_research_checklist.md`](../corent_category_wedge_research_checklist.md)
- Quality gates: [`../corent_closed_alpha_quality_gates.md`](../corent_closed_alpha_quality_gates.md)

End of round report template.
