export type TicketOrderStatus =
  | "PENDING"
  | "REQUIRES_ACTION"
  | "PROCESSING"
  | "PAID"
  | "FAILED"
  | "CANCELED";

export type TicketStatus = "ACTIVE" | "USED" | "EXPIRED" | "CANCELED";

export type TicketProductType = "SINGLE_RIDE";

export interface Ticket {
  id: string;
  displayCode: string;
  status: TicketStatus;
  validFrom: string;
  validUntil: string;
}

export interface TicketOrder {
  id: string;
  amountSatang: number;
  amountDisplay: string;
  currency: string;
  productName: string;
  status: TicketOrderStatus;
  stripePaymentStatus?: string | null;
  customerEmail?: string | null;
  failureMessage?: string | null;
  paidAt?: string | null;
  createdAt: string;
  ticket: Ticket | null;
}

export interface PromptPayPayment extends TicketOrder {
  clientSecret: string | null;
  publishableKey: string;
}
