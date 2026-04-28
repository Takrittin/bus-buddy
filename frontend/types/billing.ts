export type PremiumSubscriptionStatus =
  | "INCOMPLETE"
  | "INCOMPLETE_EXPIRED"
  | "TRIALING"
  | "ACTIVE"
  | "PAST_DUE"
  | "CANCELED"
  | "UNPAID"
  | "PAUSED";

export type PremiumCheckoutPlan = "tourist_weekly" | "monthly";
export type PremiumPlan = PremiumCheckoutPlan | "unknown";

export interface BillingStatus {
  isPremium: boolean;
  status: PremiumSubscriptionStatus | null;
  plan: PremiumPlan | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  trialEndsAt: string | null;
  canManageBillingPortal?: boolean;
}

export interface BillingRedirect {
  url: string;
}
