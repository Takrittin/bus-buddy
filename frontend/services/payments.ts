import { fetchApi } from "@/lib/api-client";
import { PromptPayPayment, TicketOrder, TicketProductType } from "@/types/payments";

export async function createPromptPayTicketPayment(ticketType: TicketProductType = "SINGLE_RIDE") {
  return fetchApi<PromptPayPayment>("/payments/promptpay", {
    method: "POST",
    body: JSON.stringify({ ticketType }),
  });
}

export async function getTicketOrder(orderId: string) {
  return fetchApi<TicketOrder>(`/payments/orders/${orderId}`);
}
