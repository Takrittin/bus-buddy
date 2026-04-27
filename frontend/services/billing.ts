import { fetchApi } from "@/lib/api-client";
import { BillingRedirect, BillingStatus } from "@/types/billing";

export async function getBillingStatus() {
  return fetchApi<BillingStatus>("/billing/me");
}

export async function createPremiumCheckoutSession() {
  return fetchApi<BillingRedirect>("/billing/checkout-session", {
    method: "POST",
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
