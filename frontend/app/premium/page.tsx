"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BarChart3,
  BellRing,
  Bot,
  Check,
  CreditCard,
  Crown,
  Heart,
  MapPinned,
  Navigation,
  Route,
  ShieldCheck,
  Sparkles,
  Timer,
} from "lucide-react";
import { AppHeader } from "@/components/navigation/AppHeader";
import { BottomNav } from "@/components/navigation/BottomNav";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/hooks/auth/useAuth";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import {
  createCustomerPortalSession,
  createPremiumCheckoutSession,
  getBillingStatus,
  syncPremiumCheckoutSession,
} from "@/services/billing";
import { BillingStatus, PremiumCheckoutPlan } from "@/types/billing";

export default function PremiumPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const { isAuthenticated, isLoading, canUseRiderTools, user } = useAuth();
  const [billingStatus, setBillingStatus] = useState<BillingStatus | null>(null);
  const [isLoadingBilling, setIsLoadingBilling] = useState(false);
  const [isStartingCheckout, setIsStartingCheckout] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasHandledCheckoutReturn, setHasHandledCheckoutReturn] = useState(false);

  const canLoadBilling = isAuthenticated && Boolean(user?.id) && canUseRiderTools;

  const loadBillingStatus = useCallback(async () => {
    if (!canLoadBilling) {
      setBillingStatus(null);
      return;
    }

    setIsLoadingBilling(true);
    setError(null);

    try {
      setBillingStatus(await getBillingStatus());
    } catch (statusError) {
      setError(
        statusError instanceof Error
          ? statusError.message
          : t("premium.statusError"),
      );
    } finally {
      setIsLoadingBilling(false);
    }
  }, [canLoadBilling, t]);

  useEffect(() => {
    if (!canLoadBilling) {
      void loadBillingStatus();
      return;
    }

    if (hasHandledCheckoutReturn || typeof window === "undefined") {
      return;
    }

    const searchParams = new URLSearchParams(window.location.search);
    const checkoutState = searchParams.get("checkout");
    const sessionId = searchParams.get("session_id");

    if (checkoutState !== "success" || !sessionId) {
      setHasHandledCheckoutReturn(true);
      void loadBillingStatus();
      return;
    }

    setHasHandledCheckoutReturn(true);
    setIsLoadingBilling(true);
    setError(null);

    syncPremiumCheckoutSession(sessionId)
      .then((status) => {
        setBillingStatus(status);
        window.dispatchEvent(new Event("busbuddy.billing.updated"));
        window.history.replaceState(null, "", "/premium");
      })
      .catch((syncError) => {
        setError(
          syncError instanceof Error
            ? syncError.message
            : t("premium.statusError"),
        );
      })
      .finally(() => {
        setIsLoadingBilling(false);
      });
  }, [canLoadBilling, hasHandledCheckoutReturn, loadBillingStatus, t]);

  const premiumExpiryLabel = billingStatus?.currentPeriodEnd
    ? new Date(billingStatus.currentPeriodEnd).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : null;

  const handleGetPremium = async (plan: PremiumCheckoutPlan = "tourist_weekly") => {
    if (isLoading) {
      return;
    }

    if (!isAuthenticated) {
      router.push("/settings?mode=register");
      return;
    }

    if (!canUseRiderTools) {
      return;
    }

    setIsStartingCheckout(true);
    setError(null);

    try {
      const session = billingStatus?.isPremium
        ? billingStatus.plan === "monthly" && billingStatus.canManageBillingPortal
          ? await createCustomerPortalSession()
          : null
        : await createPremiumCheckoutSession(plan);

      if (!session) {
        setIsStartingCheckout(false);
        return;
      }

      window.location.assign(session.url);
    } catch (checkoutError) {
      setError(
        checkoutError instanceof Error
          ? checkoutError.message
          : billingStatus?.isPremium
            ? t("premium.portalError")
            : t("premium.checkoutError"),
      );
      setIsStartingCheckout(false);
    }
  };

  const renderPremiumAction = (plan: PremiumCheckoutPlan) => {
    const isCurrentPlan = billingStatus?.isPremium && billingStatus.plan === plan;

    if (billingStatus?.isPremium && !isCurrentPlan) {
      return (
        <Button
          type="button"
          disabled
          className="mt-5 h-12 w-full rounded-2xl text-base font-black"
        >
          {t("premium.alreadyPremium")}
        </Button>
      );
    }

    if (
      isCurrentPlan &&
      (plan === "tourist_weekly" || !billingStatus?.canManageBillingPortal)
    ) {
      return (
        <Button
          type="button"
          disabled
          className="mt-5 h-12 w-full rounded-2xl text-base font-black"
        >
          {t("premium.currentPlan")}
        </Button>
      );
    }

    return (
      <Button
        type="button"
        onClick={() => void handleGetPremium(plan)}
        isLoading={isPrimaryActionLoading}
        disabled={isLoading || (isAuthenticated && !canUseRiderTools)}
        className="mt-5 h-12 w-full rounded-2xl text-base font-black"
      >
        <CreditCard className="mr-2 h-5 w-5" />
        {isCurrentPlan ? t("premium.manageSubscription") : t("premium.goToCreditPayment")}
      </Button>
    );
  };

  const isPrimaryActionLoading = isStartingCheckout || isLoadingBilling;
  const primaryActionLabel = billingStatus?.isPremium
    ? t("premium.activeTitle")
    : isAuthenticated
      ? t("premium.startTouristPass")
      : t("premium.createAccount");

  return (
    <div className="flex min-h-screen w-full flex-col bg-[#FFF8F1]">
      <AppHeader />

      <div className="flex min-h-[calc(100vh-60px)] flex-1 pt-[60px]">
        <BottomNav />

        <main className="w-full flex-1 pb-24 md:pb-8 md:pl-24">
          <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-5 sm:px-6 md:px-8 md:py-8">
            <section className="relative overflow-hidden rounded-[2rem] border border-orange-100 bg-white shadow-sm">
              <div className="absolute -right-20 -top-24 h-72 w-72 rounded-full bg-orange-100/80 blur-3xl" />
              <div className="absolute -bottom-28 left-8 h-72 w-72 rounded-full bg-emerald-100/70 blur-3xl" />

              <div className="relative grid gap-8 p-6 md:grid-cols-[minmax(0,1fr)_380px] md:items-center md:p-10">
                <div>
                  <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-orange-100 bg-orange-50 px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-brand">
                    <Crown className="h-4 w-4" />
                    {t("premium.eyebrow")}
                  </div>
                  <h1 className="max-w-3xl text-4xl font-black leading-tight tracking-tight text-gray-950 sm:text-5xl">
                    {t("premium.title")}
                  </h1>
                  <p className="mt-4 max-w-2xl text-base leading-7 text-gray-600 sm:text-lg">
                    {t("premium.subtitle")}
                  </p>

                  <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                    <Button
                      type="button"
                      onClick={() => void handleGetPremium("tourist_weekly")}
                      isLoading={isPrimaryActionLoading}
                      disabled={
                        isLoading ||
                        billingStatus?.isPremium ||
                        (isAuthenticated && !canUseRiderTools)
                      }
                      className="h-12 rounded-2xl px-6 text-base font-black shadow-xl shadow-orange-500/20"
                    >
                      <CreditCard className="mr-2 h-5 w-5" />
                      {primaryActionLabel}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => router.push("/trip-planner")}
                      className="h-12 rounded-2xl bg-white px-6 text-base font-bold"
                    >
                      <Route className="mr-2 h-5 w-5 text-brand" />
                      {t("premium.tryPlanner")}
                    </Button>
                  </div>
                </div>

                <PremiumSnapshot />
              </div>
            </section>

            {billingStatus?.isPremium ? (
              <section className="rounded-[2rem] border border-emerald-100 bg-emerald-50 px-5 py-4 text-sm text-emerald-900 shadow-sm">
                <p className="font-black">
                  {billingStatus.plan === "tourist_weekly"
                    ? t("premium.touristPlanActive")
                    : t("premium.monthlyPlanActive")}
                </p>
                {premiumExpiryLabel ? (
                  <p className="mt-1">
                    {t("premium.expiresOn", { date: premiumExpiryLabel })}
                  </p>
                ) : null}
              </section>
            ) : null}

            <section className="grid gap-4 lg:grid-cols-3">
              <PlanCard
                eyebrow={t("premium.freePlan")}
                title={t("premium.freeTitle")}
                price={t("premium.freePrice")}
                description={t("premium.freeDescription")}
                features={[
                  { icon: <MapPinned />, text: t("premium.freeMap") },
                  { icon: <Route />, text: t("premium.freeRoutes") },
                  { icon: <Timer />, text: t("premium.freeBasicEta") },
                ]}
              />

              <PlanCard
                isHighlighted
                badge={t("premium.touristBadge")}
                eyebrow={t("premium.touristPlan")}
                title={t("premium.touristTitle")}
                price={t("premium.touristPrice")}
                description={t("premium.touristDescription")}
                features={[
                  { icon: <Bot />, text: t("premium.premiumAi") },
                  { icon: <BellRing />, text: t("premium.premiumAlerts") },
                  { icon: <Heart />, text: t("premium.premiumFavorites") },
                  { icon: <Navigation />, text: t("premium.premiumPlanner") },
                  { icon: <BarChart3 />, text: t("premium.premiumAnalytics") },
                  { icon: <ShieldCheck />, text: t("premium.premiumNoAds") },
                ]}
                action={renderPremiumAction("tourist_weekly")}
              />

              <PlanCard
                eyebrow={t("premium.monthlyPlan")}
                title={t("premium.premiumTitle")}
                price={t("premium.price")}
                description={t("premium.premiumDescription")}
                features={[
                  { icon: <Bot />, text: t("premium.premiumAi") },
                  { icon: <BellRing />, text: t("premium.premiumAlerts") },
                  { icon: <Heart />, text: t("premium.premiumFavorites") },
                  { icon: <Navigation />, text: t("premium.premiumPlanner") },
                  { icon: <BarChart3 />, text: t("premium.premiumAnalytics") },
                  { icon: <ShieldCheck />, text: t("premium.premiumNoAds") },
                ]}
                action={renderPremiumAction("monthly")}
              />
            </section>

            {error ? (
              <div className="rounded-3xl border border-red-100 bg-red-50 px-5 py-4 text-sm font-semibold text-red-700">
                {error}
              </div>
            ) : null}

            <section className="grid gap-4 md:grid-cols-3">
              <ValueCard
                icon={<Sparkles />}
                title={t("premium.smartCommuteTitle")}
                description={t("premium.smartCommuteDescription")}
              />
              <ValueCard
                icon={<BellRing />}
                title={t("premium.alertControlTitle")}
                description={t("premium.alertControlDescription")}
              />
              <ValueCard
                icon={<BarChart3 />}
                title={t("premium.recommendationTitle")}
                description={t("premium.recommendationDescription")}
              />
            </section>

            {isAuthenticated && !canUseRiderTools ? (
              <div className="rounded-3xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm font-semibold text-amber-900">
                {t("premium.riderOnlyDescription")}
              </div>
            ) : null}
          </div>
        </main>
      </div>
    </div>
  );
}

