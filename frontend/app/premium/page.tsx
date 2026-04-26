"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  BellRing,
  Bot,
  CheckCircle2,
  CreditCard,
  Heart,
  Route,
  ShieldCheck,
  Sparkles,
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
} from "@/services/billing";
import { BillingStatus } from "@/types/billing";

export default function PremiumPage() {
  const { t, locale } = useLanguage();
  const { user, isAuthenticated, isLoading, canUseRiderTools } = useAuth();
  const [billingStatus, setBillingStatus] = useState<BillingStatus | null>(null);
  const [isLoadingBilling, setIsLoadingBilling] = useState(false);
  const [isStartingCheckout, setIsStartingCheckout] = useState(false);
  const [isOpeningPortal, setIsOpeningPortal] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canLoadBilling = isAuthenticated && Boolean(user?.id) && canUseRiderTools;

  const formattedPeriodEnd = useMemo(() => {
    if (!billingStatus?.currentPeriodEnd) {
      return null;
    }

    return new Intl.DateTimeFormat(locale === "th" ? "th-TH" : "en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(billingStatus.currentPeriodEnd));
  }, [billingStatus?.currentPeriodEnd, locale]);

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
    void loadBillingStatus();
  }, [loadBillingStatus]);

  const startCheckout = async () => {
    setIsStartingCheckout(true);
    setError(null);

    try {
      const session = await createPremiumCheckoutSession();
      window.location.assign(session.url);
    } catch (checkoutError) {
      setError(
        checkoutError instanceof Error
          ? checkoutError.message
          : t("premium.checkoutError"),
      );
      setIsStartingCheckout(false);
    }
  };

  const openPortal = async () => {
    setIsOpeningPortal(true);
    setError(null);

    try {
      const session = await createCustomerPortalSession();
      window.location.assign(session.url);
    } catch (portalError) {
      setError(
        portalError instanceof Error
          ? portalError.message
          : t("premium.portalError"),
      );
      setIsOpeningPortal(false);
    }
  };

  return (
    <div className="flex min-h-screen w-full flex-col bg-gray-50">
      <AppHeader />

      <div className="flex min-h-[calc(100vh-60px)] flex-1 pt-[60px]">
        <BottomNav />

        <main className="w-full flex-1 pb-24 md:pb-8 md:pl-24">
          <div className="mx-auto flex max-w-5xl flex-col gap-5 px-4 py-5 sm:px-6 md:px-8 md:py-8">
            <section className="overflow-hidden rounded-3xl border border-orange-100 bg-white shadow-sm">
              <div className="grid gap-6 bg-gradient-to-br from-orange-50 via-white to-emerald-50 p-5 sm:p-6 md:grid-cols-[1fr_auto] md:items-center md:p-8">
                <div>
                  <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-brand shadow-sm">
                    <Sparkles className="h-4 w-4" />
                    {t("premium.eyebrow")}
                  </div>
                  <h1 className="text-3xl font-black tracking-tight text-gray-950 sm:text-4xl">
                    {t("premium.title")}
                  </h1>
                  <p className="mt-3 max-w-2xl text-sm leading-6 text-gray-600 sm:text-base">
                    {t("premium.subtitle")}
                  </p>
                </div>

                <div className="rounded-2xl border border-white bg-white/90 px-5 py-4 shadow-sm">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-gray-500">
                    {t("premium.plan")}
                  </p>
                  <p className="mt-1 text-3xl font-black text-gray-950">
                    {t("premium.price")}
                  </p>
                </div>
              </div>
            </section>

            {isLoading ? (
              <StatusCard
                icon={<ShieldCheck className="h-6 w-6" />}
                title={t("common.loading")}
                description={t("premium.loading")}
              />
            ) : !isAuthenticated || !user ? (
              <StatusCard
                icon={<AlertCircle className="h-6 w-6" />}
                title={t("premium.signInTitle")}
                description={t("premium.signInDescription")}
              />
            ) : !canUseRiderTools ? (
              <StatusCard
                icon={<AlertCircle className="h-6 w-6" />}
                title={t("premium.riderOnlyTitle")}
                description={t("premium.riderOnlyDescription")}
              />
            ) : (
              <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
                <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm sm:p-6">
                  <div className="flex items-start gap-4">
                    <div className="rounded-2xl bg-orange-100 p-3 text-brand">
                      <Sparkles className="h-6 w-6" />
                    </div>
                    <div>
                      <h2 className="text-xl font-black text-gray-950">
                        {billingStatus?.isPremium
                          ? t("premium.activeTitle")
                          : t("premium.upgradeTitle")}
                      </h2>
                      <p className="mt-2 text-sm leading-6 text-gray-600">
                        {billingStatus?.isPremium
                          ? t("premium.activeDescription")
                          : t("premium.upgradeDescription")}
                      </p>
                    </div>
                  </div>

                  <div className="mt-6 grid gap-3 sm:grid-cols-2">
                    <PremiumFeature icon={<Bot />} title={t("premium.featureAi")} />
                    <PremiumFeature icon={<BellRing />} title={t("premium.featureAlerts")} />
                    <PremiumFeature icon={<Heart />} title={t("premium.featureFavorites")} />
                    <PremiumFeature icon={<Route />} title={t("premium.featurePlanner")} />
                  </div>

                  {error ? (
                    <div className="mt-5 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
                      {error}
                    </div>
                  ) : null}

                  <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                    {billingStatus?.isPremium ? (
                      <Button
                        type="button"
                        onClick={openPortal}
                        disabled={isOpeningPortal}
                        isLoading={isOpeningPortal}
                        className="h-12 rounded-2xl"
                      >
                        <CreditCard className="mr-2 h-4 w-4" />
                        {t("premium.manageSubscription")}
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        onClick={startCheckout}
                        disabled={isStartingCheckout}
                        isLoading={isStartingCheckout}
                        className="h-12 rounded-2xl"
                      >
                        <Sparkles className="mr-2 h-4 w-4" />
                        {t("premium.startSubscription")}
                      </Button>
                    )}

                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void loadBillingStatus()}
                      disabled={isLoadingBilling}
                      isLoading={isLoadingBilling}
                      className="h-12 rounded-2xl bg-white"
                    >
                      {t("premium.refreshStatus")}
                    </Button>
                  </div>
                </div>

                <aside className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm sm:p-6">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.16em] text-gray-500">
                        {t("premium.statusLabel")}
                      </p>
                      <h3 className="mt-1 text-lg font-black text-gray-950">
                        {getStatusLabel(billingStatus, t)}
                      </h3>
                    </div>
                    <div
                      className={`rounded-2xl p-3 ${
                        billingStatus?.isPremium
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-orange-100 text-brand"
                      }`}
                    >
                      {billingStatus?.isPremium ? (
                        <CheckCircle2 className="h-5 w-5" />
                      ) : (
                        <ShieldCheck className="h-5 w-5" />
                      )}
                    </div>
                  </div>

                  <div className="mt-5 space-y-3 text-sm">
                    <InfoRow
                      label={t("premium.account")}
                      value={user.email ?? user.name ?? t("common.busBuddy")}
                    />
                    <InfoRow
                      label={t("premium.subscription")}
                      value={billingStatus?.status ?? t("premium.none")}
                    />
                    <InfoRow
                      label={t("premium.renews")}
                      value={formattedPeriodEnd ?? t("common.notAvailable")}
                    />
                  </div>

                  {billingStatus?.cancelAtPeriodEnd ? (
                    <div className="mt-5 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                      {t("premium.cancelAtPeriodEnd")}
                    </div>
                  ) : null}
                </aside>
              </section>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

function PremiumFeature({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3">
      <div className="text-brand [&_svg]:h-5 [&_svg]:w-5">{icon}</div>
      <p className="text-sm font-bold text-gray-950">{title}</p>
    </div>
  );
}

function StatusCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <section className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
      <div className="flex items-start gap-4">
        <div className="rounded-2xl bg-orange-100 p-3 text-brand">{icon}</div>
        <div>
          <h2 className="text-lg font-black text-gray-950">{title}</h2>
          <p className="mt-2 text-sm leading-6 text-gray-600">{description}</p>
        </div>
      </div>
    </section>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl bg-gray-50 px-4 py-3">
      <span className="text-gray-500">{label}</span>
      <span className="text-right font-bold text-gray-950">{value}</span>
    </div>
  );
}

function getStatusLabel(
  billingStatus: BillingStatus | null,
  t: (key: string) => string,
) {
  if (!billingStatus) {
    return t("premium.statusUnknown");
  }

  if (billingStatus.isPremium) {
    return t("premium.statusActive");
  }

  if (billingStatus.status === "PAST_DUE") {
    return t("premium.statusPastDue");
  }

  return t("premium.statusFree");
}
