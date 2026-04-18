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

const NOTIFICATIONS_STORAGE_VERSION = 1;
const NOTIFICATIONS_STORAGE_KEY = `busbuddy.notifications.v${NOTIFICATIONS_STORAGE_VERSION}`;

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

function readLegacySubscriptions() {
  if (typeof window === "undefined") {
    return [] as NotificationSubscription[];
  }

  try {
    const rawValue = window.localStorage.getItem(NOTIFICATIONS_STORAGE_KEY);

    if (!rawValue) {
      return [];
    }

    const parsedValue = JSON.parse(rawValue);
    return Array.isArray(parsedValue) ? parsedValue : [];
  } catch {
    return [];
  }
}

function clearLegacySubscriptions() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(NOTIFICATIONS_STORAGE_KEY);
}

async function syncLegacySubscriptions(userId: string) {
  const legacySubscriptions = readLegacySubscriptions().filter(
    (subscription) => subscription.userId === userId,
  );

  if (legacySubscriptions.length === 0) {
    return;
  }

  await Promise.allSettled(
    legacySubscriptions.map((subscription) =>
      fetchApi(`/users/${userId}/notification-subscriptions`, {
        method: "POST",
        body: JSON.stringify({
          stopId: subscription.stopId,
          routeId: subscription.routeId,
          leadTimeMinutes: subscription.leadTimeMinutes,
          isActive: subscription.isActive,
        }),
      }),
    ),
  );

  clearLegacySubscriptions();
}

export async function getSubscriptions(userId: string): Promise<NotificationSubscription[]> {
  await syncLegacySubscriptions(userId);

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
  await syncLegacySubscriptions(userId);

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