function PremiumSnapshot() {
  const { t } = useLanguage();

  return (
    <div className="relative overflow-hidden rounded-[2rem] border border-orange-100 bg-[#122033] p-5 text-white shadow-2xl shadow-orange-500/15">
      <div className="absolute -right-12 -top-12 h-36 w-36 rounded-full bg-brand/40 blur-3xl" />
      <div className="absolute -bottom-16 left-10 h-32 w-32 rounded-full bg-emerald-400/30 blur-3xl" />
      <div className="relative">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-orange-100">
              {t("premium.busBuddyPlus")}
            </p>
            <h2 className="mt-2 text-2xl font-black">{t("premium.dashboardTitle")}</h2>
          </div>
          <div className="rounded-2xl bg-white/12 p-3">
            <Sparkles className="h-6 w-6 text-orange-100" />
          </div>
        </div>

        <div className="mt-7 rounded-3xl bg-white p-4 text-gray-950">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.12em] text-gray-400">
                {t("premium.routeRecommendation")}
              </p>
              <p className="mt-1 text-xl font-black text-gray-950">29 + 145</p>
            </div>
            <div className="rounded-2xl bg-orange-50 px-4 py-2 text-right">
              <p className="text-xs font-bold text-brand">{t("premium.savedTime")}</p>
              <p className="text-2xl font-black text-brand">12m</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs font-bold text-gray-600">
            <div className="rounded-2xl bg-gray-50 px-2 py-3">{t("premium.aiShort")}</div>
            <div className="rounded-2xl bg-gray-50 px-2 py-3">{t("premium.alertsShort")}</div>
            <div className="rounded-2xl bg-gray-50 px-2 py-3">{t("premium.plannerShort")}</div>
          </div>
        </div>

        <p className="mt-4 text-sm leading-6 text-white/75">
          {t("premium.dashboardDescription")}
        </p>
      </div>
    </div>
  );
}

