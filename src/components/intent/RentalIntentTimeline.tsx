// Renders the lifecycle of a RentalIntent as numbered rows. Visual rules:
//   completed  → solid black left bar + black text
//   current    → strong black box + filled marker
//   pending    → dashed left bar + muted text
//   failure    → strong black outline + plain "실패" label, no color
// Mirrors the BW design rules: solid = confirmed, dashed = pending, failure
// is communicated with text and structure rather than red/yellow.

import {
  isFailureStatus,
  RENTAL_HAPPY_PATH,
  type RentalIntent,
  type RentalIntentStatus,
} from "@/domain/intents";
import { statusLabel } from "./IntentStatusBadge";

const STEP_LABELS: Record<(typeof RENTAL_HAPPY_PATH)[number], string> = {
  draft: "임시 저장",
  requested: "요청 접수",
  seller_approved: "판매자 승인",
  payment_pending: "결제 대기",
  paid: "결제 완료",
  pickup_confirmed: "수령 확인",
  return_pending: "반납 대기",
  return_confirmed: "반납 확인",
  settlement_ready: "정산 준비",
  settled: "정산 완료",
};

type StepState = "completed" | "current" | "pending" | "failure" | "skipped";

function deriveStepStates(
  status: RentalIntentStatus,
): { step: (typeof RENTAL_HAPPY_PATH)[number]; state: StepState }[] {
  const failure = isFailureStatus(status);
  const currentIndex = RENTAL_HAPPY_PATH.indexOf(
    status as (typeof RENTAL_HAPPY_PATH)[number],
  );
  return RENTAL_HAPPY_PATH.map((step, i) => {
    if (failure) {
      // Failure: leave any happy path that already happened as completed,
      // mark the rest as skipped, no current step on the rail.
      return {
        step,
        state: i < deriveLastReachedIndex(status) ? "completed" : "skipped",
      };
    }
    if (currentIndex < 0) return { step, state: "skipped" };
    if (i < currentIndex) return { step, state: "completed" };
    if (i === currentIndex) return { step, state: "current" };
    return { step, state: "pending" };
  });
}

// For failure states, infer how far through the happy path we got.
function deriveLastReachedIndex(status: RentalIntentStatus): number {
  switch (status) {
    case "payment_failed":
      return RENTAL_HAPPY_PATH.indexOf("payment_pending") + 1;
    case "borrower_cancelled":
    case "seller_cancelled":
    case "cancelled":
      return RENTAL_HAPPY_PATH.indexOf("requested") + 1;
    case "pickup_missed":
      return RENTAL_HAPPY_PATH.indexOf("paid") + 1;
    case "return_overdue":
    case "damage_reported":
      return RENTAL_HAPPY_PATH.indexOf("return_pending") + 1;
    case "dispute_opened":
    case "settlement_blocked":
      return RENTAL_HAPPY_PATH.indexOf("settlement_ready") + 1;
    default:
      return 0;
  }
}

type RentalIntentTimelineProps = {
  intent: Pick<RentalIntent, "status">;
  title?: string;
};

export function RentalIntentTimeline({
  intent,
  title = "Rental Lifecycle",
}: RentalIntentTimelineProps) {
  const steps = deriveStepStates(intent.status);
  const failure = isFailureStatus(intent.status);

  return (
    <section className="bg-white border border-[color:var(--ink-12)]">
      <header className="flex items-baseline justify-between border-b border-black px-6 py-4">
        <h3 className="text-title">{title}</h3>
        <span className="text-caption text-[color:var(--ink-60)]">
          {failure
            ? `상태 / ${statusLabel(intent.status)}`
            : `상태 / ${statusLabel(intent.status)}`}
        </span>
      </header>
      <ol className="flex flex-col">
        {steps.map((s, i) => {
          const number = String(i + 1).padStart(2, "0");
          const isLast = i === steps.length - 1;
          const lineClass =
            s.state === "completed" || s.state === "current"
              ? "border-b border-[color:var(--ink-12)]"
              : "border-b border-dashed border-[color:var(--line-dashed)]";
          return (
            <li
              key={s.step}
              className={`grid grid-cols-[80px_1fr_120px] gap-6 px-6 py-5 items-baseline ${
                isLast ? "" : lineClass
              }`}
            >
              <span
                className={`text-caption ${
                  s.state === "completed" || s.state === "current"
                    ? "text-[color:var(--ink-100)]"
                    : "text-[color:var(--ink-40)]"
                }`}
              >
                {number}
              </span>
              <span
                className={`text-body ${
                  s.state === "current"
                    ? "font-medium"
                    : s.state === "pending" || s.state === "skipped"
                      ? "text-[color:var(--ink-60)]"
                      : "text-black"
                }`}
              >
                {STEP_LABELS[s.step]}
              </span>
              <span className="text-caption text-[color:var(--ink-60)] text-right">
                {s.state === "completed"
                  ? "완료"
                  : s.state === "current"
                    ? "진행 중"
                    : s.state === "skipped"
                      ? "—"
                      : "대기"}
              </span>
            </li>
          );
        })}
        {failure ? (
          <li className="grid grid-cols-[80px_1fr_120px] gap-6 px-6 py-5 items-baseline border-t border-black">
            <span className="text-caption">!!</span>
            <span className="text-body font-medium">
              {statusLabel(intent.status)}
            </span>
            <span className="text-caption text-[color:var(--ink-60)] text-right">
              실패 상태
            </span>
          </li>
        ) : null}
      </ol>
    </section>
  );
}
