"use client";

import { useCallback, useEffect, useState } from "react";
import { getBillingStatus } from "@/services/billing";
import { BillingStatus } from "@/types/billing";
import { useAuth } from "@/hooks/auth/useAuth";

export function useBillingStatus(enabled = true) {
  const { user, isAuthenticated, isLoading } = useAuth();
  const [billingStatus, setBillingStatus] = useState<BillingStatus | null>(null);
  const [isLoadingBilling, setIsLoadingBilling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canLoadBilling =
    enabled && !isLoading && isAuthenticated && user?.role === "USER";

  const refreshBillingStatus = useCallback(async () => {
    if (!canLoadBilling) {
      setBillingStatus(null);
      setIsLoadingBilling(false);
      return null;
    }

    setIsLoadingBilling(true);
    setError(null);

    try {
      const nextStatus = await getBillingStatus();
      setBillingStatus(nextStatus);
      return nextStatus;
    } catch (statusError) {
      setBillingStatus(null);
      setError(statusError instanceof Error ? statusError.message : "Unable to load billing status.");
      return null;
    } finally {
      setIsLoadingBilling(false);
    }
  }, [canLoadBilling]);

  useEffect(() => {
    void refreshBillingStatus();
  }, [refreshBillingStatus]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleBillingUpdate = () => {
      void refreshBillingStatus();
    };

    window.addEventListener("busbuddy.billing.updated", handleBillingUpdate);
    return () => {
      window.removeEventListener("busbuddy.billing.updated", handleBillingUpdate);
    };
  }, [refreshBillingStatus]);

  return {
    billingStatus,
    isBillingLoading: isLoadingBilling || (enabled && isLoading),
    billingError: error,
    isPremium: Boolean(billingStatus?.isPremium),
    refreshBillingStatus,
  };
}
