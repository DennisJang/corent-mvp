// Mock payment adapter. Simulates a Toss Payments-shaped session and
// confirmation in-memory. Stores sessions on `globalThis` so the same
// adapter can be re-instantiated across hot reloads in dev without losing
// state.

import type {
  PaymentSession,
  PaymentStatus,
  RentalIntent,
} from "@/domain/intents";
import { generateId, nowIso } from "@/lib/ids";
import type { PaymentAdapter, PaymentResult } from "./types";

type SessionStore = Map<string, PaymentSession>;

function getStore(): SessionStore {
  const g = globalThis as { __corentMockPaymentStore?: SessionStore };
  if (!g.__corentMockPaymentStore) {
    g.__corentMockPaymentStore = new Map();
  }
  return g.__corentMockPaymentStore;
}

export class MockPaymentAdapter implements PaymentAdapter {
  provider = "mock" as const;

  async createSession(intent: RentalIntent): Promise<PaymentSession> {
    const session: PaymentSession = {
      sessionId: generateId("pm_sess"),
      provider: "mock",
      rentalIntentId: intent.id,
      amount: intent.amounts.borrowerTotal,
      status: "pending",
      createdAt: nowIso(),
    };
    getStore().set(session.sessionId, session);
    return session;
  }

  async confirmPayment(sessionId: string): Promise<PaymentResult> {
    const store = getStore();
    const session = store.get(sessionId);
    if (!session) {
      return {
        ok: false,
        status: "failed",
        failureReason: "session_not_found",
      };
    }
    const updated: PaymentSession = {
      ...session,
      status: "paid",
      authorizedAt: nowIso(),
      paidAt: nowIso(),
    };
    store.set(sessionId, updated);
    return { ok: true, status: "paid", session: updated };
  }

  async getStatus(sessionId: string): Promise<PaymentStatus> {
    return getStore().get(sessionId)?.status ?? "not_started";
  }
}

export const mockPaymentAdapter = new MockPaymentAdapter();
