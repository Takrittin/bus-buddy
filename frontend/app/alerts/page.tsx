"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/navigation/AppHeader";
import { BottomNav } from "@/components/navigation/BottomNav";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/hooks/auth/useAuth";
import {
  NotificationSubscription,
  getUserSubscriptions,
  removeSubscription,
} from "@/services/notifications";
import { BellOff, BellRing, BusFront, LockKeyhole } from "lucide-react";

export default function AlertsPage() {
  const [subscriptions, setSubscriptions] = useState<NotificationSubscription[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const {
    user,
    isAuthenticated,
    isLoading: isAuthLoading,
    canUseRiderTools,
    isFleetManager,
  } = useAuth();

  useEffect(() => {
    if (isAuthLoading) {
      return;
    }

    async function loadSubscriptions() {
      if (!isAuthenticated || !user?.id) {
        setSubscriptions([]);
        setIsLoading(false);
        return;
      }

      if (!canUseRiderTools) {
        setSubscriptions([]);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      try {
        const nextSubscriptions = await getUserSubscriptions(user.id);
        setSubscriptions(nextSubscriptions);
      } catch {
        setSubscriptions([]);
      } finally {
        setIsLoading(false);
      }
    }

    void loadSubscriptions();
  }, [canUseRiderTools, isAuthenticated, isAuthLoading, user?.id]);

  const handleRemoveSubscription = async (subscriptionId: string) => {
    if (!user?.id) {
      return;
    }

    try {
      await removeSubscription(user.id, subscriptionId);
      setSubscriptions(await getUserSubscriptions(user.id));
    } catch {
      // Keep the current list when the API call fails.
    }
  };

  return (
    <div className="flex min-h-screen w-full flex-col overflow-hidden bg-gray-50">
      <AppHeader />

      <div className="flex flex-1 pt-[60px]">
        <BottomNav />

        <main className="flex-1 w-full overflow-y-auto pb-24 md:pb-8 md:pl-20">
          <div className="mx-auto flex max-w-4xl flex-col gap-6 px-4 pt-6 md:px-8">
            <section className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
              <h2 className="text-3xl font-bold text-gray-900">Alerts</h2>
              <p className="mt-2 text-sm text-gray-500">
                Manage bus arrival alerts for your saved stops.
              </p>
            </section>

            <section className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
              {isLoading ? (
                <p className="text-sm text-gray-500">Loading alerts...</p>
              ) : !isAuthenticated ? (
                <EmptyState
                  icon={<LockKeyhole className="h-16 w-16 mx-auto" />}
                  title="Sign in to use alerts"
                  description="Guests can browse routes and ETAs, but alerts are only available after logging in."
                  action={
                    <Button
                      variant="primary"
                      onClick={() => router.push("/settings?mode=login")}
                    >
                      Open Settings
                    </Button>
                  }
                />
              ) : isFleetManager ? (
                <EmptyState
                  icon={<BusFront className="h-16 w-16 mx-auto" />}
                  title="Alerts are hidden for fleet managers"
                  description="Fleet accounts focus on live operations, so passenger arrival alerts are disabled for this role."
                  action={
                    <Button
                      variant="primary"
                      onClick={() => router.push("/fleet")}
                    >
                      Open Fleet Manager
                    </Button>
                  }
                />
              ) : subscriptions.length === 0 ? (
                <EmptyState
                  icon={<BellOff className="h-16 w-16 mx-auto" />}
                  title="No active alerts"
                  description="Open a stop and tap Notify Arrivals to enable an alert for the next route."
                />
              ) : (
                <div className="space-y-3">
                  {subscriptions.map((subscription) => (
                    <div
                      key={subscription.id}
                      className="flex items-center justify-between rounded-2xl border border-gray-100 bg-gray-50 px-4 py-4"
                    >
                      <div className="flex items-start gap-3">
                        <div className="rounded-2xl bg-orange-100 p-3 text-brand">
                          <BellRing className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="font-semibold text-gray-900">
                            Route {subscription.routeNumber}
                          </p>
                          <p className="mt-1 text-sm text-gray-500">
                            {subscription.stopName}
                          </p>
                          <p className="mt-1 text-xs text-gray-500">
                            Alert {subscription.leadTimeMinutes} minutes before arrival
                          </p>
                        </div>
                      </div>

                      <Button
                        variant="outline"
                        onClick={() => void handleRemoveSubscription(subscription.id)}
                      >
                        Disable
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}
