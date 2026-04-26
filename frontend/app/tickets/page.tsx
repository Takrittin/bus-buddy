"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { loadStripe, Stripe } from "@stripe/stripe-js";
import { AlertCircle, CheckCircle2, Clock3, CreditCard, QrCode, RefreshCw, Ticket } from "lucide-react";
import { AppHeader } from "@/components/navigation/AppHeader";
import { BottomNav } from "@/components/navigation/BottomNav";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/hooks/auth/useAuth";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { createPromptPayTicketPayment, getTicketOrder } from "@/services/payments";
import { TicketOrder, TicketOrderStatus } from "@/types/payments";

const stripeLoaders = new Map<string, Promise<Stripe | null>>();
const TERMINAL_STATUSES = new Set<TicketOrderStatus>(["PAID", "FAILED", "CANCELED"]);

function getStripe(publishableKey: string) {
  const existingLoader = stripeLoaders.get(publishableKey);

  if (existingLoader) {
    return existingLoader;
  }

  const loader = loadStripe(publishableKey);
  stripeLoaders.set(publishableKey, loader);
  return loader;
}

export default function TicketsPage() {
  const { t, locale } = useLanguage();
  const { user, isAuthenticated, isLoading, canUseRiderTools } = useAuth();
  const [order, setOrder] = useState<TicketOrder | null>(null);
  const [paymentIntentStatus, setPaymentIntentStatus] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isOrderTerminal = order ? TERMINAL_STATUSES.has(order.status) : false;
  const validUntil = useMemo(() => {
    if (!order?.ticket?.validUntil) {
      return null;
    }

    return new Intl.DateTimeFormat(locale === "th" ? "th-TH" : "en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(order.ticket.validUntil));
  }, [locale, order?.ticket?.validUntil]);

  const refreshOrder = useCallback(async () => {
    if (!order?.id) {
      return;
    }

    setIsRefreshing(true);

    try {
      const nextOrder = await getTicketOrder(order.id);
      setOrder(nextOrder);
    } catch (refreshError) {
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : t("tickets.refreshError"),
      );
    } finally {
      setIsRefreshing(false);
    }
  }, [order?.id, t]);

  useEffect(() => {
    if (!order?.id || isOrderTerminal) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void refreshOrder();
    }, 5000);

    return () => window.clearInterval(intervalId);
  }, [isOrderTerminal, order?.id, refreshOrder]);

  const handlePromptPayPayment = async () => {
    setError(null);
    setPaymentIntentStatus(null);
    setIsCreating(true);

    try {
      const payment = await createPromptPayTicketPayment("SINGLE_RIDE");
      setOrder(payment);
      setIsCreating(false);

      if (!payment.clientSecret) {
        throw new Error(t("tickets.missingClientSecret"));
      }

      const stripe = await getStripe(payment.publishableKey);

      if (!stripe) {
        throw new Error(t("tickets.stripeLoadError"));
      }

      setIsConfirming(true);
      const result = await stripe.confirmPromptPayPayment(payment.clientSecret, {
        payment_method: {
          billing_details: {
            email: user?.email ?? payment.customerEmail ?? undefined,
          },
        },
      });

      if (result.error) {
        setError(result.error.message ?? t("tickets.paymentError"));
      }

      if (result.paymentIntent) {
        setPaymentIntentStatus(result.paymentIntent.status);
      }

      const nextOrder = await getTicketOrder(payment.id);
      setOrder(nextOrder);
    } catch (paymentError) {
      setError(
        paymentError instanceof Error
          ? paymentError.message
          : t("tickets.paymentError"),
      );
    } finally {
      setIsCreating(false);
      setIsConfirming(false);
    }
  };

  const statusMeta = getStatusMeta(order?.status, t);

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
                    <QrCode className="h-4 w-4" />
                    {t("tickets.promptPay")}
                  </div>
                  <h1 className="text-3xl font-black tracking-tight text-gray-950 sm:text-4xl">
                    {t("tickets.title")}
                  </h1>
                  <p className="mt-3 max-w-2xl text-sm leading-6 text-gray-600 sm:text-base">
                    {t("tickets.subtitle")}
                  </p>
                </div>

                <div className="rounded-2xl border border-white bg-white/90 px-5 py-4 shadow-sm">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-gray-500">
                    {t("tickets.singleRide")}
                  </p>
                  <p className="mt-1 text-3xl font-black text-gray-950">
                    {order?.amountDisplay ?? "฿25.00"}
                  </p>
                </div>
              </div>
            </section>

            {isLoading ? (
              <section className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
                <p className="text-sm text-gray-500">{t("common.loading")}</p>
              </section>
            ) : !isAuthenticated || !user ? (
              <AccessState
                icon={<AlertCircle className="h-6 w-6" />}
                title={t("tickets.signInTitle")}
                description={t("tickets.signInDescription")}
              />
            ) : !canUseRiderTools ? (
              <AccessState
                icon={<AlertCircle className="h-6 w-6" />}
                title={t("tickets.riderOnlyTitle")}
                description={t("tickets.riderOnlyDescription")}
              />
            ) : (
              <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
                <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm sm:p-6">
                  <div className="flex items-start gap-4">
                    <div className="rounded-2xl bg-orange-100 p-3 text-brand">
                      <Ticket className="h-6 w-6" />
                    </div>
                    <div>
                      <h2 className="text-xl font-black text-gray-950">
                        {t("tickets.singleRide")}
                      </h2>
                      <p className="mt-2 text-sm leading-6 text-gray-600">
                        {t("tickets.singleRideDescription")}
                      </p>
                    </div>
                  </div>

                  <div className="mt-6 grid gap-3 sm:grid-cols-3">
                    <TicketFact label={t("tickets.fare")} value={order?.amountDisplay ?? "฿25.00"} />
                    <TicketFact label={t("tickets.method")} value={t("tickets.promptPayQr")} />
                    <TicketFact label={t("tickets.validity")} value={t("tickets.validityValue")} />
                  </div>

                  {error ? (
                    <div className="mt-5 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
                      {error}
                    </div>
                  ) : null}

                  <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                    <Button
                      type="button"
                      onClick={handlePromptPayPayment}
                      disabled={isCreating || isConfirming}
                      isLoading={isCreating || isConfirming}
                      className="h-12 rounded-2xl"
                    >
                      <QrCode className="mr-2 h-4 w-4" />
                      {isConfirming ? t("tickets.awaitingScan") : t("tickets.payWithPromptPay")}
                    </Button>

                    {order ? (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => void refreshOrder()}
                        disabled={isRefreshing}
                        isLoading={isRefreshing}
                        className="h-12 rounded-2xl bg-white"
                      >
                        <RefreshCw className="mr-2 h-4 w-4" />
                        {t("tickets.refreshStatus")}
                      </Button>
                    ) : null}
                  </div>
                </div>

                <aside className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm sm:p-6">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.16em] text-gray-500">
                        {t("tickets.orderStatus")}
                      </p>
                      <h3 className="mt-1 text-lg font-black text-gray-950">
                        {statusMeta.label}
                      </h3>
                    </div>
                    <div className={`rounded-2xl p-3 ${statusMeta.iconClass}`}>
                      {statusMeta.icon}
                    </div>
                  </div>

                  {order ? (
                    <div className="mt-5 space-y-3 text-sm">
                      <InfoRow label={t("tickets.orderId")} value={order.id.slice(0, 8).toUpperCase()} />
                      <InfoRow label={t("tickets.amount")} value={order.amountDisplay} />
                      <InfoRow
                        label={t("tickets.stripeStatus")}
                        value={order.stripePaymentStatus ?? paymentIntentStatus ?? t("common.notAvailable")}
                      />
                    </div>
                  ) : (
                    <p className="mt-5 text-sm leading-6 text-gray-500">
                      {t("tickets.noOrder")}
                    </p>
                  )}

                  {order?.ticket ? (
                    <div className="mt-5 rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
                      <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">
                        {t("tickets.activeTicket")}
                      </p>
                      <p className="mt-2 font-mono text-2xl font-black text-emerald-950">
                        {order.ticket.displayCode}
                      </p>
                      <p className="mt-2 text-sm text-emerald-800">
                        {validUntil ? t("tickets.validUntil", { time: validUntil }) : null}
                      </p>
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

function AccessState({
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

function TicketFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-gray-500">{label}</p>
      <p className="mt-1 text-sm font-bold text-gray-950">{value}</p>
    </div>
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

function getStatusMeta(status: TicketOrderStatus | undefined, t: (key: string) => string) {
  if (status === "PAID") {
    return {
      label: t("tickets.statusPaid"),
      icon: <CheckCircle2 className="h-5 w-5" />,
      iconClass: "bg-emerald-100 text-emerald-700",
    };
  }

  if (status === "FAILED" || status === "CANCELED") {
    return {
      label: t("tickets.statusFailed"),
      icon: <AlertCircle className="h-5 w-5" />,
      iconClass: "bg-red-100 text-red-700",
    };
  }

  if (status === "PROCESSING" || status === "REQUIRES_ACTION") {
    return {
      label: t("tickets.statusPending"),
      icon: <Clock3 className="h-5 w-5" />,
      iconClass: "bg-amber-100 text-amber-700",
    };
  }

  return {
    label: t("tickets.statusReady"),
    icon: <CreditCard className="h-5 w-5" />,
    iconClass: "bg-orange-100 text-brand",
  };
}
