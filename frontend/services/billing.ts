import { fetchApi } from "@/lib/api-client";
import { BillingRedirect, BillingStatus, PremiumCheckoutPlan } from "@/types/billing";

export async function getBillingStatus() {
  return fetchApi<BillingStatus>("/billing/me");
}

export async function createPremiumCheckoutSession(plan: PremiumCheckoutPlan = "monthly") {
  return fetchApi<BillingRedirect>("/billing/checkout-session", {
    method: "POST",
    body: JSON.stringify({ plan }),
  });
}

export async function syncPremiumCheckoutSession(sessionId: string) {
  return fetchApi<BillingStatus>("/billing/checkout-session/sync", {
    method: "POST",
    body: JSON.stringify({ sessionId }),
  });
}

export async function createCustomerPortalSession() {
  return fetchApi<BillingRedirect>("/billing/customer-portal", {
    method: "POST",
  });
}
