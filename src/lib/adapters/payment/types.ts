// Payment adapter interface. The mock implementation simulates Toss
// Payments-shaped session and confirmation flows. Toss can be plugged in
// without changing any caller.

import type {
  PaymentProvider,
  PaymentSession,
  PaymentStatus,
  RentalIntent,
} from "@/domain/intents";

export type CreatePaymentInput = {
  rentalIntentId: string;
  amount: number;
  productName: string;
  borrowerName?: string;
};

export type PaymentResult =
  | { ok: true; status: PaymentStatus; session: PaymentSession }
  | { ok: false; status: "failed"; failureReason: string };

export interface PaymentAdapter {
  provider: PaymentProvider;
  createSession(intent: RentalIntent): Promise<PaymentSession>;
  confirmPayment(sessionId: string): Promise<PaymentResult>;
  getStatus(sessionId: string): Promise<PaymentStatus>;
}