function PlanCard({
  badge,
  eyebrow,
  title,
  price,
  description,
  features,
  isHighlighted,
  action,
}: {
  badge?: string;
  eyebrow: string;
  title: string;
  price: string;
  description: string;
  features: Array<{ icon: React.ReactNode; text: string }>;
  isHighlighted?: boolean;
  action?: React.ReactNode;
}) {
  return (
    <article
      className={`rounded-[2rem] border p-5 shadow-sm sm:p-6 ${
        isHighlighted
          ? "border-orange-200 bg-white shadow-orange-100"
          : "border-gray-100 bg-white"
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p
            className={`text-xs font-black uppercase tracking-[0.16em] ${
              isHighlighted ? "text-brand" : "text-gray-500"
            }`}
          >
            {eyebrow}
          </p>
          <h2 className="mt-2 text-2xl font-black text-gray-950">{title}</h2>
          <p className="mt-2 text-sm leading-6 text-gray-600">{description}</p>
        </div>
        <div
          className={`shrink-0 rounded-2xl px-4 py-2 text-right ${
            isHighlighted ? "bg-orange-50 text-brand" : "bg-gray-50 text-gray-700"
          }`}
        >
          <p className="text-xs font-bold uppercase tracking-[0.12em]">
            {badge ?? (isHighlighted ? "Premium" : "Free")}
          </p>
          <p className="text-lg font-black">{price}</p>
        </div>
      </div>

      <div className="mt-6 space-y-3">
        {features.map((feature) => (
          <div key={feature.text} className="flex items-center gap-3 rounded-2xl bg-gray-50 px-4 py-3">
            <div
              className={`flex h-9 w-9 items-center justify-center rounded-xl ${
                isHighlighted ? "bg-orange-100 text-brand" : "bg-white text-gray-500"
              } [&_svg]:h-4 [&_svg]:w-4`}
            >
              {feature.icon}
            </div>
            <p className="text-sm font-bold text-gray-800">{feature.text}</p>
            <Check className="ml-auto h-5 w-5 shrink-0 text-emerald-600" />
          </div>
        ))}
      </div>

      {action}
    </article>
  );
}

function ValueCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <article className="rounded-3xl border border-orange-100 bg-white p-5 shadow-sm">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-50 text-brand [&_svg]:h-5 [&_svg]:w-5">
        {icon}
      </div>
      <h3 className="text-lg font-black text-gray-950">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-gray-600">{description}</p>
    </article>
  );
}
