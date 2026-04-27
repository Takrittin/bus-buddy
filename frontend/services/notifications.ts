import { fetchApi } from "@/lib/api-client";

export interface NotificationSubscription {
  id: string;
  userId: string;
  stopId: string;
  stopName: string;
  routeId: string;
  routeNumber: string;
  leadTimeMinutes: number;
  isActive: boolean;
}

interface ApiNotificationSubscriptionResponse {
  id: string;
  user_id: string;
  stop_id: string;
  stop_name: string;
  route_id: string;
  route_number: string;
  lead_time_minutes: number;
  is_active: boolean;
}

function mapNotificationSubscription(
  subscription: ApiNotificationSubscriptionResponse,
): NotificationSubscription {
  return {
    id: subscription.id,
    userId: subscription.user_id,
    stopId: subscription.stop_id,
    stopName: subscription.stop_name,
    routeId: subscription.route_id,
    routeNumber: subscription.route_number,
    leadTimeMinutes: subscription.lead_time_minutes,
    isActive: subscription.is_active,
  };
}

export async function getSubscriptions(userId: string): Promise<NotificationSubscription[]> {
  const subscriptions = await fetchApi<ApiNotificationSubscriptionResponse[]>(
    `/users/${userId}/notification-subscriptions`,
  );

  return subscriptions.map(mapNotificationSubscription);
}

export async function getUserSubscriptions(
  userId: string,
): Promise<NotificationSubscription[]> {
  return getSubscriptions(userId);
}

export async function findSubscription(
  userId: string,
  stopId: string,
  routeId: string,
) {
  const subscription = await fetchApi<ApiNotificationSubscriptionResponse | null>(
    `/users/${userId}/notification-subscriptions/find/${stopId}/${routeId}`,
  );

  return subscription ? mapNotificationSubscription(subscription) : null;
}

export async function addSubscription(
  sub: Omit<NotificationSubscription, "id">,
): Promise<NotificationSubscription> {
  const subscription = await fetchApi<ApiNotificationSubscriptionResponse>(
    `/users/${sub.userId}/notification-subscriptions`,
    {
      method: "POST",
      body: JSON.stringify({
        stopId: sub.stopId,
        routeId: sub.routeId,
        leadTimeMinutes: sub.leadTimeMinutes,
        isActive: sub.isActive,
      }),
    },
  );

  return mapNotificationSubscription(subscription);
}

export async function removeSubscription(
  userId: string,
  id: string,
): Promise<void> {
  await fetchApi(`/users/${userId}/notification-subscriptions/${id}`, {
    method: "DELETE",
  });
}
