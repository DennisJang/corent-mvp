export type PaymentState =
  | "requested"
  | "approved"
  | "payment_pending"
  | "paid"
  | "pickup_confirmed"
  | "return_pending"
  | "return_confirmed"
  | "settlement_ready"
  | "settled"
  | "disputed";

export type MockPaymentRequest = {
  rentalId: string;
  amount: number;
  productName: string;
  borrowerName: string;
};

export type MockPaymentResult = {
  ok: true;
  state: PaymentState;
  receiptId: string;
};

export async function requestTossPayment(
  req: MockPaymentRequest,
): Promise<MockPaymentResult> {
  return {
    ok: true,
    state: "payment_pending",
    receiptId: `mock_${req.rentalId}`,
  };
}
