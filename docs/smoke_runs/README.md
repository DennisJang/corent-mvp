# docs/smoke_runs/ — posture statement

_See also the master docs index: [`../README.md`](../README.md)._

## What lives in this folder

- **Smoke run templates** — reusable scaffolding for founder-run
  sessions (e.g. `2026-05-06_readiness_flow_template.md`,
  `tester_feedback_form_template.md`,
  `readiness_round_report_template.md`).
- **Smoke run records** — dated snapshots of a single session
  (e.g. `2026-05-05_corent_dev_first_remote_e2e.md`,
  `2026-05-06_readiness_flow_round1.md`,
  `2026-05-06_password_login_readiness_round1.md`).
- **Operational triage kit** — `readiness_feedback_decision_aid.md`,
  `readiness_feedback_taxonomy.md` for converting verbatim tester
  quotes into next-patch tasks.

## Posture

These files are **run records and templates**. They do **not**
override:

- the current product architecture in
  [`../corent_interactive_experience_architecture.md`](../corent_interactive_experience_architecture.md)
  + [`../corent_product_direction_v2.md`](../corent_product_direction_v2.md);
- the closed-alpha guardrails in
  [`../corent_closed_alpha_quality_gates.md`](../corent_closed_alpha_quality_gates.md);
- the BW Swiss Grid v1 visual system in
  [`../corent_design_system_bw_v1.md`](../corent_design_system_bw_v1.md);
- the active slice plans in
  [`../corent_wanted_try_request_slice_plan.md`](../corent_wanted_try_request_slice_plan.md)
  and [`../corent_product_flow_completion_plan.md`](../corent_product_flow_completion_plan.md).

If a smoke record disagrees with one of those higher-tier docs,
the higher-tier doc is right and the smoke record is dated. A
smoke record's value is the verbatim signal it captured at one
point in time — not a license to redefine product scope.

## How to use these files

- **Starting a smoke session** → copy a template (do not edit it
  in place during a run). Work from the copy.
- **Triaging tester quotes** → run them through
  `readiness_feedback_decision_aid.md` and tag with
  `readiness_feedback_taxonomy.md` before deciding any patch.
- **Recording a round** → fill in
  `readiness_round_report_template.md`. The decision in §10 of
  the round report is the input to the next runtime PR; the
  smoke template itself is not.

## Founder-only operations

Some templates contain SQL blocks marked **DO NOT RUN VIA
AGENT.** Those are founder-only, run by hand in Supabase Studio
against the dev project. The agent never executes remote SQL,
remote Supabase commands, or env-secret reads.

End of posture statement.
